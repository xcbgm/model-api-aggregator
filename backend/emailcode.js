/**
 * 邮箱验证码：注册/找回密码时发送，5 分钟有效，60 秒内不可重发。
 */
const crypto = require('crypto');
const { get, run } = require('./db');
const { getSetting } = require('./settings');
const { sendMail } = require('./mailer');

const TTL_MIN = 5;

function ensureTable() {
  run(`CREATE TABLE IF NOT EXISTS email_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'register',
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`);
  run('CREATE INDEX IF NOT EXISTS idx_email_codes ON email_codes(email, purpose)');
}
ensureTable();

function emailEnabled() {
  return getSetting('smtp_enabled') === '1' && !!getSetting('smtp_host');
}

function sendCode(email, purpose = 'register') {
  if (!emailEnabled()) {
    const e = new Error('邮箱验证码功能未开启（管理员尚未配置 SMTP）');
    e.code = 'EMAIL_DISABLED';
    throw e;
  }
  const recent = get(
    `SELECT id FROM email_codes WHERE email = ? AND purpose = ? AND created_at > datetime('now','localtime','-60 seconds')`,
    email, purpose
  );
  if (recent) {
    const e = new Error('发送太频繁，请 60 秒后再试');
    e.code = 'RATE_LIMIT';
    throw e;
  }
  const code = String(crypto.randomInt(100000, 1000000));
  run('INSERT INTO email_codes (email, code, purpose) VALUES (?,?,?)', email, code, purpose);

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
      <h2 style="color:#16776B;margin-top:0">灵犀模型网关</h2>
      <p style="color:#374151;font-size:15px">你正在${purpose === 'register' ? '注册账号' : '重置密码'}，验证码：</p>
      <div style="font-size:32px;letter-spacing:8px;font-weight:700;color:#16776B;text-align:center;padding:16px;background:#f0f7f5;border-radius:8px">${code}</div>
      <p style="color:#6b7280;font-size:13px;margin-bottom:0">${TTL_MIN} 分钟内有效。如非本人操作请忽略此邮件。</p>
    </div>`;
  sendMail({ to: email, subject: `【灵犀模型网关】验证码 ${code}`, html, text: `验证码：${code}，${TTL_MIN} 分钟内有效。` })
    .catch((e) => console.error('[mailer] 发送失败:', e.message));
  return true;
}

function verifyCode(email, code, purpose = 'register') {
  const row = get(
    `SELECT * FROM email_codes WHERE email = ? AND purpose = ? AND used = 0
     AND created_at > datetime('now','localtime','-${TTL_MIN} minutes')
     ORDER BY id DESC LIMIT 1`,
    email, purpose
  );
  if (!row) return { ok: false, reason: '验证码不存在或已过期' };
  if (row.code !== String(code)) return { ok: false, reason: '验证码错误' };
  run('UPDATE email_codes SET used = 1 WHERE id = ?', row.id);
  return { ok: true };
}

module.exports = { sendCode, verifyCode, emailEnabled };
