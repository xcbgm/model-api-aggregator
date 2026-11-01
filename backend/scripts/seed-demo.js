#!/usr/bin/env node
/**
 * 演示数据生成脚本（演示 / 截图 / 压测图表用）
 * ------------------------------------------------------------------
 * 功能：为数据库中已存在的模型生成最近 14 天的调用日志（request_logs），
 *       用于让「仪表盘」「调用日志」页面有真实的趋势、Top 模型与错误记录。
 *
 * 特点：
 *   - 直接复用 backend/db.js 的连接（与后端服务同一套表结构与种子数据）
 *   - 只用 node 内置能力，无第三方依赖，`node scripts/seed-demo.js` 直接运行
 *   - 幂等：检测到已有日志时默认跳过，需要覆盖时加 --force
 *   - 兼容后端正在运行的情况（WAL + busy_timeout + 短重试）
 *
 * 用法（在 backend/ 目录下执行）：
 *   node scripts/seed-demo.js               # 没有日志才插入（默认 300 条）
 *   node scripts/seed-demo.js --force       # 已有日志也强制再插入一批
 *   node scripts/seed-demo.js --count=500   # 自定义条数
 *   node scripts/seed-demo.js --days=14     # 自定义时间跨度（天）
 *
 * 注意：Node.js 需要 >= 22（node:sqlite 内置模块），与后端要求一致。
 */

'use strict';

const path = require('path');

// ---------- 0. Node 版本检查（node:sqlite 需要 >= 22） ----------
const NODE_MAJOR = Number(process.versions.node.split('.')[0]);
if (NODE_MAJOR < 22) {
  console.error(`✗ 当前 Node.js 版本为 ${process.versions.node}，本脚本需要 >= 22（依赖内置 node:sqlite）。`);
  process.exit(1);
}

// ---------- 1. 解析命令行参数 ----------
const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(`--${name}`);
const getOpt = (name, def) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  const val = hit ? Number(hit.split('=')[1]) : NaN;
  return Number.isFinite(val) && val > 0 ? Math.floor(val) : def;
};

const FORCE = hasFlag('force') || hasFlag('f');
const COUNT = getOpt('count', 300); // 目标插入条数
const DAYS = getOpt('days', 14); // 时间跨度（天）
const MAX_RETRY = 6; // SQLITE_BUSY 重试次数

// ---------- 2. 复用后端数据库连接 ----------
// require('../db') 会自动建表 + 写入默认账号/分组种子数据
const { db, all, get, run } = require('../db');

// 让 SQLite 在遇到写锁时自己等待，而不是立刻抛 SQLITE_BUSY
db.exec('PRAGMA busy_timeout = 5000');

// ---------- 3. 工具函数 ----------
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** 本地时间格式化为 'YYYY-MM-DD HH:MM:SS'（与 db.js 的 datetime('now','localtime') 一致） */
function fmtLocal(d) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const round6 = (n) => Math.round(n * 1e6) / 1e6;

/**
 * 遇到 SQLITE_BUSY / SQLITE_LOCKED 时短暂等待后重试，
 * 这样即使后端服务正在并发写库也能成功落盘。
 */
function withRetry(fn, label = 'sql') {
  for (let i = 0; i < MAX_RETRY; i++) {
    try {
      return fn();
    } catch (e) {
      const retryable = /SQLITE_BUSY|SQLITE_LOCKED|database is locked|database table is locked/i.test(
        String(e && e.message)
      );
      if (!retryable || i === MAX_RETRY - 1) throw e;
      const wait = 200 * (i + 1);
      console.warn(`  · ${label} 遇到写锁，${wait}ms 后重试（${i + 1}/${MAX_RETRY}）`);
      sleep(wait);
    }
  }
}

// ---------- 4. 读取基础数据 ----------
const models = all(`
  SELECT m.id, m.name, m.vendor_id, m.input_price, m.output_price, m.fixed_price,
         m.group_id, g.ratio AS group_ratio
  FROM models m
  JOIN vendors v ON v.id = m.vendor_id
  LEFT JOIN groups g ON g.id = m.group_id
  WHERE m.status = 1`);

const users = all('SELECT id, username FROM users WHERE status = 1 ORDER BY id ASC');
const keys = all('SELECT id, user_id FROM api_keys ORDER BY id ASC');

if (models.length === 0) {
  console.error('✗ 数据库里还没有任何可用模型，无法生成调用日志。');
  console.error('  请先在「厂商管理」中添加厂商、拉取模型，或直接使用管理后台导入模型后重试。');
  process.exit(1);
}
if (users.length === 0) {
  console.error('✗ 数据库里没有可用用户，请先启动一次后端以初始化种子账号。');
  process.exit(1);
}

// ---------- 5. 幂等检查 ----------
const existing = get('SELECT COUNT(*) AS c FROM request_logs').c;
console.log(`· 数据库：${path.join(__dirname, '..', 'data', 'app.db')}`);
console.log(`· 现有模型 ${models.length} 个 / 用户 ${users.length} 个 / API Key ${keys.length} 个`);
console.log(`· 现有调用日志 ${existing} 条`);

if (existing > 0 && !FORCE) {
  console.log('');
  console.log(`✓ 已存在 ${existing} 条调用日志，为避免重复插入，本次跳过。`);
  console.log('  如需继续追加演示数据，请执行：node scripts/seed-demo.js --force');
  process.exit(0);
}

// ---------- 6. 生成演示日志 ----------
const ERROR_MESSAGES = [
  '上游返回 429: rate limit exceeded, please retry later',
  '上游返回 500: internal server error',
  '上游请求超时（120000ms）',
  '模型不存在或已下线',
  '上游返回 400: context length exceeded',
  '余额不足，请充值',
  'upstream connect error or disconnect/reset before headers',
];
const FAIL_RATE = 0.07; // 约 7% 失败请求，成功率 ~93%
const FAILED_STATUS = 'failed'; // 与 server.js 代理接口写入的状态值保持一致

const now = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;

/** 按“近几天调用更多”的权重挑一个距今天数（0 = 今天） */
function pickDayOffset() {
  // 权重 1 → 1.78，越靠近今天越容易命中，趋势图更自然
  const weights = [];
  let sum = 0;
  for (let d = 0; d < DAYS; d++) {
    const w = 1 + (DAYS - 1 - d) * 0.06;
    weights.push(w);
    sum += w;
  }
  let r = Math.random() * sum;
  for (let d = 0; d < DAYS; d++) {
    r -= weights[d];
    if (r <= 0) return d;
  }
  return DAYS - 1;
}

/** 按“白天多、凌晨少”的权重挑一个小时 */
function pickHour() {
  const weights = [
    1, 1, 1, 1, 1, 2, 4, 7, 10, 12, 12, 11, 9, 10, 12, 12, 11, 10, 8, 7, 6, 4, 3, 2,
  ];
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let h = 0; h < 24; h++) {
    r -= weights[h];
    if (r <= 0) return h;
  }
  return 12;
}

/** 计算单次调用费用，公式与 server.js 的代理结算逻辑完全一致 */
function calcCost(model, promptTokens, completionTokens) {
  const ratio = model.group_ratio || 1;
  if (model.fixed_price > 0) return round6(model.fixed_price * ratio);
  const input = (promptTokens / 1000) * model.input_price * ratio;
  const output = (completionTokens / 1000) * model.output_price * ratio;
  return round6(input + output);
}

const rows = [];
for (let i = 0; i < COUNT; i++) {
  const model = pick(models);
  const user = pick(users);

  // 模型与用户对应的 API Key（没有匹配的 Key 时留空，历史数据里很常见）
  const userKeys = keys.filter((k) => k.user_id === user.id);
  const keyRow = userKeys.length ? pick(userKeys) : null;

  // 时间：近 DAYS 天内的随机时刻，且不晚于当前时间
  const dayOffset = pickDayOffset();
  const dayStart = new Date(now - dayOffset * DAY_MS);
  dayStart.setHours(pickHour(), randInt(0, 59), randInt(0, 59), 0);
  let ts = dayStart.getTime();
  if (ts > now) ts = now - randInt(1, 55) * 60 * 1000; // 今天的未来时刻回拨到刚才

  const failed = Math.random() < FAIL_RATE;
  // 失败的请求通常在拿到 usage 之前就中断，token 记为 0，符合真实代理行为
  const promptTokens = failed ? 0 : randInt(120, 3200);
  const completionTokens = failed ? 0 : randInt(40, 1500);
  const totalTokens = promptTokens + completionTokens;
  const cost = failed ? 0 : calcCost(model, promptTokens, completionTokens);
  const latency = failed ? randInt(800, 30000) : randInt(320, 6800);

  rows.push({
    user_id: user.id,
    api_key_id: keyRow ? keyRow.id : null,
    model_id: model.id,
    model_name: model.name,
    vendor_id: model.vendor_id,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    cost,
    status: failed ? FAILED_STATUS : 'success',
    error_message: failed ? pick(ERROR_MESSAGES) : null,
    latency_ms: latency,
    created_at: fmtLocal(new Date(ts)),
  });
}

// 按时间升序写入，id 顺序与时间顺序一致，日志列表看起来更自然
rows.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

// ---------- 7. 分批写入（事务 + 重试） ----------
const insert = db.prepare(`
  INSERT INTO request_logs
    (user_id, api_key_id, model_id, model_name, vendor_id, prompt_tokens, completion_tokens,
     total_tokens, cost, status, error_message, latency_ms, created_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);

const CHUNK = 60; // 每批 60 条，缩短持锁时间，避免与运行中的后端互相阻塞
let inserted = 0;

for (let start = 0; start < rows.length; start += CHUNK) {
  const chunk = rows.slice(start, start + CHUNK);
  withRetry(() => {
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const r of chunk) {
        insert.run(
          r.user_id, r.api_key_id, r.model_id, r.model_name, r.vendor_id,
          r.prompt_tokens, r.completion_tokens, r.total_tokens, r.cost,
          r.status, r.error_message, r.latency_ms, r.created_at
        );
      }
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch (_) { /* 忽略回滚异常 */ }
      throw e;
    }
  }, `插入第 ${start + 1}~${start + chunk.length} 条`);
  inserted += chunk.length;
  process.stdout.write(`\r  · 已插入 ${inserted}/${rows.length} 条`);
}
process.stdout.write('\n');

// ---------- 8. 校验并输出结果 ----------
const total = get('SELECT COUNT(*) AS c FROM request_logs').c;
const failedCount = get("SELECT COUNT(*) AS c FROM request_logs WHERE status <> 'success'").c;
const sumTokens = get('SELECT COALESCE(SUM(total_tokens),0) AS t FROM request_logs').t;
const sumCost = get('SELECT COALESCE(SUM(cost),0) AS c FROM request_logs').c;
const days = all(`
  SELECT date(created_at) AS day, COUNT(*) AS calls, COALESCE(SUM(total_tokens),0) AS tokens
  FROM request_logs GROUP BY date(created_at) ORDER BY day ASC`);

console.log('');
console.log(`✓ 演示数据生成完成：本次插入 ${inserted} 条，表内共 ${total} 条`);
console.log(`  · 时间范围：${days[0] ? days[0].day : '-'} ~ ${days[days.length - 1] ? days[days.length - 1].day : '-'}（覆盖 ${days.length} 天）`);
console.log(`  · 失败请求：${failedCount} 条（失败率 ${((failedCount / Math.max(total, 1)) * 100).toFixed(1)}%）`);
console.log(`  · 累计 token：${sumTokens.toLocaleString('en-US')}，累计费用：¥${sumCost.toFixed(4)}`);
console.log('');
console.log('  每日分布：');
for (const d of days) {
  const bar = '█'.repeat(Math.max(1, Math.round((d.calls / Math.max(...days.map((x) => x.calls))) * 24)));
  console.log(`    ${d.day}  ${String(d.calls).padStart(4)} 次  ${bar}`);
}
console.log('');
console.log('  打开仪表盘即可看到趋势图：http://localhost:5173/dashboard （账号 admin / admin123）');

// 脚本自己开过连接，退出前关闭，避免残留 WAL 锁
db.close();