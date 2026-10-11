// scripts/screenshot.mjs
// Serves dist/ on a free port, opens it in the pre-installed Chromium through puppeteer-core, clicks Begin, and captures
// shots/<name>-390x844.png (dpr 2) and shots/<name>-1280x800.png. Exits 1 on any console error or page error (03 section 14).
// Usage: npm run shot [-- <name>]   (default name: scaffold)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SHOTS = path.join(ROOT, 'shots');
const NAME = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : 'scaffold';
const VIEWPORTS = [
  { w: 390, h: 844, dpr: 2 },
  { w: 1280, h: 800, dpr: 1 },
];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };

function chromiumPath() {
  const fixed = '/opt/pw-browsers/chromium';
  if (fs.existsSync(fixed)) return fixed;
  const base = '/opt/pw-browsers';
  if (fs.existsSync(base)) {
    for (const d of fs.readdirSync(base)) {
      if (!d.startsWith('chromium')) continue;
      for (const cand of [path.join(base, d, 'chrome-linux', 'chrome'), path.join(base, d, 'chrome-linux', 'headless_shell')]) {
        if (fs.existsSync(cand)) return cand;
      }
    }
  }
  for (const cand of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) if (fs.existsSync(cand)) return cand;
  throw new Error('no Chromium found under /opt/pw-browsers or /usr/bin');
}

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://x');
    let p = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
    if (!p.startsWith(DIST)) {
      res.writeHead(403).end();
      return;
    }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('dist/index.html is missing: run npm run build first');
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = await serve();
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/index.html#s=101`;
  const browser = await puppeteer.launch({
    executablePath: chromiumPath(),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'],
  });
  const errors = [];
  const written = [];
  try {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage();
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`console: ${m.text()}`);
      });
      page.on('pageerror', (e) => errors.push(`page: ${e.message}`));
      page.on('requestfailed', (r) => errors.push(`request: ${r.url()} ${r.failure()?.errorText ?? ''}`));
      await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: vp.dpr });
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForSelector('#begin', { visible: true, timeout: 15000 });
      await page.click('#begin');
      await new Promise((r) => setTimeout(r, 800));
      const file = path.join(SHOTS, `${NAME}-${vp.w}x${vp.h}.png`);
      await page.screenshot({ path: file });
      written.push(file);
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  for (const f of written) console.log('wrote', path.relative(ROOT, f));
  if (errors.length) {
    for (const e of errors) console.error(e);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
