/**
 * 简易开发服务器：托管 dist 静态文件，并把 /api、/v1 代理到后端 3001
 * 用法：node serve.mjs [port]
 */
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const PORT = Number(process.argv[2] || 5173);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = 'dist';
const BACKEND = process.env.BACKEND || 'http://127.0.0.1:3001';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
};

function proxy(req, res) {
  const target = new URL(req.url, BACKEND);
  const p = http.request(
    {
      hostname: target.hostname,
      port: target.port,
      path: target.pathname + target.search,
      method: req.method,
      headers: { ...req.headers, host: target.host },
    },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    }
  );
  p.on('error', (e) => {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: false, error: '后端服务不可用：' + e.message }));
  });
  req.pipe(p);
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api') || req.url.startsWith('/v1')) return proxy(req, res);

  let file = normalize(join(ROOT, decodeURIComponent(req.url.split('?')[0])));
  if (!file.startsWith(normalize(ROOT))) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(ROOT, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('前端尚未构建，请先执行 npm run build');
    return;
  }
  res.writeHead(200, {
    'Content-Type': MIME[extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  createReadStream(file).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`[web] http://${HOST === '0.0.0.0' ? '0.0.0.0' : HOST}:${PORT}  (API 代理 → ${BACKEND})`);
  if (HOST === '0.0.0.0') console.log(`     局域网访问: http://<本机IP>:${PORT}`);
});