const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { all, get, run } = require('./db');
const { sign, auth, adminOnly } = require('./auth');
const { request, joinUrl, fetchUpstreamModels } = require('./upstream');
const { probeModel, probeBatch, extractCapabilities } = require('./probe');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const ok = (res, data) => res.json({ success: true, data });
const fail = (res, code, msg) => res.status(code).json({ success: false, error: msg });

/* ============================ 认证 ============================ */
app.post('/api/auth/register', (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !password) return fail(res, 400, '用户名和密码不能为空');
  if (String(username).length < 3) return fail(res, 400, '用户名至少 3 个字符');
  if (String(password).length < 6) return fail(res, 400, '密码至少 6 位');
  if (get('SELECT id FROM users WHERE username = ?', username)) return fail(res, 400, '用户名已存在');
  const r = run(
    'INSERT INTO users (username, email, password_hash, role, balance) VALUES (?,?,?,?,?)',
    username, email || null, bcrypt.hashSync(String(password), 10), 'user', 0
  );
  const user = get('SELECT id, username, email, role, balance FROM users WHERE id = ?', r.lastInsertRowid);
  ok(res, { token: sign(user), user });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = get('SELECT * FROM users WHERE username = ?', username || '');
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash))
    return fail(res, 401, '用户名或密码错误');
  if (!user.status) return fail(res, 403, '账号已被禁用');
  const safe = { id: user.id, username: user.username, email: user.email, role: user.role, balance: user.balance };
  ok(res, { token: sign(safe), user: safe });
});

app.get('/api/auth/me', auth, (req, res) => ok(res, req.user));

app.post('/api/auth/password', auth, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 6) return fail(res, 400, '新密码至少 6 位');
  const u = get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!bcrypt.compareSync(String(oldPassword || ''), u.password_hash)) return fail(res, 400, '原密码错误');
  run('UPDATE users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(String(newPassword), 10), req.user.id);
  ok(res, { message: '密码已修改' });
});

/* ============================ 厂商 ============================ */
app.get('/api/vendors', auth, adminOnly, (req, res) => {
  const rows = all('SELECT * FROM vendors ORDER BY id DESC').map((v) => ({
    ...v,
    api_key_masked: v.api_key ? v.api_key.slice(0, 6) + '****' + v.api_key.slice(-4) : '',
    model_count: get('SELECT COUNT(*) c FROM models WHERE vendor_id = ?', v.id).c,
    api_key: undefined,
  }));
  ok(res, rows);
});

app.post('/api/vendors', auth, adminOnly, (req, res) => {
  const { name, base_url, api_key, protocol, remark } = req.body || {};
  if (!name || !base_url || !api_key) return fail(res, 400, '名称、地址、密钥均不能为空');
  if (!/^https?:\/\//i.test(base_url)) return fail(res, 400, '地址需以 http:// 或 https:// 开头');
  const r = run(
    'INSERT INTO vendors (name, base_url, api_key, protocol, remark) VALUES (?,?,?,?,?)',
    name, base_url.replace(/\/+$/, ''), api_key, protocol || 'openai', remark || ''
  );
  ok(res, { id: r.lastInsertRowid });
});

app.put('/api/vendors/:id', auth, adminOnly, (req, res) => {
  const v = get('SELECT * FROM vendors WHERE id = ?', req.params.id);
  if (!v) return fail(res, 404, '厂商不存在');
  const { name, base_url, api_key, protocol, remark, status } = req.body || {};
  run(
    `UPDATE vendors SET name=?, base_url=?, api_key=?, protocol=?, remark=?, status=? WHERE id=?`,
    name ?? v.name,
    (base_url ?? v.base_url).replace(/\/+$/, ''),
    api_key && !String(api_key).includes('****') ? api_key : v.api_key,
    protocol ?? v.protocol,
    remark ?? v.remark,
    status === undefined ? v.status : status,
    v.id
  );
  ok(res, { message: '已更新' });
});

app.delete('/api/vendors/:id', auth, adminOnly, (req, res) => {
  run('DELETE FROM vendors WHERE id = ?', req.params.id);
  ok(res, { message: '已删除' });
});

// 从上游拉取可用模型
app.post('/api/vendors/fetch-models', auth, adminOnly, async (req, res) => {
  let { base_url, api_key, protocol, vendor_id } = req.body || {};
  if (vendor_id) {
    const v = get('SELECT * FROM vendors WHERE id = ?', vendor_id);
    if (!v) return fail(res, 404, '厂商不存在');
    base_url = base_url || v.base_url;
    api_key = api_key && !String(api_key).includes('****') ? api_key : v.api_key;
    protocol = protocol || v.protocol;
  }
  if (!base_url || !api_key) return fail(res, 400, '请填写地址和密钥');
  try {
    const list = await fetchUpstreamModels({ base_url, api_key, protocol });
    // 标记是否已添加，并解析能力信息（上下文/输出上限/输入类型/推理强度）
    const owned = vendor_id ? new Set(all('SELECT name FROM models WHERE vendor_id = ?', vendor_id).map((m) => m.name)) : new Set();
    list.forEach((m) => {
      m.added = owned.has(m.id);
      Object.assign(m, extractCapabilities(m));
    });
    ok(res, { count: list.length, models: list });
  } catch (e) {
    fail(res, 502, '拉取失败：' + e.message);
  }
});

app.post('/api/vendors/:id/test', auth, adminOnly, async (req, res) => {
  const v = get('SELECT * FROM vendors WHERE id = ?', req.params.id);
  if (!v) return fail(res, 404, '厂商不存在');
  const t = Date.now();
  try {
    const list = await fetchUpstreamModels(v);
    ok(res, { ok: true, latency: Date.now() - t, count: list.length });
  } catch (e) {
    fail(res, 502, '连接失败：' + e.message);
  }
});

/* ============================ 分组 ============================ */
app.get('/api/groups', auth, (req, res) => {
  const rows = all(`SELECT g.*, (SELECT COUNT(*) FROM models m WHERE m.group_id = g.id) AS model_count
                    FROM groups g ORDER BY g.id ASC`);
  ok(res, rows);
});

app.post('/api/groups', auth, adminOnly, (req, res) => {
  const { name, description, ratio } = req.body || {};
  if (!name) return fail(res, 400, '分组名称不能为空');
  if (get('SELECT id FROM groups WHERE name = ?', name)) return fail(res, 400, '分组名称已存在（分组需去重）');
  const r = run('INSERT INTO groups (name, description, ratio) VALUES (?,?,?)', name, description || '', Number(ratio) || 1);
  ok(res, { id: r.lastInsertRowid });
});

app.put('/api/groups/:id', auth, adminOnly, (req, res) => {
  const g = get('SELECT * FROM groups WHERE id = ?', req.params.id);
  if (!g) return fail(res, 404, '分组不存在');
  const { name, description, ratio } = req.body || {};
  if (name && name !== g.name && get('SELECT id FROM groups WHERE name = ?', name))
    return fail(res, 400, '分组名称已存在');
  run('UPDATE groups SET name=?, description=?, ratio=? WHERE id=?',
    name ?? g.name, description ?? g.description, ratio === undefined ? g.ratio : Number(ratio), g.id);
  ok(res, { message: '已更新' });
});

app.delete('/api/groups/:id', auth, adminOnly, (req, res) => {
  run('DELETE FROM groups WHERE id = ?', req.params.id);
  ok(res, { message: '已删除' });
});

/* ============================ 模型 ============================ */
app.get('/api/models', auth, (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const rows = all(`
    SELECT m.*, v.name AS vendor_name, v.base_url, g.name AS group_name, g.ratio AS group_ratio
    FROM models m
    JOIN vendors v ON v.id = m.vendor_id
    LEFT JOIN groups g ON g.id = m.group_id
    ORDER BY m.id DESC`);
  ok(res, rows.map((m) => ({ ...m, base_url: isAdmin ? m.base_url : undefined })));
});

/* ---------- 模型在线探测：延迟 / 首token / 在线状态 ---------- */
function probeTarget(m) {
  const v = get('SELECT base_url, api_key, protocol FROM vendors WHERE id = ?', m.vendor_id);
  if (!v) return null;
  return { base_url: v.base_url, api_key: v.api_key, protocol: v.protocol, name: m.name };
}

app.post('/api/models/probe', auth, adminOnly, async (req, res) => {
  const { id, ids } = req.body || {};
  let list = [];
  if (Array.isArray(ids) && ids.length) {
    list = ids.map((i) => get('SELECT * FROM models WHERE id = ?', i)).filter(Boolean);
  } else if (id) {
    const m = get('SELECT * FROM models WHERE id = ?', id);
    if (m) list = [m];
  }
  if (!list.length) return fail(res, 400, '请选择要探测的模型');

  const targets = list.map((m) => ({ m, t: probeTarget(m) })).filter((x) => x.t);
  const results = await probeBatch(targets.map((x) => x.t), { concurrency: 5 });

  const now = new Date().toISOString();
  const out = targets.map((x, i) => {
    const r = results[i];
    run('UPDATE models SET probe_online=?, probe_latency_ms=?, probe_ttft_ms=?, probe_at=? WHERE id=?',
      r.online ? 1 : 0, r.latency_ms, r.ttft_ms ?? null, now, x.m.id);
    return { id: x.m.id, name: x.m.name, ...r };
  });
  ok(res, out);
});

app.post('/api/models/probe-batch', auth, adminOnly, async (req, res) => {
  const list = all('SELECT * FROM models WHERE status = 1');
  if (!list.length) return ok(res, { total: 0, online: 0, results: [] });
  const targets = list.map((m) => ({ m, t: probeTarget(m) })).filter((x) => x.t);
  const results = await probeBatch(targets.map((x) => x.t), { concurrency: 5 });
  const now = new Date().toISOString();
  let online = 0;
  targets.forEach((x, i) => {
    const r = results[i];
    if (r.online) online++;
    run('UPDATE models SET probe_online=?, probe_latency_ms=?, probe_ttft_ms=?, probe_at=? WHERE id=?',
      r.online ? 1 : 0, r.latency_ms, r.ttft_ms ?? null, now, x.m.id);
  });
  ok(res, { total: targets.length, online, at: now });
});

// 模型广场（所有登录用户）
app.get('/api/marketplace', auth, (req, res) => {
  const rows = all(`
    SELECT m.id, m.name, m.display_name, m.description, m.model_type, m.input_price, m.output_price, m.fixed_price,
           m.status, m.context_length, m.max_output_tokens, m.input_modes, m.reasoning_enabled,
           m.probe_online, m.probe_latency_ms, m.probe_ttft_ms, m.probe_at,
           v.name AS vendor_name, g.name AS group_name, g.ratio AS group_ratio
    FROM models m
    JOIN vendors v ON v.id = m.vendor_id
    LEFT JOIN groups g ON g.id = m.group_id
    WHERE m.status = 1
    ORDER BY g.name, m.name`);
  ok(res, rows);
});

app.post('/api/models', auth, adminOnly, (req, res) => {
  const { vendor_id, name, display_name, group_id, input_price, output_price, fixed_price, model_type, description,
    context_length, max_output_tokens, input_modes, reasoning_enabled } = req.body || {};
  if (!vendor_id || !name) return fail(res, 400, '厂商和模型名称不能为空');
  if (!get('SELECT id FROM vendors WHERE id = ?', vendor_id)) return fail(res, 400, '厂商不存在');
  if (get('SELECT id FROM models WHERE vendor_id = ? AND name = ?', vendor_id, name))
    return fail(res, 400, '该厂商下已存在同名模型');
  // 一个模型只能分配一个分组（唯一约束）
  if (group_id && !get('SELECT id FROM groups WHERE id = ?', group_id)) return fail(res, 400, '分组不存在');
  const r = run(
    `INSERT INTO models (vendor_id, name, display_name, group_id, input_price, output_price, fixed_price, model_type, description,
      context_length, max_output_tokens, input_modes, reasoning_enabled)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    vendor_id, name, display_name || name, group_id || null,
    Number(input_price) || 0, Number(output_price) || 0, Number(fixed_price) || 0,
    model_type || 'chat', description || '',
    Number(context_length) || 0, Number(max_output_tokens) || 0,
    input_modes || 'text', reasoning_enabled ? 1 : 0
  );
  ok(res, { id: r.lastInsertRowid });
});

// 批量导入上游模型
app.post('/api/models/batch', auth, adminOnly, (req, res) => {
  const { vendor_id, models, group_id, input_price, output_price } = req.body || {};
  if (!vendor_id || !Array.isArray(models) || models.length === 0) return fail(res, 400, '参数不完整');
  let added = 0, skipped = 0;
  for (const m of models) {
    // m 可能是字符串，也可能是携带能力信息的对象
    const o = typeof m === 'string' ? { name: m } : (m.id || m.name ? m : { name: '' });
    const name = o.id || o.name || '';
    if (!name) continue;
    if (get('SELECT id FROM models WHERE vendor_id = ? AND name = ?', vendor_id, name)) { skipped++; continue; }
    const cap = extractCapabilities(o);
    run(`INSERT INTO models (vendor_id, name, display_name, group_id, input_price, output_price, model_type,
         context_length, max_output_tokens, input_modes, reasoning_enabled)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      vendor_id, name, name, group_id || null, Number(input_price) || 0, Number(output_price) || 0, o.model_type || 'chat',
      cap.context_length, cap.max_output_tokens, cap.input_modes, cap.reasoning_enabled);
    added++;
  }
  ok(res, { added, skipped });
});

app.put('/api/models/:id', auth, adminOnly, (req, res) => {
  const m = get('SELECT * FROM models WHERE id = ?', req.params.id);
  if (!m) return fail(res, 404, '模型不存在');
  const b = req.body || {};
  run(
    `UPDATE models SET display_name=?, group_id=?, input_price=?, output_price=?, fixed_price=?,
       model_type=?, status=?, description=?, context_length=?, max_output_tokens=?, input_modes=?, reasoning_enabled=? WHERE id=?`,
    b.display_name ?? m.display_name,
    b.group_id === undefined ? m.group_id : (b.group_id || null),
    b.input_price === undefined ? m.input_price : Number(b.input_price),
    b.output_price === undefined ? m.output_price : Number(b.output_price),
    b.fixed_price === undefined ? m.fixed_price : Number(b.fixed_price),
    b.model_type ?? m.model_type,
    b.status === undefined ? m.status : Number(b.status),
    b.description ?? m.description,
    b.context_length === undefined ? m.context_length : Number(b.context_length) || 0,
    b.max_output_tokens === undefined ? m.max_output_tokens : Number(b.max_output_tokens) || 0,
    b.input_modes ?? m.input_modes,
    b.reasoning_enabled === undefined ? m.reasoning_enabled : (b.reasoning_enabled ? 1 : 0),
    m.id
  );
  ok(res, { message: '已更新' });
});

app.delete('/api/models/:id', auth, adminOnly, (req, res) => {
  run('DELETE FROM models WHERE id = ?', req.params.id);
  ok(res, { message: '已删除' });
});

/* ============================ API Key ============================ */
app.get('/api/keys', auth, (req, res) => {
  ok(res, all('SELECT * FROM api_keys WHERE user_id = ? ORDER BY id DESC', req.user.id).map((k) => ({
    ...k, key: k.key.slice(0, 10) + '****' + k.key.slice(-4),
  })));
});

app.post('/api/keys', auth, (req, res) => {
  const name = (req.body || {}).name || '默认密钥';
  const key = 'sk-' + crypto.randomBytes(24).toString('hex');
  const r = run('INSERT INTO api_keys (user_id, name, key) VALUES (?,?,?)', req.user.id, name, key);
  ok(res, { id: r.lastInsertRowid, key, message: '请妥善保存，密钥仅显示一次' });
});

app.delete('/api/keys/:id', auth, (req, res) => {
  run('DELETE FROM api_keys WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  ok(res, { message: '已删除' });
});

/* ============================ 充值 ============================ */
app.post('/api/recharge', auth, (req, res) => {
  const amount = Number((req.body || {}).amount);
  if (!(amount > 0)) return fail(res, 400, '充值金额必须大于 0');
  if (amount > 100000) return fail(res, 400, '单次充值不能超过 100000');
  run('UPDATE users SET balance = balance + ? WHERE id = ?', amount, req.user.id);
  run('INSERT INTO recharges (user_id, amount, method, status) VALUES (?,?,?,?)', req.user.id, amount, 'mock', 'success');
  const u = get('SELECT balance FROM users WHERE id = ?', req.user.id);
  ok(res, { balance: u.balance, message: `模拟充值成功，到账 ¥${amount.toFixed(2)}` });
});

app.get('/api/recharges', auth, (req, res) => {
  ok(res, all('SELECT * FROM recharges WHERE user_id = ? ORDER BY id DESC LIMIT 100', req.user.id));
});

/* ============================ 仪表盘 ============================ */
app.get('/api/dashboard', auth, (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const scope = isAdmin ? '' : 'WHERE user_id = ?';
  const p = isAdmin ? [] : [req.user.id];

  const today = get(`SELECT COUNT(*) calls, COALESCE(SUM(total_tokens),0) tokens, COALESCE(SUM(cost),0) cost
                     FROM request_logs ${scope ? scope + ' AND' : 'WHERE'} date(created_at) = date('now','localtime')`, ...p);
  const total = get(`SELECT COUNT(*) calls, COALESCE(SUM(total_tokens),0) tokens, COALESCE(SUM(cost),0) cost
                     FROM request_logs ${scope}`, ...p);
  const failed = get(`SELECT COUNT(*) c FROM request_logs ${scope ? scope + ' AND' : 'WHERE'} status <> 'success'`, ...p);
  const successCalls = get(`SELECT COUNT(*) c FROM request_logs ${scope ? scope + ' AND' : 'WHERE'} status = 'success'`, ...p);

  // 近 14 天趋势
  const trend = all(`
    WITH RECURSIVE d(x) AS (SELECT date('now','localtime','-13 day') UNION ALL SELECT date(x,'+1 day') FROM d WHERE x < date('now','localtime'))
    SELECT d.x AS day,
      (SELECT COUNT(*) FROM request_logs l WHERE date(l.created_at)=d.x ${isAdmin ? '' : 'AND l.user_id=?'}) AS calls,
      (SELECT COALESCE(SUM(total_tokens),0) FROM request_logs l WHERE date(l.created_at)=d.x ${isAdmin ? '' : 'AND l.user_id=?'}) AS tokens,
      (SELECT COALESCE(SUM(cost),0) FROM request_logs l WHERE date(l.created_at)=d.x ${isAdmin ? '' : 'AND l.user_id=?'}) AS cost,
      (SELECT COUNT(*) FROM request_logs l WHERE date(l.created_at)=d.x AND l.status<>'success' ${isAdmin ? '' : 'AND l.user_id=?'}) AS failed
    FROM d`, ...(isAdmin ? [] : [req.user.id, req.user.id, req.user.id, req.user.id]));

  const topModels = all(`
    SELECT model_name, COUNT(*) calls, COALESCE(SUM(total_tokens),0) tokens, COALESCE(SUM(cost),0) cost
    FROM request_logs ${scope}
    GROUP BY model_name ORDER BY calls DESC LIMIT 8`, ...p);

  const recentErrors = all(`
    SELECT l.id, l.model_name, l.error_message, l.created_at, u.username
    FROM request_logs l LEFT JOIN users u ON u.id = l.user_id
    ${scope ? scope.replace('user_id', 'l.user_id') + ' AND' : 'WHERE'} l.status <> 'success'
    ORDER BY l.id DESC LIMIT 10`, ...p);

  const totalCalls = total.calls || 0;
  ok(res, {
    today: { calls: today.calls, tokens: today.tokens, cost: today.cost },
    total: { calls: totalCalls, tokens: total.tokens, cost: total.cost },
    failed: failed.c,
    successRate: totalCalls ? Number(((successCalls.c / totalCalls) * 100).toFixed(2)) : 100,
    trend, topModels, recentErrors,
    balance: req.user.balance,
    modelCount: get('SELECT COUNT(*) c FROM models WHERE status = 1').c,
    userCount: isAdmin ? get('SELECT COUNT(*) c FROM users').c : undefined,
  });
});

app.get('/api/logs', auth, (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(100, Number(req.query.size) || 20);
  const isAdmin = req.user.role === 'admin';
  const scope = isAdmin ? '' : 'WHERE l.user_id = ?';
  const p = isAdmin ? [] : [req.user.id];
  const total = get(`SELECT COUNT(*) c FROM request_logs l ${scope}`, ...p).c;
  const rows = all(`
    SELECT l.*, u.username FROM request_logs l LEFT JOIN users u ON u.id = l.user_id
    ${scope} ORDER BY l.id DESC LIMIT ? OFFSET ?`, ...p, size, (page - 1) * size);
  ok(res, { total, page, size, rows });
});

/* ============================ 用户管理 ============================ */
app.get('/api/users', auth, adminOnly, (req, res) => {
  ok(res, all(`
    SELECT u.id, u.username, u.email, u.role, u.balance, u.status, u.created_at,
      (SELECT COUNT(*) FROM request_logs l WHERE l.user_id = u.id) AS calls
    FROM users u ORDER BY u.id ASC`));
});

app.put('/api/users/:id', auth, adminOnly, (req, res) => {
  const u = get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!u) return fail(res, 404, '用户不存在');
  const { status, role, balance } = req.body || {};
  run('UPDATE users SET status=?, role=?, balance=? WHERE id=?',
    status === undefined ? u.status : Number(status),
    role ?? u.role,
    balance === undefined ? u.balance : Number(balance),
    u.id);
  ok(res, { message: '已更新' });
});

/* ============================ OpenAI 兼容代理 ============================ */
function resolveKey(rawKey) {
  if (!rawKey) return null;
  return get('SELECT * FROM api_keys WHERE key = ? AND status = 1', rawKey.replace(/^Bearer\s+/i, ''));
}

app.get('/v1/models', auth, (req, res) => {
  ok(res, { object: 'list', data: all('SELECT name AS id FROM models WHERE status = 1').map((m) => ({ ...m, object: 'model', owned_by: 'model-hub' })) });
});

async function proxyHandler(req, res) {
  const t0 = Date.now();
  const authHeader = req.headers.authorization || '';
  const keyRow = resolveKey(authHeader);
  const modelName = (req.body && req.body.model) || req.query.model;

  const log = (extra) => {
    const { user_id = null, api_key_id = null, model_id = null, vendor_id = null,
      prompt_tokens = 0, completion_tokens = 0, cost = 0, status = 'success', error_message = null } = extra || {};
    run(`INSERT INTO request_logs
      (user_id, api_key_id, model_id, model_name, vendor_id, prompt_tokens, completion_tokens, total_tokens, cost, status, error_message, latency_ms)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      user_id, api_key_id, model_id, modelName || 'unknown', vendor_id,
      prompt_tokens, completion_tokens, prompt_tokens + completion_tokens, cost, status, error_message, Date.now() - t0);
  };

  if (!keyRow) {
    log({ status: 'failed', error_message: '无效的 API Key' });
    return fail(res, 401, '无效的 API Key');
  }
  const user = get('SELECT * FROM users WHERE id = ?', keyRow.user_id);
  if (!user || !user.status) {
    log({ user_id: user?.id, api_key_id: keyRow.id, status: 'failed', error_message: '用户不可用' });
    return fail(res, 403, '用户不可用');
  }
  if (!modelName) {
    log({ user_id: user.id, api_key_id: keyRow.id, status: 'failed', error_message: '缺少 model 参数' });
    return fail(res, 400, '缺少 model 参数');
  }

  const model = get(`
    SELECT m.*, v.base_url, v.api_key AS vendor_key, v.protocol, g.ratio AS group_ratio
    FROM models m JOIN vendors v ON v.id = m.vendor_id LEFT JOIN groups g ON g.id = m.group_id
    WHERE m.name = ? AND m.status = 1 AND v.status = 1`, modelName);
  if (!model) {
    log({ user_id: user.id, api_key_id: keyRow.id, status: 'failed', error_message: `模型 ${modelName} 不存在或已下线` });
    return fail(res, 404, `模型 ${modelName} 不存在或已下线`);
  }
  if (user.balance <= 0) {
    log({ user_id: user.id, api_key_id: keyRow.id, model_id: model.id, vendor_id: model.vendor_id, status: 'failed', error_message: '余额不足' });
    return fail(res, 402, '余额不足，请充值');
  }

  // 预扣费用（按比例），实际按用量结算
  const ratio = model.group_ratio || 1;
  const estimate = model.fixed_price > 0 ? model.fixed_price : 0.002;
  if (user.balance < estimate) {
    log({ user_id: user.id, api_key_id: keyRow.id, model_id: model.id, vendor_id: model.vendor_id, status: 'failed', error_message: '余额不足' });
    return fail(res, 402, '余额不足，请充值');
  }

  const upstreamUrl = joinUrl(model.base_url, req.path.replace(/^\/v1/, '/v1'));
  const headers = { Authorization: `Bearer ${model.vendor_key}`, 'Content-Type': 'application/json' };
  if (model.protocol === 'anthropic') {
    headers['x-api-key'] = model.vendor_key;
    headers['anthropic-version'] = '2023-06-01';
    delete headers.Authorization;
  }

  try {
    const r = await request(upstreamUrl, {
      method: req.method,
      headers,
      body: req.method === 'GET' ? null : req.body,
      timeout: 120000,
    });

    let json = null;
    try { json = JSON.parse(r.text); } catch (e) { /* 流式或非 JSON */ }

    if (r.status < 200 || r.status >= 300) {
      const msg = (json && (json.error?.message || json.message)) || r.text.slice(0, 300) || `上游状态码 ${r.status}`;
      log({ user_id: user.id, api_key_id: keyRow.id, model_id: model.id, vendor_id: model.vendor_id, status: 'failed', error_message: msg });
      return res.status(r.status).json({ error: { message: msg, type: 'upstream_error' } });
    }

    const usage = (json && json.usage) || {};
    const promptTokens = usage.prompt_tokens || usage.input_tokens || 0;
    const completionTokens = usage.completion_tokens || usage.output_tokens || 0;
    let cost = 0;
    if (model.fixed_price > 0) {
      cost = model.fixed_price * ratio;
    } else {
      cost = (promptTokens / 1000) * model.input_price * ratio + (completionTokens / 1000) * model.output_price * ratio;
    }
    cost = Math.round(cost * 1e6) / 1e6;

    run('UPDATE users SET balance = MAX(0, balance - ?) WHERE id = ?', cost, user.id);
    log({
      user_id: user.id, api_key_id: keyRow.id, model_id: model.id, vendor_id: model.vendor_id,
      prompt_tokens: promptTokens, completion_tokens: completionTokens, cost, status: 'success',
    });

    res.status(r.status).set('Content-Type', r.headers['content-type'] || 'application/json').send(r.text);
  } catch (e) {
    log({ user_id: user.id, api_key_id: keyRow.id, model_id: model.id, vendor_id: model.vendor_id, status: 'failed', error_message: e.message });
    fail(res, 502, '上游请求失败：' + e.message);
  }
}

app.post('/v1/chat/completions', proxyHandler);
app.post('/v1/completions', proxyHandler);
app.post('/v1/embeddings', proxyHandler);
app.post('/v1/messages', proxyHandler);

/* ============================ 健康检查 ============================ */
app.get('/api/health', (req, res) => ok(res, { status: 'ok', time: new Date().toISOString() }));

app.use((req, res) => fail(res, 404, '接口不存在'));

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => console.log(`[ModelHub] 后端已启动: http://${HOST === '0.0.0.0' ? '0.0.0.0' : HOST}:${PORT} (LAN: http://<本机IP>:${PORT})`));

module.exports = app;