/**
 * 系统设置：SMTP 邮箱、支付网关等，管理员可在后台配置。
 * 敏感字段（密码/密钥）用 AES-256-GCM 加密存储。
 */
const crypto = require('crypto');
const { get, run } = require('./db');

const ENC_PREFIX = 'enc:v1:';
const SECRET = process.env.SETTINGS_SECRET || 'lingxi-settings-secret-2026';

function key() {
  return crypto.createHash('sha256').update(SECRET).digest();
}

function encrypt(plain) {
  if (plain === null || plain === undefined || plain === '') return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(val) {
  if (!val || typeof val !== 'string' || !val.startsWith(ENC_PREFIX)) return val || '';
  try {
    const buf = Buffer.from(val.slice(ENC_PREFIX.length), 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch (e) {
    return '';
  }
}

// 需要加密的键
const SENSITIVE = new Set([
  'smtp_pass', 'pay_mch_secret', 'pay_app_secret', 'pay_private_key',
]);

// 已知设置键及默认值
const SCHEMA = {
  // SMTP 邮箱
  smtp_host: '', smtp_port: '465', smtp_secure: 'ssl', smtp_user: '',
  smtp_pass: '', smtp_from: '', smtp_from_name: '灵犀模型网关', smtp_enabled: '0',
  // 支付网关
  pay_provider: 'epay', // epay | custom
  pay_enabled: '0',
  pay_merchant_id: '', pay_mch_secret: '', // 易支付商户号/密钥
  pay_app_id: '', pay_app_secret: '',      // 应用 ID/密钥
  pay_api_url: '',                          // 自定义网关 API 地址
  pay_notify_url: '', pay_return_url: '',
  pay_private_key: '',                      // 自定义签名私钥
};

const KEY_LIST = Object.keys(SCHEMA);

function ensureTable() {
  run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`);
}

function getRaw(keyName) {
  const row = get('SELECT value FROM settings WHERE key = ?', keyName);
  return row ? row.value : (SCHEMA[keyName] ?? '');
}

// 读取（解密敏感字段）
function getSetting(keyName) {
  const raw = getRaw(keyName);
  return SENSITIVE.has(keyName) ? decrypt(raw) : raw;
}

// 写入（加密敏感字段）
function setSetting(keyName, value) {
  ensureTable();
  const v = value === undefined || value === null ? '' : String(value);
  const stored = SENSITIVE.has(keyName) ? encrypt(v) : v;
  run(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now','localtime'))
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
    keyName, stored);
}

// 读取全部（返回给前端，敏感字段脱敏）
function getAll(mask = true) {
  ensureTable();
  const out = {};
  for (const k of KEY_LIST) {
    const raw = getRaw(k);
    if (mask && SENSITIVE.has(k)) {
      out[k] = raw ? '••••••••' : '';
    } else {
      out[k] = SENSITIVE.has(k) ? decrypt(raw) : raw;
    }
  }
  return out;
}

// 批量保存（空的敏感字段表示不修改）
function saveAll(obj = {}) {
  ensureTable();
  for (const k of KEY_LIST) {
    if (!(k in obj)) continue;
    let v = obj[k];
    // 脱敏占位符 = 不修改
    if (SENSITIVE.has(k) && (v === '••••••••' || v === undefined)) continue;
    setSetting(k, v);
  }
}

ensureTable();

module.exports = { getSetting, setSetting, getAll, saveAll, encrypt, decrypt, SENSITIVE, KEY_LIST };
