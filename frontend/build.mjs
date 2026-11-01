import * as esbuild from 'esbuild';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';

const isDev = process.argv.includes('--dev');
const outdir = 'dist';
if (!existsSync(outdir)) mkdirSync(outdir, { recursive: true });

const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>灵犀模型网关 · AI 模型 API 聚合平台</title>
    <meta name="description" content="统一接入多家大模型厂商，一处密钥调用全部模型" />
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2316776B'/%3E%3Ctext x='32' y='44' font-size='34' text-anchor='middle' fill='%23fff' font-family='serif'%3E灵%3C/text%3E%3C/svg%3E" />
    <link rel="stylesheet" href="/assets/app.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/app.js"></script>
  </body>
</html>`;

writeFileSync(`${outdir}/index.html`, html);

const options = {
  entryPoints: ['src/main.jsx'],
  bundle: true,
  outdir,
  entryNames: 'assets/app',
  loader: {
    '.js': 'jsx',
    '.jsx': 'jsx',
    '.png': 'dataurl',
    '.svg': 'dataurl',
    '.woff': 'dataurl',
    '.woff2': 'dataurl',
    '.ttf': 'dataurl',
    '.eot': 'dataurl',
  },
  define: { 'process.env.NODE_ENV': isDev ? '"development"' : '"production"' },
  jsx: 'automatic',
  jsxDev: isDev,
  target: ['chrome100', 'firefox100', 'safari15'],
  minify: !isDev,
  sourcemap: isDev,
  logLevel: 'info',
};

if (isDev) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('[esbuild] 监听中…');
} else {
  await esbuild.build(options);
  console.log('[esbuild] 构建完成 → dist/');
}