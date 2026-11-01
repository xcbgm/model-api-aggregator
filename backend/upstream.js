/**
 * 上游模型拉取 + 代理请求工具
 */
const http = require('http');
const https = require('https');
const { URL } = require('url');

function joinUrl(base, p) {
  return base.replace(/\/+$/, '') + '/' + p.replace(/^\/+/, '');
}

/**
 * 发起 HTTP 请求（不依赖第三方库，避免沙箱/证书问题）
 */
function request(urlStr, { method = 'GET', headers = {}, body = null, timeout = 60000 } = {}) {
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
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}),
          ...headers,
        },
        timeout,
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode, headers: res.headers, text });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('上游请求超时')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/**
 * 从上游拉取可用模型列表
 * 兼容 OpenAI (GET /v1/models) 及常见格式
 */
async function fetchUpstreamModels({ base_url, api_key, protocol = 'openai' }) {
  const headers = { Authorization: `Bearer ${api_key}` };
  if (protocol === 'anthropic') {
    headers['x-api-key'] = api_key;
    headers['anthropic-version'] = '2023-06-01';
  }
  const paths = ['/v1/models', '/models'];
  let lastErr = null;
  for (const p of paths) {
    const url = joinUrl(base_url, p);
    try {
      const r = await request(url, { headers, timeout: 20000 });
      if (r.status >= 200 && r.status < 300) {
        let json;
        try {
          json = JSON.parse(r.text);
        } catch (e) {
          lastErr = new Error('上游返回内容不是合法 JSON');
          continue;
        }
        const list = json.data || json.models || json.result || (Array.isArray(json) ? json : []);
        if (!Array.isArray(list)) {
          lastErr = new Error('无法识别上游模型列表格式');
          continue;
        }
        return list.map((m) => {
          if (typeof m === 'string') return { id: m, owned_by: '' };
          return { ...m, id: m.id || m.model || m.name, owned_by: m.owned_by || m.owner || '' };
        }).filter((m) => m.id);
      }
      lastErr = new Error(`上游返回状态码 ${r.status}: ${r.text.slice(0, 200)}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('拉取失败');
}

module.exports = { request, joinUrl, fetchUpstreamModels };
