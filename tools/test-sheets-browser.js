#!/usr/bin/env node
/*
 * Browser test of the pages in Sheets mode, against tools/sheets-dev-server.js (real Apps Script code,
 * in-memory Sheet with the demo data). Needs Playwright.
 *   node tools/sheets-dev-server.js &   then   node tools/test-sheets-browser.js
 */
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/';
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails++; };
const rows = async table => (await fetch(B + '__rows?table=' + table)).json();
// Polls the Sheet until check() is true (writes reach the server in the background)
async function until(check, ms = 10000) {
  const end = Date.now() + ms;
  for (;;) {
    try { if (await check()) return true; } catch (e) { /* not there yet */ }
    if (Date.now() > end) return false;
    await new Promise(r => setTimeout(r, 250));
  }
}
const salesOf = async (uid, date) => (await rows('Sales')).filter(s => s.user_id === uid && s.date === date && !s.deleted);

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(p.url() + ' ' + e.message));
  p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(p.url() + ' console: ' + m.text()));
  p.on('dialog', d => d.accept());
  const settle = async () => { await p.waitForLoadState('load'); await p.waitForFunction(() => window.Data && Data.pendingCount() === 0); await p.waitForTimeout(250); };
  const login = async (phone, pw) => {
    await p.goto(B + 'index.html'); await p.waitForTimeout(500);
    if (await p.$('.topbar .logout')) { await p.click('.topbar .logout'); await p.waitForURL(/index\.html$/); }
    await p.fill('#phone', phone); await p.fill('#password', pw);
    await Promise.all([p.waitForURL(u => !u.href.endsWith('index.html'), { timeout: 8000 }).catch(() => {}), p.click('#form button[type=submit]')]);
    await settle();
  };

  // Login page
  await p.goto(B + 'index.html');
  ok(await p.isVisible('#rememberRow'), 'remember-me shown');
  ok(await p.isHidden('#reset'), 'demo reset link hidden');
  await p.fill('#phone', '0813 0000 0001'); await p.fill('#password', 'salah'); await p.click('#form button[type=submit]');
  await p.waitForSelector('#err:not([hidden])');
  ok((await p.textContent('#err')).includes('salah'), 'wrong password message from the server');
  await p.goto(B + 'leader/dashboard.html'); await p.waitForTimeout(500);
  ok(p.url().endsWith('index.html'), 'guard redirects to login when signed out');

  // SPG
  await login('0813 0000 0001', 'spg123');
  ok(p.url().includes('spg/beranda.html'), 'Sari lands on beranda');
  console.log('  ring:', await p.textContent('.ring .pct'));
  for (const pg of ['laporan', 'peringkat', 'riwayat']) { await p.goto(B + `spg/${pg}.html`); await settle(); }
  await p.goto(B + 'spg/peringkat.html'); await settle();
  ok((await p.textContent('main')).includes('Dewi'), 'leaderboard shows teammates');

  const before = (await salesOf('u-sari', '2026-10-22')).length;
  await p.goto(B + 'spg/laporan.html'); await settle();
  await p.locator('#entry .combo-input').fill('body'); await p.keyboard.press('Enter');
  await p.click('#plus'); await p.click('#plus');
  await p.click('#entry button[type=submit]'); await settle();
  ok(await until(async () => (await salesOf('u-sari', '2026-10-22')).length === before + 1), 'sale saved in the Sheet');
  const after = await salesOf('u-sari', '2026-10-22');
  ok(after.some(s => s.qty === 3 && s.store_id === 'st2'), 'qty 3 at the current store (st2)');
  await p.reload(); await settle();
  ok((await p.$$('#list [data-del]')).length === after.length, 'list shows the new sale after reload');
  await (await p.$$('#list [data-del]'))[0].click(); await settle();
  ok(await until(async () => (await salesOf('u-sari', '2026-10-22')).length === before), 'sale removed in the Sheet');

  // Offline sale, sent when back online
  await ctx.setOffline(true);
  await p.locator('#entry .combo-input').fill('body'); await p.keyboard.press('Enter');
  await p.click('#entry button[type=submit]'); await p.waitForTimeout(500);
  ok(await p.evaluate(() => Data.pendingCount()) === 1, 'offline sale kept in outbox');
  await ctx.setOffline(false);
  await p.evaluate(() => window.dispatchEvent(new Event('online')));
  await p.waitForFunction(() => Data.pendingCount() === 0, null, { timeout: 10000 });
  ok(await until(async () => (await salesOf('u-sari', '2026-10-22')).length === before + 1), 'offline sale delivered after reconnect');
  // The cached data opens the next page at once and includes the sale
  await p.goto(B + 'spg/beranda.html'); await settle();
  await p.goto(B + 'spg/laporan.html'); await settle();
  ok((await p.$$('#list [data-del]')).length === before + 1, 'next page shows the sale (cache kept in step)');

  await p.goto(B + 'spg/laporan.html?tanggal=2026-10-12'); await settle();
  ok(await p.isHidden('#entry'), 'old day locked for SPG');

  // Leader
  await login('0812 0000 0001', 'leader123');
  ok(p.url().includes('leader/dashboard.html'), 'Rina lands on dashboard');
  for (const pg of ['laporan', 'target', 'tim', 'pengaturan']) { await p.goto(B + `leader/${pg}.html`); await settle(); }
  await p.goto(B + 'leader/target.html'); await settle();
  await p.fill('tr[data-id="u-sari"] .monthly', '30000000'); await p.click('#save'); await settle();
  ok(await until(async () => (await rows('Targets')).find(t => t.user_id === 'u-sari' && t.month === '2026-10').monthly === 30000000), 'target saved in the Sheet');

  await p.goto(B + 'leader/laporan.html?spg=u-sari'); await settle();
  const lockBtns = await p.$$('[data-lock]');
  ok(lockBtns.length > 0, 'lock buttons present');
  if (lockBtns.length) { await lockBtns[0].click(); await settle(); }
  ok(await until(async () => (await rows('DayReports')).some(d => d.user_id === 'u-sari' && d.unlocked)), 'unlock saved');

  await p.goto(B + 'leader/pengaturan.html'); await settle();
  await p.fill('#editDays', '3'); await p.click('#save'); await settle();
  ok(await until(async () => (await rows('Settings')).find(s => s.team_id === 't1').edit_days === 3), 'settings saved');

  await p.goto(B + 'leader/tim.html'); await settle();
  await p.click('#openAdd'); await p.fill('#f-name', 'Tes Baru'); await p.fill('#f-phone', '0812 9999 0000');
  await p.click('#form button[type=submit]'); await p.waitForFunction(() => document.querySelector('#table').textContent.includes('Tes Baru'), null, { timeout: 8000 }).catch(() => {});
  ok((await p.textContent('#table')).includes('Tes Baru'), 'new SPG in table');
  await p.click('#openAdd'); await p.fill('#f-name', 'Dobel'); await p.fill('#f-phone', '0812 9999 0000');
  await p.click('#form button[type=submit]'); await p.waitForSelector('#err:not([hidden])');
  ok((await p.textContent('#err')).includes('sudah terdaftar'), 'duplicate phone rejected by the server');
  await p.keyboard.press('Escape');

  // New SPG must choose a password, then starts a shift
  await login('081299990000', 'spg123');
  ok(await p.isVisible('#pwForm'), 'new account asked for a new password');
  await p.fill('#newPw', 'rahasia1'); await p.fill('#newPw2', 'rahasia1');
  await Promise.all([p.waitForURL(/beranda/), p.click('#pwForm button[type=submit]')]);
  ok(p.url().includes('spg/beranda.html'), 'new SPG lands on beranda after setting password');
  await settle();
  await p.click('#start');
  await p.waitForSelector('dialog[open]');
  await p.locator('dialog[open] .combo-input').fill('Kemang'); await p.keyboard.press('Enter');
  await p.click('dialog[open] button[type=submit]');
  await settle();
  const newUser = (await rows('Users')).find(u => u.phone === '081299990000');
  ok(await until(async () => (await rows('Shifts')).some(s => s.user_id === newUser.id)), 'shift started in the Sheet');

  // Supervisor
  await login('0811 0000 0002', 'super123');
  ok(p.url().includes('supervisor/dashboard.html'), 'Budi lands on supervisor dashboard');
  await p.goto(B + 'leader/laporan.html'); await settle();

  // Admin
  await login('0811 0000 0001', 'admin123');
  ok(p.url().includes('admin/pengguna.html'), 'admin lands on pengguna');
  await p.click('#openAdd');
  await p.locator('#f-role').evaluate((s, v) => { s.value = v; s.dispatchEvent(new Event('change')); }, 'leader');
  await p.locator('#f-team').evaluate((s, v) => { s.value = v; s.dispatchEvent(new Event('change')); }, '__new');
  await p.fill('#f-name', 'Leader Baru'); await p.fill('#f-phone', '0812 8888 0000'); await p.fill('#f-newteam', 'Bogor');
  await p.click('#form button[type=submit]');
  ok(await until(async () => (await rows('Teams')).find(t => t.name === 'Bogor').leader_id === (await rows('Users')).find(u => u.phone === '081288880000').id), 'admin created leader with new team');
  await p.goto(B + 'katalog/produk.html'); await settle();
  await p.click('#openAdd'); await p.fill('#form [name=name]', 'NIVEA Tes'); await p.fill('#form [name=price]', '12500');
  await p.click('#form button[type=submit]');
  ok(await until(async () => (await rows('Products')).find(x => x.name === 'NIVEA Tes').price === 12500), 'product created');
  await p.goto(B + 'katalog/toko.html'); await settle();
  await p.click('#openAdd'); await p.fill('#form [name=name]', 'Toko Tes'); await p.fill('#form [name=city]', 'Bogor');
  await p.click('#form button[type=submit]');
  ok(await until(async () => (await rows('Stores')).find(x => x.name === 'Toko Tes').city === 'Bogor'), 'store created');

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  await b.close();
  process.exit(fails ? 1 : 0);
})();
