#!/usr/bin/env node
// Headless screenshot tool for model verification.
//
//   node tools/shot.cjs --model shelving [--fn showcase] [--views iso,front,top] [--zoom 1] [--out DIR]
//   node tools/shot.cjs --page "index.html?shot=overview" [--out DIR]
//
// Prints a JSON report (bbox size, draw calls, console errors) and writes PNGs to --out.
// CDN requests (three.js) are served from a local cache (fetched once with curl).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(ROOT, 'tools', '.cdn-cache');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : def;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      let p = path.join(ROOT, u === '/' ? 'index.html' : u);
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('404'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(p).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function cdnFetch(url) {
  const key = url.replace(/[^a-zA-Z0-9._-]/g, '_');
  const file = path.join(CACHE, key);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(CACHE, { recursive: true });
    const tmp = file + '.' + process.pid + '.tmp';
    execFileSync('curl', ['-sSfL', '--retry', '3', '-o', tmp, url]);
    fs.renameSync(tmp, file);
  }
  return fs.readFileSync(file);
}

(async () => {
  const model = arg('model');
  const page = arg('page');
  const fn = arg('fn', 'showcase');
  const views = (arg('views', 'iso')).split(',');
  const zoom = arg('zoom', '1');
  const out = path.resolve(arg('out', path.join(ROOT, 'tools', 'shots')));
  const width = +arg('width', 1280), height = +arg('height', 800);
  const wait = +arg('wait', 300);
  fs.mkdirSync(out, { recursive: true });

  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  await ctx.route(/^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com)\//, async (route) => {
    try {
      const body = cdnFetch(route.request().url());
      await route.fulfill({ status: 200, body, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } });
    } catch (e) { await route.fulfill({ status: 404, body: 'cdn fetch failed' }); }
  });

  const targets = page
    ? [{ url: base + page, name: page.replace(/[^a-zA-Z0-9]+/g, '_') }]
    : views.map((v) => ({ url: `${base}viewer.html?model=${model}&fn=${fn}&view=${v}&zoom=${zoom}`, name: `${model}_${fn}_${v}` }));

  const report = [];
  for (const t of targets) {
    const p = await ctx.newPage();
    const logs = [];
    p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
    p.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
    await p.goto(t.url);
    try { await p.waitForFunction(() => window.__ready === true, null, { timeout: 120000 }); }
    catch (e) { logs.push('[timeout] window.__ready never became true'); }
    await p.waitForTimeout(wait);
    const file = path.join(out, t.name + '.png');
    await p.screenshot({ path: file });
    const stats = await p.evaluate(() => ({ stats: window.__stats || null, errors: window.__errors || [] }));
    report.push({ screenshot: file, ...stats, console: logs });
    await p.close();
  }
  await browser.close();
  srv.close();
  console.log(JSON.stringify(report, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
