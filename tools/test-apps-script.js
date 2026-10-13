#!/usr/bin/env node
/*
 * Tests for the Apps Script backend (apps-script/*.gs), run in Node with tools/gas-mock.js.
 * Uses the demo data (DEMO_TODAY 2026-10-22). Usage: node tools/test-apps-script.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { load } = require('./gas-mock');

const DEMO = 'file://' + path.join(__dirname, '..', 'apps-script', 'demo-data.json');
const PHONE = { admin: '081100000001', budi: '081100000002', rina: '081200000001', andi: '081200000002', sari: '081300000001', dewi: '081300000002', rani: '081300000004' };
const PW = { admin: 'admin123', budi: 'super123', rina: 'leader123', andi: 'leader123', sari: 'spg123', dewi: 'spg123', rani: 'spg123' };

function app() {
  const g = load({ DEMO_TODAY: '2026-10-22' }, { quiet: true });
  g.ctx.setupSheet();
  g.ctx.importDemoData(DEMO);
  const tokens = {};
  g.as = (who, action, params = {}) => {
    if (!tokens[who]) {
      const r = g.call({ action: 'login', phone: PHONE[who], password: PW[who] });
      assert.ok(r.ok, 'login ' + who + ': ' + r.error);
      tokens[who] = r.data.token;
    }
    return g.call(Object.assign({ action, token: tokens[who] }, params));
  };
  g.rows = name => g.ctx.rows_(name);
  g.fresh = () => g.ctx.handle_('{}'); // clears the per-request table cache
  return g;
}
const JPG = 'data:image/jpeg;base64,' + Buffer.from('fake jpeg').toString('base64');
const uuid = () => require('crypto').randomUUID();
const sale = (over = {}) => Object.assign({ clientId: uuid(), userId: 'u-sari', date: '2026-10-22', productId: 'p1', qty: 2, price: 45000, time: '14:00' }, over);

test('sheet setup keeps phone numbers and dates as text', () => {
  const g = app();
  const users = g.ss.getSheetByName('Users').data;
  assert.equal(users[1][1], '081100000002');
  assert.equal(typeof g.ss.getSheetByName('Sales').data[1][2], 'string');
});

test('login: any phone format, wrong password, rate limit', () => {
  const g = app();
  const ok = g.call({ action: 'login', phone: '+62 813-0000-0001', password: 'spg123' });
  assert.ok(ok.ok);
  assert.equal(ok.data.state.me, 'u-sari');
  const bad = g.call({ action: 'login', phone: '081300000002', password: 'salah' });
  assert.deepEqual([bad.status, bad.error], [422, 'Nomor HP atau password salah.']);
  for (let i = 0; i < 4; i++) g.call({ action: 'login', phone: '081300000002', password: 'salah' });
  assert.equal(g.call({ action: 'login', phone: '081300000002', password: 'spg123' }).status, 429);
});

test('tokens: forged, missing and revoked tokens are refused', () => {
  const g = app();
  assert.equal(g.call({ action: 'bootstrap' }).status, 401);
  const t = g.call({ action: 'login', phone: PHONE.sari, password: 'spg123' }).data.token;
  assert.ok(g.call({ action: 'bootstrap', token: t }).ok);
  assert.equal(g.call({ action: 'bootstrap', token: t.slice(0, -2) + 'xx' }).status, 401);
  assert.ok(g.as('rina', 'user.setActive', { userId: 'u-sari', active: false }).ok);
  assert.equal(g.call({ action: 'bootstrap', token: t }).status, 401);
  assert.ok(g.as('rina', 'user.setActive', { userId: 'u-sari', active: true }).ok);
  assert.equal(g.call({ action: 'bootstrap', token: t }).status, 401, 'reactivating does not revive old tokens');
});

test('reset password: must choose a new one before anything else', () => {
  const g = app();
  assert.equal(g.as('rina', 'user.resetPassword', { userId: 'u-dewi' }).data.password, 'spg123');
  const login = g.call({ action: 'login', phone: PHONE.dewi, password: 'spg123' });
  assert.equal(login.data.state.mustChangePassword, true);
  const t = login.data.token;
  assert.equal(g.call({ action: 'shift.start', token: t, storeId: 'st1' }).status, 403);
  assert.equal(g.call({ action: 'password.change', token: t, password: 'spg123', confirmation: 'spg123' }).status, 422);
  const ch = g.call({ action: 'password.change', token: t, password: 'baru123', confirmation: 'baru123' });
  assert.ok(ch.ok);
  assert.ok(g.call({ action: 'shift.start', token: ch.data.token, storeId: 'st1' }).ok);
  assert.equal(g.call({ action: 'bootstrap', token: t }).status, 401, 'old token stops working');
});

test('what each role sees', () => {
  const g = app();
  const s = g.as('sari', 'bootstrap').data;
  const phones = Object.fromEntries(s.users.map(u => [u.id, u.phone]));
  assert.equal(phones['u-sari'], '081300000001');
  assert.equal(phones['u-dewi'], '', 'teammates without phone numbers');
  assert.deepEqual(s.teams.map(t => t.id), ['t1']);
  assert.ok(s.reports['u-dewi|2026-10-21'] && !s.reports['u-dewi|2026-10-21'].transactions, 'teammates: totals only');
  assert.ok(s.reports['u-sari|2026-10-22'].transactions.length > 0);
  const budi = g.as('budi', 'bootstrap').data;
  assert.equal(budi.teams.length, 5);
  const admin = g.as('admin', 'bootstrap').data;
  assert.deepEqual([Object.keys(admin.reports).length, Object.keys(admin.targets).length], [0, 0]);
});

test('sales: shift needed today, idempotent, totals and no-sales', () => {
  const g = app();
  assert.equal(g.as('sari', 'sale.add', sale({ userId: 'u-dewi' })).status, 403, 'not her own report');
  const s1 = sale();
  const r = g.as('sari', 'sale.add', s1);
  assert.ok(r.ok, r.error);
  assert.equal(r.data.storeId, 'st2', 'store of the shift at 14:00 (Sari switched at 12:00)');
  assert.equal(g.as('sari', 'sale.add', s1).data.duplicate, true);
  const today = g.as('sari', 'bootstrap').data.reports['u-sari|2026-10-22'];
  assert.equal(today.transactions.filter(t => t.id === s1.clientId).length, 1);
  assert.ok(g.as('sari', 'sale.remove', { clientId: s1.clientId }).ok);
  assert.equal(g.as('sari', 'sale.remove', { clientId: s1.clientId }).data.missing, true);
  // Rani has not started a shift today
  assert.equal(g.as('rani', 'sale.add', sale({ userId: 'u-rani' })).error, 'Mulai shift dulu sebelum mencatat penjualan.');
});

test('ending a shift without sales reports no sales', () => {
  const g = app();
  g.as('rina', 'user.add', { role: 'spg', name: 'Baru', phone: '081377777777', teamId: 't1' });
  const t = g.call({ action: 'login', phone: '081377777777', password: 'spg123' }).data.token;
  const tok = g.call({ action: 'password.change', token: t, password: 'rahasia1', confirmation: 'rahasia1' }).data.token;
  const call = (action, p) => g.call(Object.assign({ action, token: tok }, p));
  assert.equal(call('sale.add', sale({ userId: g.rows('Users').find(u => u.phone === '081377777777').id })).status, 422, 'no shift yet');
  assert.ok(call('shift.start', { storeId: 'st1', time: '09:00' }).ok);
  assert.equal(call('shift.end', { time: '21:00' }).status, 422, 'photo of the notes is required');
  assert.ok(call('shift.end', { time: '21:00', photos: [JPG] }).ok);
  const me = call('bootstrap').data;
  assert.equal(me.reports[me.me + '|2026-10-22'].noSales, true);
});

test('edit window and unlock', () => {
  const g = app();
  const old = sale({ date: '2026-10-15', time: '' });
  assert.equal(g.as('sari', 'sale.add', old).status, 403);
  assert.ok(g.as('rina', 'report.unlock', { userId: 'u-sari', date: '2026-10-15', unlocked: true }).ok);
  assert.ok(g.as('sari', 'sale.add', old).ok);
  assert.equal(g.as('sari', 'sale.add', sale({ date: '2026-10-23' })).status, 403, 'future');
});

test('leaders edit their team only, supervisor the area, admin no reports', () => {
  const g = app();
  const other = g.rows('Users').find(u => u.role === 'spg' && u.team_id === 't2');
  assert.ok(g.as('rina', 'sale.add', sale({ date: '2026-10-10' })).ok);
  assert.equal(g.as('rina', 'sale.add', sale({ userId: other.id, date: '2026-10-10' })).status, 403);
  assert.ok(g.as('budi', 'sale.add', sale({ userId: other.id, date: '2026-10-10' })).ok);
  assert.equal(g.as('admin', 'sale.add', sale({ date: '2026-10-10' })).status, 403);
});

test('who adds whom', () => {
  const g = app();
  assert.equal(g.as('admin', 'user.add', { role: 'spg', name: 'X', phone: '081377777777', teamId: 't1' }).status, 403);
  assert.ok(g.as('admin', 'user.add', { role: 'supervisor', name: 'Sup', phone: '081177777777' }).ok);
  const lead = g.as('admin', 'user.add', { role: 'leader', name: 'Lead', phone: '0812 7777 7777', newTeam: 'Bogor' }).data;
  assert.equal(lead.team.name, 'Bogor');
  assert.equal(lead.team.leaderId, lead.user.id);
  assert.ok(lead.settings.workingDays.length);
  assert.ok(g.as('rina', 'user.add', { role: 'spg', name: 'Baru', phone: '081366666666', teamId: 't1' }).ok);
  assert.equal(g.as('rina', 'user.add', { role: 'spg', name: 'Lain', phone: '081366666667', teamId: 't2' }).status, 403);
  assert.equal(g.as('rina', 'user.add', { role: 'leader', name: 'L', phone: '081266666666', teamId: 't1' }).status, 403);
  assert.equal(g.as('rina', 'user.add', { role: 'spg', name: 'Dobel', phone: '081366666666', teamId: 't1' }).error, 'Nomor HP sudah terdaftar.');
  assert.equal(g.as('budi', 'user.setActive', { userId: 'u-rina', active: false }).status, 403);
});

test('targets and settings: own team only', () => {
  const g = app();
  assert.ok(g.as('rina', 'targets.save', { rows: [{ userId: 'u-sari', mk: '2026-11', monthly: 40000000 }] }).ok);
  assert.equal(g.as('sari', 'bootstrap').data.targets['u-sari|2026-11'].monthly, 40000000);
  const other = g.rows('Users').find(u => u.role === 'spg' && u.team_id === 't2');
  assert.equal(g.as('rina', 'targets.save', { rows: [{ userId: other.id, mk: '2026-11', monthly: 1 }] }).status, 403);
  const body = { teamId: 't1', workingDays: [1, 2, 3, 4, 5], editDays: 3, reminder: '19:30', holidays: [{ date: '2026-12-25', name: 'Natal', working: false }] };
  assert.equal(g.as('andi', 'settings.save', body).status, 403);
  assert.ok(g.as('rina', 'settings.save', body).ok);
  const st = g.as('rina', 'bootstrap').data.settings.t1;
  assert.deepEqual([st.workingDays, st.editDays, st.reminder, st.holidays.length], [[1, 2, 3, 4, 5], 3, '19:30', 1]);
});

test('products and stores: leaders edit only what they added', () => {
  const g = app();
  assert.equal(g.as('rina', 'product.save', { id: 'p1', name: 'X', price: 1000 }).status, 403);
  const p = g.as('rina', 'product.save', { name: 'NIVEA Baru', price: 25000 }).data.product;
  assert.ok(g.as('rina', 'product.save', { id: p.id, name: 'NIVEA Baru 2', price: 26000 }).ok);
  assert.ok(g.as('budi', 'product.save', { id: 'p1', name: 'NIVEA Soft', sku: 'X1', price: 46000 }).ok);
  assert.equal(g.as('budi', 'product.save', { id: p.id, name: 'Y', sku: 'X1', price: 1 }).error, 'SKU sudah dipakai produk lain.');
  const notHers = g.rows('Stores').find(st => st.created_by !== 'u-rina');
  assert.equal(g.as('rina', 'store.save', { id: notHers.id, name: 'X', city: 'Y' }).status, 403);
  assert.ok(g.as('rina', 'store.save', { id: 'st1', name: 'Toko Kemang', city: 'Jakarta Selatan' }).ok, 'she added st1');
  assert.ok(g.as('rina', 'store.save', { name: 'Toko Baru', city: 'Depok' }).ok);
  assert.equal(g.as('sari', 'store.save', { name: 'Toko SPG', city: 'Depok' }).status, 403);
});

test('photos go to Drive', () => {
  const g = app();
  const jpg = 'data:image/jpeg;base64,' + Buffer.from('fake jpeg').toString('base64');
  const r = g.as('sari', 'user.photo', { userId: 'u-sari', photo: jpg });
  assert.match(r.data.photo, /^https:\/\/drive\.google\.com\/thumbnail\?id=file1/);
  assert.equal(g.as('sari', 'user.photo', { userId: 'u-dewi', photo: jpg }).status, 403);
  assert.equal(g.as('sari', 'user.photo', { userId: 'u-sari', photo: 'data:text/html;base64,eA==' }).status, 422);
});

test('hand edits in the Products tab are checked', () => {
  const g = app();
  const sh = g.ss.getSheetByName('Products');
  const row = sh.getLastRow() + 1;
  sh.getRange(row, 2, 1, 3).setValues([['NIVEA Tangan', '', 'Rp 45.000']]);
  g.ctx.onEdit({ range: sh.getRange(row, 2, 1, 3) });
  const v = sh.getRange(row, 1, 1, 9).getValues()[0];
  assert.match(v[0], /^p/);
  assert.equal(v[3], '45000');
  assert.equal(v[5], 'TRUE');
  sh.getRange(row + 1, 2).setValue('Tanpa harga');
  g.ctx.onEdit({ range: sh.getRange(row + 1, 2) });
  assert.equal(sh.backgrounds[row + 1], '#fde2e2');
  g.fresh();
  assert.ok(g.as('sari', 'bootstrap').data.products.some(p => p.name === 'NIVEA Tangan' && p.price === 45000));
});

test('notes photos at shift end: required, max 4, only for the SPG and their leaders', () => {
  const g = app();
  assert.equal(g.as('sari', 'shift.end', { photos: [JPG, JPG, JPG, JPG, JPG] }).error, 'Maksimal 4 foto catatan.');
  assert.equal(g.as('sari', 'shift.end', { photos: ['data:text/html;base64,eA=='] }).status, 422);
  const r = g.as('sari', 'shift.end', { time: '21:00', photos: [JPG, JPG] });
  assert.ok(r.ok, r.error);
  assert.equal(r.data.shift.photos.length, 2);
  assert.match(r.data.shift.photos[0], /^https:\/\/drive\.google\.com\/thumbnail\?id=/);
  assert.ok(g.as('sari', 'shift.end', { photos: [JPG] }).ok, 'resend is fine');
  assert.equal(g.rows('ShiftPhotos').length, 2, 'no extra photo on resend');
  const key = 'u-sari|2026-10-22';
  assert.equal(g.as('sari', 'bootstrap').data.shifts[key].photos.length, 2);
  assert.equal(g.as('rina', 'bootstrap').data.shifts[key].photos.length, 2);
  assert.equal(g.as('budi', 'bootstrap').data.shifts[key].photos.length, 2);
  assert.equal(g.as('dewi', 'bootstrap').data.shifts[key].photos.length, 0, 'teammate');
});
