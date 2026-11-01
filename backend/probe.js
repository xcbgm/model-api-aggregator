/**
 * 模型在线探测：延迟 / 首 token / 在线状态，以及上游模型能力元数据解析。
 * - probeModel(): 真实发起一次最小 chat 请求，测量总延迟与首字延迟(TTFT)
 * - probeBatch(): 并发探测多个模型
 * - extractCapabilities(): 从上游模型元数据中解析上下文长度、最大输出、输入类型、推理强度
 */
const http = require('http');
const https = require('https');
const { URL } = require('url');

/* ---------------- 原始流式请求（支持 SSE） ---------------- */
function rawStream(urlStr, { method = 'GET', headers = {}, body = null, timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(urlStr);
    } catch (e) {
      return reject(new Error('地址格式不正确: ' + urlStr));
    }
    const lib = u.protocol === 'https:' ? https : http;
    const data = body ? Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': data.length } : {}),
          ...headers,
        },
        timeout,
        rejectUnauthorized: false,
      },
      (res) => {
        let firstAt = 0;
        let buf = '';
        let finished = false;
        const done = () => {
          if (finished) return;
          finished = true;
          resolve({ status: res.statusCode, headers: res.headers, text: buf, firstAt });
        };
        res.on('data', (c) => {
          if (!firstAt) firstAt = Date.now();
          buf += c.toString('utf8');
        });
        res.on('end', () => done());
        res.on('error', () => done());
      }
    );
    req.on('timeout', () => req.destroy(new Error('探测超时')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function joinUrl(base, p) {
  // 智能处理：如果 base 已经包含 /v1，且 p 也以 /v1 开头，则避免重复
  const baseClean = base.replace(/\/+$/, '');
  const pClean = p.replace(/^\/+/, '');
  if (baseClean.endsWith('/v1') && pClean.startsWith('v1/')) {
    // base 已含 /v1，p 去掉 v1 前缀
    return baseClean + '/' + pClean.replace(/^v1\//, '');
  }
  return baseClean + '/' + pClean;
}

/* ---------------- 模型类型/端点自动识别 ---------------- */
// 根据上游返回的错误提示、模型名推断正确的端点与类型
function detectEndpoint(errMsg = '', name = '') {
  const e = (errMsg || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (e.includes('/v1/ocr') || e.includes('ocr') || n.includes('ocr') || n.includes('mineru')) return { type: 'ocr', path: '/v1/ocr' };
  if (e.includes('/v1/audio/speech') || e.includes('audio/speech') || n.includes('omnivoice') || n.includes('tts')) return { type: 'audio', path: '/v1/audio/speech' };
  if (e.includes('/v1/audio/transcriptions') || n.includes('whisper') || n.includes('asr')) return { type: 'audio', path: '/v1/audio/transcriptions' };
  if (e.includes('/v1/embeddings') || n.includes('embedding') || n.includes('bge') || n.includes('m3e')) return { type: 'embedding', path: '/v1/embeddings' };
  if (e.includes('/v1/images') || n.includes('dall-e') || n.includes('stable-diffusion') || n.includes('image')) return { type: 'image', path: '/v1/images/generations' };
  return { type: 'chat', path: '/v1/chat/completions' };
}

/* ---------------- 单模型探测 ---------------- */
async function probeModel({ base_url, api_key, protocol = 'openai', name, timeout = 20000 }) {
  const t0 = Date.now();
  const headers = { Authorization: `Bearer ${api_key}` };
  if (protocol === 'anthropic') {
    headers['x-api-key'] = api_key;
    headers['anthropic-version'] = '2023-06-01';
    delete headers.Authorization;
  }

  const isAnthropic = protocol === 'anthropic';
  const path = isAnthropic ? '/v1/messages' : '/v1/chat/completions';
  const payload = isAnthropic
    ? { model: name, max_tokens: 16, stream: true, messages: [{ role: 'user', content: 'hi' }] }
    : { model: name, max_tokens: 16, stream: true, messages: [{ role: 'user', content: 'hi' }] };

  try {
    const r = await rawStream(joinUrl(base_url, path), {
      method: 'POST',
      headers,
      body: payload,
      timeout,
    });
    const totalMs = Date.now() - t0;
    const ok = r.status >= 200 && r.status < 300;
    let ttft = r.firstAt ? r.firstAt - t0 : totalMs;
    if (!ok) {
      let msg = `上游状态码 ${r.status}`;
      try {
        const j = JSON.parse(r.text);
        msg = j.error?.message || j.message || msg;
      } catch (e) { /* ignore */ }
      // 若错误提示指向其他端点，尝试用正确端点重试（非 chat 模型）
      const det = detectEndpoint(msg, name);
      if (det.type !== 'chat') {
        const retry = await probeWithEndpoint({ base_url, headers, name, endpoint: det.path, timeout, t0 });
        if (retry.online) return { ...retry, detected_type: det.type, detected_endpoint: det.path };
        return { online: false, latency_ms: totalMs, ttft_ms: null, error: msg.slice(0, 200), detected_type: det.type, detected_endpoint: det.path };
      }
      return { online: false, latency_ms: totalMs, ttft_ms: null, error: msg.slice(0, 200), detected_type: 'chat', detected_endpoint: path };
    }
    return { online: true, latency_ms: totalMs, ttft_ms: ttft, error: null, detected_type: isAnthropic ? 'chat' : 'chat', detected_endpoint: path };
  } catch (e) {
    return { online: false, latency_ms: Date.now() - t0, ttft_ms: null, error: (e.message || '探测失败').slice(0, 200), detected_type: 'chat', detected_endpoint: path };
  }
}

// 用识别出的端点重试探测（embeddings/ocr/audio 等）
async function probeWithEndpoint({ base_url, headers, name, endpoint, timeout, t0 }) {
  let payload;
  if (endpoint.includes('embeddings')) payload = { model: name, input: 'hi' };
  else if (endpoint.includes('images')) payload = { model: name, prompt: 'hi', n: 1, size: '256x256' };
  else if (endpoint.includes('audio')) payload = { model: name, input: 'hi' };
  else payload = { model: name, prompt: 'hi', max_tokens: 16 };
  try {
    const r = await rawStream(joinUrl(base_url, endpoint), { method: 'POST', headers, body: payload, timeout });
    const totalMs = Date.now() - t0;
    const ok = r.status >= 200 && r.status < 300;
    if (ok) return { online: true, latency_ms: totalMs, ttft_ms: r.firstAt ? r.firstAt - t0 : totalMs, error: null };
    let msg = `上游状态码 ${r.status}`;
    try { const j = JSON.parse(r.text); msg = j.error?.message || j.message || msg; } catch (e) { /* ignore */ }
    return { online: false, latency_ms: totalMs, ttft_ms: null, error: msg.slice(0, 200) };
  } catch (e) {
    return { online: false, latency_ms: Date.now() - t0, ttft_ms: null, error: (e.message || '失败').slice(0, 200) };
  }
}

/* ---------------- 批量探测（有限并发） ---------------- */
async function probeBatch(models, { concurrency = 5 } = {}) {
  const results = new Array(models.length);
  let idx = 0;
  async function worker() {
    while (idx < models.length) {
      const i = idx++;
      results[i] = await probeModel(models[i]);
    }
  }
  const n = Math.min(concurrency, models.length);
  await Promise.all(Array.from({ length: n }, worker));
  return results;
}

/* ---------------- 上游能力元数据解析 ---------------- */
function pickNumber(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.round(v);
    if (typeof v === 'string' && /^\d+$/.test(v)) return parseInt(v, 10);
  }
  return 0;
}

function detectInputModes(obj) {
  const modes = new Set();
  const text = obj?.input_modalities || obj?.inputModalities || obj?.modality || obj?.supported_features;
  if (Array.isArray(text)) {
    text.forEach((m) => {
      const s = String(m).toLowerCase();
      if (s.includes('text')) modes.add('text');
      if (s.includes('image') || s.includes('vision')) modes.add('image');
      if (s.includes('audio')) modes.add('audio');
      if (s.includes('video')) modes.add('video');
    });
  } else if (typeof text === 'string') {
    const s = text.toLowerCase();
    if (s.includes('text')) modes.add('text');
    if (s.includes('image') || s.includes('vision')) modes.add('image');
    if (s.includes('audio')) modes.add('audio');
  }
  // 结构化布尔字段
  if (obj?.supports_vision || obj?.vision || obj?.image_input) modes.add('image');
  if (obj?.supports_audio || obj?.audio_input) modes.add('audio');
  if (obj?.supports_video || obj?.video_input) modes.add('video');
  if (obj?.supports_image_input) modes.add('image');
  if (modes.size === 0) modes.add('text');
  return Array.from(modes);
}

function detectReasoning(obj) {
  const keys = [
    'reasoning', 'reasoning_enabled', 'supports_reasoning', 'is_reasoning',
    'reasoning_model', 'supports_thinking', 'thinking', 'adaptive_reasoning',
  ];
  for (const k of keys) {
    const v = obj?.[k];
    if (v === true) return 1;
    if (v === false) return 0;
    if (typeof v === 'string') {
      const s = v.toLowerCase();
      if (['true', 'yes', '1', 'supported', 'enabled'].includes(s)) return 1;
      if (['false', 'no', '0', 'unsupported', 'disabled'].includes(s)) return 0;
    }
  }
  // 名称启发式（DeepSeek-R1、QwQ、o1/o3、GLM-4-Flash-Thinking 等）
  return 0;
}

function nameSuggestsReasoning(name = '') {
  return /(-r1|qwq|o1\b|o3\b|o4\b|thinking|reasoner|reasoning|deepseek-r)/i.test(name);
}

/**
 * 从上游模型对象解析能力信息。
 * 传入的 obj 是 fetchUpstreamModels 返回项（可能包含原始上游字段）。
 */
function extractCapabilities(obj = {}) {
  const name = obj.id || obj.model || obj.name || '';
  const context =
    pickNumber(obj, ['context_length', 'contextLength', 'max_context_tokens', 'maxContextTokens', 'max_input_tokens', 'context_window', 'contextWindow', 'max_tokens_limit']) ||
    pickNumber(obj.limits, ['context_length', 'max_tokens']) ||
    0;
  const maxOutput =
    pickNumber(obj, ['max_output_tokens', 'maxOutputTokens', 'max_completion_tokens', 'max_completion_tokens_tokens', 'max_tokens', 'maxTokens']) || 0;
  const inputModes = detectInputModes(obj);
  let reasoning = detectReasoning(obj);
  if (!reasoning && nameSuggestsReasoning(name)) reasoning = 1;
  return {
    context_length: context,
    max_output_tokens: maxOutput,
    input_modes: inputModes.join(','),
    reasoning_enabled: reasoning,
  };
}

module.exports = { probeModel, probeBatch, extractCapabilities, detectEndpoint, rawStream, joinUrl };
