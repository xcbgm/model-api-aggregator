const jwt = require('jsonwebtoken');
const { get } = require('./db');

const SECRET = process.env.JWT_SECRET || 'model-hub-secret-key-change-me';

function sign(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET, { expiresIn: '7d' });
}

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    const payload = jwt.verify(token, SECRET);
    const user = get('SELECT id, username, email, role, balance, status FROM users WHERE id = ?', payload.id);
    if (!user) return res.status(401).json({ error: '用户不存在' });
    if (!user.status) return res.status(403).json({ error: '账号已被禁用' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  next();
}

module.exports = { sign, auth, adminOnly, SECRET };
