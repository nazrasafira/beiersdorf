#!/usr/bin/env node
/*
 * Local stand-in for the Google deployment: serves the pages and answers POST /exec by running the real
 * apps-script/*.gs code against an in-memory Sheet (tools/gas-mock.js) filled with the demo data.
 * For development and the browser tests; nothing is saved when it stops.
 *
 *   node tools/sheets-dev-server.js [--port 8790] [--latency 800] [--today 2026-10-22|real]
 *   then open http://localhost:8790/
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { load } = require('./gas-mock');

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const PORT = +arg('port', 8790);
const LATENCY = +arg('latency', 0); // Apps Script answers in ~1–2 s; try --latency 1500
const TODAY = arg('today', '2026-10-22');
const ROOT = path.join(__dirname, '..');

const gas = load(TODAY === 'real' ? {} : { DEMO_TODAY: TODAY }, { quiet: !process.argv.includes('--verbose') });
gas.ctx.setupSheet();
console.log(gas.ctx.importDemoData('file://' + path.join(ROOT, 'apps-script', 'demo-data.json')));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
const CONFIG = "window.APP_CONFIG = { backend: 'sheets', url: '/exec', demoAccounts: true };\n";

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/exec') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => setTimeout(() => {
      const out = req.method === 'POST' ? gas.call(body) : JSON.parse(gas.ctx.doGet().getContent());
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    }, LATENCY));
    return;
  }
  // Test helper: rows of a tab, e.g. /__rows?table=Sales (this local server only)
  if (url.pathname === '/__rows') {
    gas.ctx.handle_('{}'); // fresh read
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(gas.ctx.rows_(url.searchParams.get('table'))));
    return;
  }
  if (url.pathname === '/assets/js/config.js') {
    res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store' });
    res.end(CONFIG);
    return;
  }
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Laporan SPG (Sheets backend, local) on http://localhost:${PORT}/  today=${TODAY}`));
