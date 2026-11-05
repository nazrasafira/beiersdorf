#!/usr/bin/env node
/*
 * Tests for the Apps Script backend (apps-script/*.gs), run in Node with tools/gas-mock.js.
 * Uses the test data in tools/fixtures/demo-data.json (made-up people and sales, DEMO_TODAY 2026-10-22). Usage: node tools/test-apps-script.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { load } = require('./gas-mock');

const DEMO = 'file://' + path.join(__dirname, 'fixtures', 'demo-data.json');
const PHONE = { admin: '081100000001', budi: '081100000002', rina: '081200000001', andi: '081200000002', sari: '081300000001', dewi: '081300000002', rani: '081300000004' };
const PW = { admin: 'admin123', budi: 'manager123', rina: 'leader123', andi: 'leader123', sari: 'spg123', dewi: 'spg123', rani: 'spg123' };

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
  assert.deepEqual([Object.keys(admin.reports).length, Object.keys(admin.storeTargets).length], [0, 0]);
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

test('offline queue: a shift end sent after midnight still ends the shift it belongs to', () => {
  const g = app();
  assert.ok(g.as('rani', 'shift.start', { storeId: 'st1', time: '09:00', date: '2026-10-22' }).ok);
  g.properties.DEMO_TODAY = '2026-10-23';
  const end = { time: '21:00', photos: [JPG], date: '2026-10-22' };
  const r = g.as('rani', 'shift.end', end);
  assert.ok(r.ok, r.error);
  assert.equal(r.data.shift.end, '21:00');
  assert.equal(r.data.shift.photos.length, 1);
  assert.equal(g.as('rani', 'shift.end', end).data.shift.photos.length, 1, 'a resend changes nothing');
  const mine = g.rows('Shifts').filter(s => s.user_id === 'u-rani' && s.date >= '2026-10-22');
  assert.deepEqual(Array.from(mine, s => [s.date, s.end]), [['2026-10-22', '21:00']]);
  assert.equal(g.as('rani', 'bootstrap').data.reports['u-rani|2026-10-22'].noSales, true);
});

test('offline queue: a whole day sent the next day lands on that day', () => {
  const g = app();
  g.properties.DEMO_TODAY = '2026-10-23';
  const date = '2026-10-22';
  assert.ok(g.as('rani', 'shift.start', { storeId: 'st1', time: '09:00', date }).ok);
  assert.ok(g.as('rani', 'shift.switchStore', { storeId: 'st2', time: '12:00', date }).ok);
  const r = g.as('rani', 'sale.add', sale({ userId: 'u-rani', date, time: '14:00', storeId: 'st2' }));
  assert.ok(r.ok, r.error);
  assert.equal(r.data.time, '14:00', 'the sale keeps the time it was made');
  assert.ok(g.as('rani', 'shift.end', { time: '21:00', photos: [JPG], date }).ok);
  const mine = g.rows('Shifts').filter(s => s.user_id === 'u-rani' && s.date >= date);
  assert.deepEqual(Array.from(mine, s => [s.date, s.start, s.end, s.store_id]), [[date, '09:00', '21:00', 'st2']]);
  // The new day is still free to start
  const today = g.as('rani', 'shift.start', { storeId: 'st1', time: '08:00', date: '2026-10-23' });
  assert.equal(today.data.shift.start, '08:00');
});

test('shift date: optional for older pages, never in the future or weeks ago', () => {
  const g = app();
  assert.equal(g.as('rani', 'shift.start', { storeId: 'st1', date: '2026-10-23' }).status, 422, 'future');
  assert.equal(g.as('rani', 'shift.start', { storeId: 'st1', date: 'kemarin' }).status, 422, 'not a date');
  assert.equal(g.as('rani', 'shift.start', { storeId: 'st1', date: '2026-10-01' }).status, 422, 'too long ago');
  assert.ok(g.as('rani', 'shift.start', { storeId: 'st1', time: '09:00' }).ok);
  assert.ok(g.rows('Shifts').some(s => s.user_id === 'u-rani' && s.date === '2026-10-22'));
  assert.ok(g.as('rani', 'shift.end', { time: '21:00', photos: [JPG] }).ok, 'no date: today');
});

test('SPG can edit any past day, but not the future', () => {
  const g = app();
  assert.ok(g.as('sari', 'sale.add', sale({ date: '2026-10-15', time: '' })).ok);
  assert.ok(g.as('sari', 'sale.add', sale({ date: '2025-01-15', time: '' })).ok, 'older than the data sent to the page');
  assert.equal(g.as('sari', 'sale.add', sale({ date: '2026-10-23' })).status, 403, 'future');
});

const heldBy = (g, user, month) => Array.from(g.rows('StoreTargets').filter(t => t.user_id === user && t.month === month), t => t.store_id);

test('sell in comes from the Team Leader, per month, next to the sell out of that month', () => {
  const g = app();
  const q = { teamId: 't1', month: '2026-10' };
  const before = g.as('rina', 'actuals.report', q);
  assert.ok(before.ok, before.error);
  const row = before.data.rows.find(r => r.storeId === 'st1');
  assert.deepEqual([row.sellIn, row.actual, row.held], [null, null, true]);
  const expected = g.rows('Sales').filter(s => s.store_id === 'st1' && !s.deleted && s.date.startsWith('2026-10')).reduce((a, s) => a + s.subtotal, 0);
  assert.equal(row.sellOut, expected);
  assert.ok(before.data.rows.findIndex(r => !r.held) > before.data.rows.findLastIndex(r => r.held), 'own stores first');

  assert.equal(g.as('rina', 'actuals.sellIn', { ...q, rows: [{ storeId: 'st1', sellIn: 5000000 }] }).data.rows.find(r => r.storeId === 'st1').sellIn, 5000000);
  assert.ok(g.as('rina', 'actuals.sellIn', { ...q, rows: [{ storeId: 'st1', sellIn: 6000000 }] }).ok);
  assert.equal(g.rows('SellInSellOut').length, 1, 'saving again corrects the row');
  assert.equal(g.rows('SellInSellOut')[0].sell_in, 6000000);
  assert.equal(g.rows('SellInSellOut')[0].sell_in_by, 'u-rina');
  assert.ok(g.rows('Activity').some(a => a.kind === 'sell in' && a.name.includes('5000000 → 6000000')), 'change is logged');

  assert.equal(g.as('rina', 'actuals.report', { ...q, month: '2026-11' }).status, 422, 'not started yet');
  assert.equal(g.as('rina', 'actuals.report', { ...q, month: '2026-13' }).status, 422);
  assert.equal(g.as('rina', 'actuals.sellIn', { ...q, rows: [{ storeId: 'st2', sellIn: -5 }] }).status, 422);
});

test('sell out comes from the SPG holding the store: product lines with units and price, like daily sales', () => {
  const g = app();
  const month = '2026-10', store = heldBy(g, 'u-sari', month)[0], other = g.rows('Stores').find(s => !heldBy(g, 'u-sari', month).includes(s.id)).id;
  const mine = g.as('sari', 'actuals.mine', { month });
  assert.ok(mine.ok, mine.error);
  assert.deepEqual(Array.from(mine.data.rows, r => r.storeId).sort(), heldBy(g, 'u-sari', month).sort(), 'only their own stores');

  const items = [{ id: 'a', productId: 'p1', qty: 10, price: 50000 }, { id: 'b', productId: 'p2', qty: 3, price: 20000 }];
  const saved = g.as('sari', 'actuals.save', { month, rows: [{ storeId: store, items, note: 'setelah diskon' }] });
  assert.ok(saved.ok, saved.error);
  const back = saved.data.rows.find(r => r.storeId === store);
  assert.equal(back.actual, 10 * 50000 + 3 * 20000, 'rupiah = units × the price entered');
  assert.deepEqual(Array.from(back.items, l => [l.id, l.productId, l.qty, l.price]), [['a', 'p1', 10, 50000], ['b', 'p2', 3, 20000]]);
  const seen = g.as('rina', 'actuals.report', { teamId: 't1', month }).data.rows.find(r => r.storeId === store);
  assert.deepEqual([seen.actual, seen.note, seen.actualBy], [560000, 'setelah diskon', 'Sari Wulandari']);

  // Sell in and sell out sit on one row and don't overwrite each other; changing it later is allowed
  assert.ok(g.as('rina', 'actuals.sellIn', { teamId: 't1', month, rows: [{ storeId: store, sellIn: 9 }] }).ok);
  assert.ok(g.as('sari', 'actuals.save', { month: '2026-09', rows: [{ storeId: heldBy(g, 'u-sari', '2026-09')[0], items: [{ productId: 'p1', qty: 1, price: 1 }] }] }).ok, 'an earlier month');
  assert.ok(g.as('sari', 'actuals.save', { month, rows: [{ storeId: store, items: [{ productId: 'p2', qty: 5, price: 1000 }], note: '' }] }).ok);
  const row = g.rows('SellInSellOut').find(e => e.store_id === store && e.month === month);
  assert.deepEqual([row.sell_in, row.sell_out], [9, 5000]);
  assert.ok(g.as('sari', 'actuals.save', { month, rows: [{ storeId: store, items: [] }] }).ok);
  assert.equal(g.rows('SellInSellOut').find(e => e.store_id === store && e.month === month).sell_out, null, 'emptied again');

  const one = qty => [{ productId: 'p1', qty, price: 1000 }];
  assert.equal(g.as('sari', 'actuals.save', { month, rows: [{ storeId: other, items: one(1) }] }).status, 403, 'not their store');
  assert.equal(g.as('sari', 'actuals.save', { month, rows: [{ storeId: store, items: [{ productId: 'nope', qty: 1, price: 1 }] }] }).status, 422, 'unknown product');
  assert.equal(g.as('sari', 'actuals.save', { month, rows: [{ storeId: store, items: one(0) }] }).status, 422);
  assert.equal(g.as('sari', 'actuals.save', { month: '2026-11', rows: [{ storeId: store, items: one(1) }] }).status, 422);
});

test('sell out export: the team stores of the month with their SPG, codes, target and units', () => {
  const g = app();
  const month = '2026-10', store = heldBy(g, 'u-sari', month)[0];
  assert.ok(g.as('rina', 'user.update', { userId: 'u-sari', name: 'Sari Wulandari', phone: '0813 0000 0001', nmaCode: 'NBCJKT001' }).ok);
  const st = g.rows('Stores').find(s => s.id === store);
  assert.ok(g.as('rina', 'store.save', { id: store, name: st.name, chain: st.chain, city: st.city, address: st.address, code: 'JKT0001' }).ok);
  assert.ok(g.as('sari', 'actuals.save', { month, rows: [{ storeId: store, items: [{ productId: 'p1', qty: 4, price: 1000 }, { productId: 'p1', qty: 3, price: 2000 }] }] }).ok);
  const r = g.as('rina', 'report.sellOut', { teamId: 't1', month });
  assert.ok(r.ok, r.error);
  const mine = r.data.stores.find(s => s.storeId === store);
  assert.deepEqual([mine.spg, mine.spgCode, mine.code, mine.submitted, mine.items.p1.qty, mine.items.p1.value], ['Sari Wulandari', 'NBCJKT001', 'JKT0001', true, 7, 10000], 'lines of one product add up');
  assert.ok(mine.target > 0);
  assert.ok(r.data.stores.every(s => g.rows('Users').find(u => u.name === s.spg).team_id === 't1'), 'only the team');
  assert.ok(r.data.products.length > 0 && r.data.products[0].sku);
  assert.equal(g.as('sari', 'report.sellOut', { teamId: 't1', month }).status, 403);
  assert.equal(g.as('andi', 'report.sellOut', { teamId: 't1', month }).status, 403);
});

test('setupSheet renames an old StoreActuals tab and keeps its rows', () => {
  const g = app();
  const ss = g.ctx.spreadsheet_();
  assert.ok(g.as('rina', 'actuals.sellIn', { teamId: 't1', month: '2026-10', rows: [{ storeId: 'st1', sellIn: 7 }] }).ok);
  ss.getSheetByName('SellInSellOut').setName('StoreActuals');
  g.ctx.setupSheet();
  g.fresh();
  assert.ok(!ss.getSheetByName('StoreActuals'), 'old tab gone');
  assert.equal(g.rows('SellInSellOut').find(e => e.store_id === 'st1').sell_in, 7, 'row kept');
});

test('sell in and actual: each role only touches its own number', () => {
  const g = app();
  const q = { teamId: 't1', month: '2026-10' };
  assert.equal(g.as('sari', 'actuals.report', q).status, 403);
  assert.equal(g.as('sari', 'actuals.sellIn', { ...q, rows: [{ storeId: 'st1', sellIn: 1 }] }).status, 403);
  assert.equal(g.as('rina', 'actuals.save', { month: q.month, rows: [{ storeId: 'st1', items: [{ productId: 'p1', qty: 1, price: 1 }] }] }).status, 403);
  assert.equal(g.as('rina', 'actuals.mine', { month: q.month }).status, 403);
  assert.equal(g.as('admin', 'actuals.report', q).status, 403);
  assert.equal(g.as('andi', 'actuals.report', q).status, 403, 'another team');
  assert.ok(g.as('budi', 'actuals.sellIn', { ...q, rows: [{ storeId: 'st1', sellIn: 1 }] }).ok, 'manager of the area');
  const far = g.rows('Stores').find(s => s.id === 'st2');
  far.area_id = 'elsewhere';
  g.ctx.save_('Stores', far);
  assert.equal(g.as('rina', 'actuals.sellIn', { ...q, rows: [{ storeId: 'st2', sellIn: 1 }] }).status, 403, 'store outside the area');
});

const salesOf = (g, store, from, to) => g.rows('Sales').filter(s => s.store_id === store && !s.deleted && s.date >= from && s.date <= to).reduce((a, s) => a + s.subtotal, 0);

test('achievement: any date range, a partial month counts by working days, months without a target left out', () => {
  const g = app();
  const q = { teamId: 't1', from: '2026-09-01', to: '2026-10-22' };
  const r = g.as('rina', 'report.achievement', q);
  assert.ok(r.ok, r.error);
  const row = r.data.stores.find(s => s.id === 'st1');
  assert.equal(row.offtake, salesOf(g, 'st1', q.from, q.to));
  assert.equal(row.fromActual, 0);
  const t = m => g.rows('StoreTargets').find(x => x.store_id === 'st1' && x.month === m).monthly;
  assert.ok(row.target > t('2026-09') && row.target < t('2026-09') + t('2026-10'), 'October counts only part of its target');
  const achs = r.data.spgs.map(s => s.ach).filter(a => a !== null);
  assert.deepEqual(achs, achs.slice().sort((a, b) => b - a), 'best first');

  const sept = g.as('rina', 'report.achievement', { ...q, to: '2026-09-30' }).data.stores.find(s => s.id === 'st1');
  assert.equal(sept.target, t('2026-09'), 'a whole month counts its whole target');
  assert.equal(sept.offtake, salesOf(g, 'st1', '2026-09-01', '2026-09-30'));

  const sep = g.rows('StoreTargets').find(x => x.store_id === 'st1' && x.month === '2026-09');
  sep.monthly = 0;
  g.ctx.save_('StoreTargets', sep);
  const after = g.as('rina', 'report.achievement', q).data;
  const sepSold = salesOf(g, 'st1', '2026-09-01', '2026-09-30');
  assert.equal(after.stores.find(s => s.id === 'st1').offtake, row.offtake - sepSold, 'a month without a target counts for neither');
  assert.equal(after.excluded - r.data.excluded, sepSold);
});

test('achievement: an actual from the SPG replaces the sales of its month, other months keep the SPG sales', () => {
  const g = app();
  const store = heldBy(g, 'u-sari', '2026-09')[0];
  const price = g.rows('Products').find(p => p.id === 'p1').price, total = 300 * price;
  assert.ok(g.as('sari', 'actuals.save', { month: '2026-09', rows: [{ storeId: store, items: [{ productId: 'p1', qty: 300, price }] }] }).ok);
  const q = { teamId: 't1', from: '2026-09-01', to: '2026-10-22' };
  const data = g.as('rina', 'report.achievement', q).data;
  const row = data.stores.find(s => s.id === store);
  assert.equal(row.fromActual, total);
  assert.equal(row.fromSpg, salesOf(g, store, '2026-10-01', '2026-10-22'));
  assert.equal(row.offtake, total + row.fromSpg);
  assert.equal(data.spgs.find(s => s.id === 'u-sari').fromActual, total, 'credited to the SPG holding the store');
  const part = g.as('rina', 'report.achievement', { ...q, from: '2026-09-01', to: '2026-09-03' }).data.stores.find(s => s.id === store);
  assert.equal(part.fromActual, Math.round(total * 3 / 30), 'part of the month, evenly per day');
});

test('achievement: leaders and managers only, valid dates, not the future', () => {
  const g = app();
  const q = { teamId: 't1', from: '2026-10-01', to: '2026-10-22' };
  assert.equal(g.as('sari', 'report.achievement', q).status, 403);
  assert.equal(g.as('admin', 'report.achievement', q).status, 403);
  assert.equal(g.as('andi', 'report.achievement', q).status, 403);
  assert.ok(g.as('budi', 'report.achievement', q).ok);
  assert.equal(g.as('rina', 'report.achievement', { ...q, to: '2026-10-23' }).status, 422);
  assert.equal(g.as('rina', 'report.achievement', { ...q, from: '2026-10-23' }).status, 422);
  assert.equal(g.as('rina', 'report.achievement', { ...q, from: '2020-01-01' }).status, 422, 'at most 2 years');
});

test('leaders edit their team only, manager the area, admin no reports', () => {
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
  assert.ok(g.as('admin', 'user.add', { role: 'manager', name: 'Sup', phone: '081177777777' }).ok);
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
  const other = g.rows('Users').find(u => u.role === 'spg' && u.team_id === 't2');
  assert.equal(g.as('rina', 'targets.save', { rows: [{ storeId: 'st1', userId: other.id, mk: '2026-11', monthly: 1 }] }).status, 403);
  const body = { teamId: 't1', workingDays: [1, 2, 3, 4, 5], editDays: 3, reminder: '19:30', holidays: [{ date: '2026-12-25', name: 'Natal', working: false }] };
  assert.equal(g.as('andi', 'settings.save', body).status, 403);
  assert.ok(g.as('rina', 'settings.save', body).ok);
  const st = g.as('rina', 'bootstrap').data.settings.t1;
  assert.deepEqual([st.workingDays, st.editDays, st.reminder, st.holidays.length], [[1, 2, 3, 4, 5], 3, '19:30', 1]);
});

test('products and stores: admin, manager and leaders change any; SPGs none', () => {
  const g = app();
  assert.ok(g.as('rina', 'product.save', { id: 'p1', name: 'NIVEA Soft Creme', price: 1000 }).ok, 'leaders change any product');
  const p = g.as('rina', 'product.save', { name: 'NIVEA Baru', price: 25000 }).data.product;
  assert.ok(g.as('rina', 'product.save', { id: p.id, name: 'NIVEA Baru 2', price: 26000 }).ok);
  assert.ok(g.as('budi', 'product.save', { id: 'p1', name: 'NIVEA Soft', sku: 'X1', price: 46000 }).ok);
  assert.equal(g.as('budi', 'product.save', { id: p.id, name: 'Y', sku: 'X1', price: 1 }).error, 'SKU sudah dipakai produk lain.');
  const notHers = g.rows('Stores').find(st => st.created_by !== 'u-rina');
  assert.ok(g.as('rina', 'store.save', { id: notHers.id, name: notHers.name, city: notHers.city }).ok, 'leaders change any store');
  assert.ok(g.as('rina', 'store.save', { id: 'st1', name: 'Toko Kemang', city: 'Jakarta Selatan' }).ok);
  assert.ok(g.as('rina', 'store.save', { name: 'Toko Baru', city: 'Depok' }).ok);
  const withPhoto = g.as('rina', 'store.save', { id: 'st1', name: 'Toko Kemang', city: 'Jakarta Selatan', image: JPG });
  assert.ok(/^https:\/\/drive\.google\.com\/thumbnail\?id=/.test(withPhoto.data.store.image), 'store photo saved in Drive');
  assert.equal(g.as('rina', 'store.save', { id: 'st1', name: 'Toko Kemang', city: 'Jakarta Selatan' }).data.store.image, withPhoto.data.store.image, 'photo kept when not sent');
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

test('starting data: Admin, 199 products with subbrand and barcode, 16 stores', () => {
  const g = load({ DEMO_TODAY: '2026-10-22' }, { quiet: true });
  g.ctx.setupSheet();
  g.ctx.importDemoData('file://' + path.join(__dirname, '..', 'apps-script', 'demo-data.json'));
  const login = g.call({ action: 'login', phone: '081100000001', password: 'admin123' });
  assert.ok(login.ok);
  const s = login.data.state;
  assert.deepEqual([s.users.length, s.products.length, s.stores.length], [1, 199, 16]);
  const a1 = s.products.find(p => p.sku === 'A1');
  assert.deepEqual([a1.name, a1.brand, a1.barcode, a1.price], ['NCRM CREME TIN 60ML', 'NIVEA ALL PURPOSE CREAMS', '8850029801025', 22470]);
  const saved = g.call({ action: 'product.save', token: login.data.token, id: a1.id, name: a1.name, sku: 'A1', brand: 'NIVEA BODY', barcode: '123', price: 23000 });
  assert.deepEqual([saved.data.product.brand, saved.data.product.barcode, saved.data.product.price], ['NIVEA BODY', '123', 23000]);
});

test('stores and products copied or typed in the Sheet get their own id', () => {
  const g = load({ DEMO_TODAY: '2026-10-22' }, { quiet: true });
  g.ctx.setupSheet();
  g.ctx.importDemoData('file://' + path.join(__dirname, '..', 'apps-script', 'demo-data.json'));
  const sh = g.ss.getSheetByName('Stores'), width = sh.data[0].length;
  const row = (id, name) => { const r = Array(width).fill(''); r[0] = id; r[1] = name; r[2] = 'LSI'; r[3] = 'Bogor'; r[6] = 'TRUE'; return r; };
  // A copied row (same id as st8) and a row without id, as when edited by hand
  sh.data.push(row('st8', 'Toko Salinan'), row('', 'Toko Tanpa ID'));
  assert.match(g.ctx.setupSheet(), /2 baris/);
  g.ctx.handle_('{}');
  const ids = g.ctx.rows_('Stores').map(s => s.id);
  assert.equal(new Set(ids).size, ids.length, 'every store has its own id');
  assert.equal(g.ctx.rows_('Stores').find(s => s.name === 'AEON Mall Kota Wisata').id, 'st8', 'the first row keeps its id');
  // Typing a new row: onEdit gives it an id at once; pasting a copied id gets a new one
  sh.data.push(row('', 'Toko Baru'), row('st9', 'Toko Tempel'));
  const n = sh.data.length;
  g.ctx.onEdit({ range: sh.getRange(n - 1, 1, 2, width) });
  g.ctx.handle_('{}');
  const added = g.ctx.rows_('Stores').filter(s => s.name === 'Toko Baru' || s.name === 'Toko Tempel');
  assert.ok(added.every(s => /^st[0-9a-f]{10}$/.test(s.id)), added.map(s => s.id).join());
  assert.equal(g.ctx.setupSheet(), 'ok', 'nothing left to repair');
});

test('targets are per store: one SPG per store, an SPG holds several', () => {
  const g = app();
  const mk = '2026-11';
  assert.ok(g.as('rina', 'targets.save', { rows: [
    { storeId: 'st1', userId: 'u-sari', mk, monthly: 30000000 },
    { storeId: 'st2', userId: 'u-sari', mk, monthly: 10000000, daily: 500000 },
  ] }).ok);
  const mine = g.as('sari', 'bootstrap').data.storeTargets;
  assert.deepEqual([mine['st1|' + mk].userId, mine['st2|' + mk].userId, mine['st2|' + mk].daily], ['u-sari', 'u-sari', 500000]);
  // Another team sees the stores as taken, without the numbers, and can't take them
  const andi = g.as('andi', 'bootstrap').data;
  assert.deepEqual(andi.storeTargets['st1|' + mk], { userId: null, taken: true });
  const other = g.rows('Users').find(u => u.role === 'spg' && u.team_id === 't2' && u.active);
  assert.equal(g.as('andi', 'targets.save', { rows: [{ storeId: 'st1', userId: other.id, mk, monthly: 1 }] }).status, 409);
  // A target needs an SPG; the same store twice is refused; unknown store
  assert.equal(g.as('rina', 'targets.save', { rows: [{ storeId: 'st3', userId: null, mk, monthly: 5 }] }).status, 422);
  assert.equal(g.as('rina', 'targets.save', { rows: [{ storeId: 'st3', userId: 'u-sari', mk }, { storeId: 'st3', userId: 'u-dewi', mk }] }).status, 422);
  assert.equal(g.as('rina', 'targets.save', { rows: [{ storeId: 'nope', userId: 'u-sari', mk }] }).status, 422);
  // Moving a store to a teammate replaces the row (still one SPG per store)
  assert.ok(g.as('rina', 'targets.save', { rows: [{ storeId: 'st2', userId: 'u-dewi', mk, monthly: 12000000 }] }).ok);
  g.fresh();
  assert.equal(g.rows('StoreTargets').filter(t => t.store_id === 'st2' && t.month === mk).map(t => t.user_id).join(), 'u-dewi');
  // Released stores (no SPG) and stores of a deactivated SPG are free for other teams
  assert.ok(g.as('rina', 'targets.save', { rows: [{ storeId: 'st2', userId: null, mk }] }).ok);
  assert.ok(g.as('andi', 'targets.save', { rows: [{ storeId: 'st2', userId: other.id, mk, monthly: 2 }] }).ok);
  assert.ok(g.as('rina', 'user.setActive', { userId: 'u-sari', active: false }).ok);
  assert.ok(g.as('andi', 'targets.save', { rows: [{ storeId: 'st1', userId: other.id, mk, monthly: 3 }] }).ok);
  // Supervisor may move stores between teams in the area; SPGs and admins may not set targets
  assert.ok(g.as('budi', 'targets.save', { rows: [{ storeId: 'st1', userId: 'u-dewi', mk, monthly: 4 }] }).ok);
  assert.equal(g.as('dewi', 'targets.save', { rows: [{ storeId: 'st5', userId: 'u-dewi', mk }] }).status, 403);
  assert.equal(g.as('admin', 'targets.save', { rows: [{ storeId: 'st5', userId: 'u-dewi', mk }] }).status, 403);
});

test('daily recap: days, totals, OFF and missing days, sorted by achievement', () => {
  const g = app();
  const r = g.as('rina', 'report.dailyRecap', { from: '2026-10-01', to: '2026-10-11' });
  assert.ok(r.ok, r.error);
  const d = r.data;
  assert.deepEqual([d.days.length, d.days[0], d.rows.length, d.teams[0].name], [11, '2026-10-01', 8, 'Jakarta Selatan']);
  // 4 Oct 2026 is a Sunday: day off for Tim Jakarta Selatan (Mon–Sat)
  assert.equal(d.offDays[3], true);
  d.rows.forEach(x => assert.equal(x.cells[3], 'OFF'));
  // Totals match the Sales tab, targets are the October store targets, rows sorted by achievement
  const sales = g.rows('Sales'), users = g.rows('Users'), targets = g.rows('StoreTargets');
  let prev = Infinity;
  d.rows.forEach(x => {
    const u = users.find(y => y.name === x.name);
    const total = sales.filter(s => s.user_id === u.id && !s.deleted && s.date >= '2026-10-01' && s.date <= '2026-10-11').reduce((a, s) => a + s.subtotal, 0);
    const target = targets.filter(t => t.user_id === u.id && t.month === '2026-10').reduce((a, t) => a + t.monthly, 0);
    assert.deepEqual([x.total, x.target], [total, target]);
    assert.equal(x.total, x.cells.filter(c => typeof c === 'number').reduce((a, c) => a + c, 0));
    assert.ok(x.ach <= prev);
    prev = x.ach;
  });
  // Sari skipped 13 Oct (a Tuesday, working day): MISSING
  const sari = g.as('rina', 'report.dailyRecap', { from: '2026-10-13', to: '2026-10-13' }).data.rows.find(x => x.name === 'Sari Wulandari');
  assert.deepEqual(sari.cells, ['MISSING']);
});

test('SPG schedule: own days and hours, set by their leader; recap uses them', () => {
  const g = app();
  const set = (who, params) => g.as(who, 'user.schedule', Object.assign({ userId: 'u-sari' }, params));
  assert.equal(set('sari', { days: [1, 3, 5] }).status, 403, 'not by the SPG herself');
  assert.equal(set('andi', { days: [1, 3, 5] }).status, 403, 'not by another team');
  assert.equal(set('rina', { days: [] }).status, 422);
  assert.equal(set('rina', { days: [1], start: '19:00', end: '10:00' }).status, 422);
  assert.equal(set('rina', { days: [1], start: '10:00' }).status, 422, 'both hours or none');
  assert.ok(set('rina', { days: [5, 1, 3, 3], start: '10:00', end: '19:00' }).ok);
  const sari = g.as('sari', 'bootstrap').data.users.find(u => u.id === 'u-sari');
  assert.equal([sari.workDays.join(), sari.workStart, sari.workEnd].join(' '), '1,3,5 10:00 19:00');
  // 13 Oct 2026 is a Tuesday: a team working day, but not one of Sari's days → OFF instead of MISSING
  assert.equal(g.as('rina', 'report.dailyRecap', { from: '2026-10-13', to: '2026-10-13' }).data.rows.find(x => x.name === 'Sari Wulandari').cells.join(), 'OFF');
  // Back to the team's working days
  assert.ok(set('budi', { useTeam: true }).ok, 'the manager of the area may too');
  assert.equal(g.as('sari', 'bootstrap').data.users.find(u => u.id === 'u-sari').workDays, null);
  assert.equal(g.as('rina', 'report.dailyRecap', { from: '2026-10-13', to: '2026-10-13' }).data.rows.find(x => x.name === 'Sari Wulandari').cells.join(), 'MISSING');
});

test('store targets: past months locked, last month\'s team keeps its stores, daily ≤ weekly ≤ monthly', () => {
  const g = app();
  const save = (who, row) => g.as(who, 'targets.save', { rows: [Object.assign({ mk: '2026-11' }, row)] });
  assert.equal(save('rina', { mk: '2026-09', storeId: 'st1', userId: 'u-sari', monthly: 1 }).status, 422, 'September is over');
  // November not set yet: st1 stays with Rina's team (Sari held it in October)
  const other = g.rows('Users').find(u => u.role === 'spg' && u.team_id === 't2' && u.active);
  assert.equal(save('andi', { storeId: 'st1', userId: other.id, monthly: 1 }).status, 409);
  assert.ok(save('rina', { storeId: 'st1', userId: null }).ok, 'released for November');
  assert.deepEqual(g.as('rina', 'bootstrap').data.storeTargets['st1|2026-11'], { userId: null, released: true });
  assert.ok(save('andi', { storeId: 'st1', userId: other.id, monthly: 1 }).ok, 'free after the release');
  // Manual weekly / daily targets must fit
  assert.equal(save('rina', { storeId: 'st2', userId: 'u-dewi', monthly: 50, weekly: 60 }).status, 422);
  assert.equal(save('rina', { storeId: 'st2', userId: 'u-dewi', monthly: 50, weekly: 20, daily: 30 }).status, 422);
  assert.equal(save('rina', { storeId: 'st2', userId: 'u-dewi', weekly: 20 }).status, 422, 'needs a monthly target');
  assert.ok(save('rina', { storeId: 'st2', userId: 'u-dewi', monthly: 50, weekly: 20, daily: 5 }).ok);
});

test('accounts: deactivated login message, fix name/phone, start date, store names', () => {
  const g = app();
  assert.ok(g.as('rina', 'user.setActive', { userId: 'u-dewi', active: false }).ok);
  assert.match(g.call({ action: 'login', phone: PHONE.dewi, password: 'spg123' }).error, /dinonaktifkan/);
  assert.equal(g.call({ action: 'login', phone: PHONE.dewi, password: 'salah' }).error, 'Nomor HP atau password salah.', 'no hint without the password');
  // Fix a typo in the name / phone
  assert.ok(g.as('rina', 'user.update', { userId: 'u-sari', name: 'Sari W.', phone: '0813 0000 0001' }).ok);
  assert.equal(g.as('rina', 'user.update', { userId: 'u-sari', name: 'Sari', phone: PHONE.rani }).status, 422, 'phone already used');
  assert.equal(g.as('andi', 'user.update', { userId: 'u-sari', name: 'X', phone: '081311112222' }).status, 403);
  assert.equal(g.as('sari', 'bootstrap').data.users.find(u => u.id === 'u-sari').name, 'Sari W.');
  // A new SPG: days before the account existed are empty in the recap, not MISSING
  const nu = g.as('rina', 'user.add', { role: 'spg', name: 'SPG Baru', phone: '081344445555', teamId: 't1' }).data.user;
  assert.equal(nu.since, '2026-10-22');
  const row = g.as('rina', 'report.dailyRecap', { from: '2026-10-20', to: '2026-10-22' }).data.rows.find(x => x.name === 'SPG Baru');
  assert.equal(row.cells.join('|'), '||MISSING');
  // Store names are unique; cities are written the same way
  assert.equal(g.as('rina', 'store.save', { name: 'toko kemang', city: 'Jakarta Selatan' }).status, 422);
  assert.equal(g.as('rina', 'store.save', { name: 'Toko Kemang 2', city: '  jakarta   selatan ' }).data.store.city, 'Jakarta Selatan');
});

test('role renamed: older "supervisor" rows still work and Siapkan tab rewrites them as "manager"', () => {
  const g = app();
  const sh = g.ss.getSheetByName('Users'), roleCol = sh.data[0].indexOf('role');
  const row = sh.data.findIndex(r => r[0] === 'u-budi');
  sh.data[row][roleCol] = 'supervisor'; // as in a Sheet made before the rename
  g.ctx.handle_('{}');
  assert.equal(g.as('budi', 'bootstrap').data.teams.length, 5, 'the manager still sees the area');
  g.ctx.setupSheet();
  assert.equal(sh.data[row][roleCol], 'manager');
});

test('daily recap: who may see what', () => {
  const g = app();
  assert.equal(g.as('sari', 'report.dailyRecap', { from: '2026-10-01', to: '2026-10-11' }).status, 403);
  assert.equal(g.as('rina', 'report.dailyRecap', { from: '2026-10-01', to: '2026-10-11', teamId: 't2' }).status, 403);
  assert.equal(g.as('rina', 'report.dailyRecap', { from: '2026-10-11', to: '2026-10-01' }).status, 422);
  assert.equal(g.as('rina', 'report.dailyRecap', { from: '2026-08-01', to: '2026-10-11' }).status, 422);
  const all = g.as('admin', 'report.dailyRecap', { from: '2026-10-20', to: '2026-10-22' }).data;
  assert.deepEqual([all.teams.length, all.rows.length], [g.rows('Teams').length, g.rows('Users').filter(u => u.role === 'spg' && u.active).length]);
  const one = g.as('admin', 'report.dailyRecap', { from: '2026-10-20', to: '2026-10-22', teamId: 't3' }).data;
  assert.equal(one.rows.length, g.rows('Users').filter(u => u.role === 'spg' && u.active && u.team_id === 't3').length);
});
