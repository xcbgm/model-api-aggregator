const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

/* ---------- 平滑升级：为旧库补充模型能力/探测字段 ---------- */
(function migrate() {
  const cols = new Set(db.prepare('PRAGMA table_info(models)').all().map((c) => c.name));
  const add = (ddl) => { try { db.exec(ddl); } catch (e) { /* 已存在则忽略 */ } };
  if (!cols.has('context_length')) add('ALTER TABLE models ADD COLUMN context_length INTEGER NOT NULL DEFAULT 0');
  if (!cols.has('max_output_tokens')) add('ALTER TABLE models ADD COLUMN max_output_tokens INTEGER NOT NULL DEFAULT 0');
  if (!cols.has('input_modes')) add('ALTER TABLE models ADD COLUMN input_modes TEXT NOT NULL DEFAULT \'text\'');
  if (!cols.has('reasoning_enabled')) add('ALTER TABLE models ADD COLUMN reasoning_enabled INTEGER NOT NULL DEFAULT 0');
  if (!cols.has('probe_online')) add('ALTER TABLE models ADD COLUMN probe_online INTEGER');
  if (!cols.has('probe_latency_ms')) add('ALTER TABLE models ADD COLUMN probe_latency_ms INTEGER');
  if (!cols.has('probe_ttft_ms')) add('ALTER TABLE models ADD COLUMN probe_ttft_ms INTEGER');
  if (!cols.has('probe_at')) add('ALTER TABLE models ADD COLUMN probe_at TEXT');
})();

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  balance REAL NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  protocol TEXT NOT NULL DEFAULT 'openai',
  remark TEXT,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  ratio REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_name TEXT,
  group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
  input_price REAL NOT NULL DEFAULT 0,
  output_price REAL NOT NULL DEFAULT 0,
  fixed_price REAL NOT NULL DEFAULT 0,
  model_type TEXT NOT NULL DEFAULT 'chat',
  status INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  context_length INTEGER NOT NULL DEFAULT 0,
  max_output_tokens INTEGER NOT NULL DEFAULT 0,
  input_modes TEXT NOT NULL DEFAULT 'text',
  reasoning_enabled INTEGER NOT NULL DEFAULT 0,
  probe_online INTEGER,
  probe_latency_ms INTEGER,
  probe_ttft_ms INTEGER,
  probe_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (vendor_id, name)
);

CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS request_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  api_key_id INTEGER,
  model_id INTEGER,
  model_name TEXT,
  vendor_id INTEGER,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_logs_created ON request_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_logs_user ON request_logs(user_id);

CREATE TABLE IF NOT EXISTS recharges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  method TEXT NOT NULL DEFAULT 'mock',
  status TEXT NOT NULL DEFAULT 'success',
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
`);

const all = (sql, ...p) => db.prepare(sql).all(...p);
const get = (sql, ...p) => db.prepare(sql).get(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);

// ---------- 初始化种子数据 ----------
function seed() {
  const admin = get('SELECT id FROM users WHERE username = ?', 'admin');
  if (!admin) {
    run(
      'INSERT INTO users (username, email, password_hash, role, balance) VALUES (?,?,?,?,?)',
      'admin', 'admin@example.com', bcrypt.hashSync('admin123', 10), 'admin', 100
    );
  }
  const demo = get('SELECT id FROM users WHERE username = ?', 'demo');
  if (!demo) {
    run(
      'INSERT INTO users (username, email, password_hash, role, balance) VALUES (?,?,?,?,?)',
      'demo', 'demo@example.com', bcrypt.hashSync('demo123', 10), 'user', 50
    );
  }
  if (all('SELECT id FROM groups').length === 0) {
    run('INSERT INTO groups (name, description, ratio) VALUES (?,?,?)', '默认分组', '所有未特殊归类的模型', 1);
    run('INSERT INTO groups (name, description, ratio) VALUES (?,?,?)', '高性价比', '价格低廉的通用模型', 0.8);
    run('INSERT INTO groups (name, description, ratio) VALUES (?,?,?)', '旗舰模型', '最强推理与创作能力', 1.5);
  }
}

seed();

module.exports = { db, all, get, run };
