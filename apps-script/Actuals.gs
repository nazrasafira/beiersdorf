/**
 * Sell in and sell out per store and month. The Team Leader or Manager enters sell in (rupiah) from Nivea's report.
 * The SPG holding the store that month enters the sell out from the store's monthly report, line by line like daily sales:
 * product, units and price. Its rupiah total is the store's sell out (the pages' JSON still calls it actual).
 * Daily sales come from the Sales rows of the month, from every SPG who sold at the store.
 */
const ACTUAL_MAX_ = 999999999999;

function monthLastDay_(date) {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
function actualMonth_(req) {
  const month = String(req.month || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail_('Bulan tidak valid.');
  if (month > today_().slice(0, 7)) fail_('Bulan ini belum dimulai.');
  return month;
}
function actualTeam_(req, me) {
  const team = byId_('Teams', req.teamId);
  if (!team || !canManageTeam_(me, team.id)) fail_('Kamu tidak punya akses ke tim ini.', 403);
  return team;
}
const actualStores_ = team => rows_('Stores').filter(s => s.area_id && s.area_id === team.area_id);
const actualRow_ = (storeId, month) => find_('SellInSellOut', e => e.store_id === storeId && e.month === month);
const actualAmount_ = (v, label) => (v === null || v === undefined || v === '' ? null : int_(v, 0, ACTUAL_MAX_, label + ' tidak valid.'));
const orDash_ = v => (v === null || v === undefined ? '-' : v);
function saveActualRow_(cur, storeId, month, fields) {
  if (cur) save_('SellInSellOut', Object.assign(cur, fields));
  else append_('SellInSellOut', [Object.assign({ id: newId_('sa'), store_id: storeId, month, sell_in: null, sell_in_by: '', sell_in_at: '', sell_out: null, sell_out_by: '', sell_out_at: '', note: '' }, fields)]);
}
// Sales per store in a month
function soldInMonth_(month) {
  const sold = {};
  rows_('Sales').forEach(s => { if (!s.deleted && s.date.slice(0, 7) === month) sold[s.store_id] = (sold[s.store_id] || 0) + (s.subtotal || 0); });
  return sold;
}

/** Team Leader / Manager: every store in the team's area, the team's own stores first. */
function actActualsReport_(req, me) {
  const team = actualTeam_(req, me), month = actualMonth_(req);
  const users = {}, holder = {};
  rows_('Users').forEach(u => { users[u.id] = u; });
  rows_('StoreTargets').forEach(t => { if (t.month === month && t.user_id) holder[t.store_id] = users[t.user_id]; });
  const sold = soldInMonth_(month);
  const rows = actualStores_(team).map(st => {
    const row = actualRow_(st.id, month), h = holder[st.id];
    if (!st.active && !row) return null;
    return {
      storeId: st.id, name: st.name, chain: st.chain, city: st.city, held: !!h && h.team_id === team.id, spg: h ? h.name : '',
      sellIn: row ? row.sell_in : null, actual: row ? row.sell_out : null, note: row ? row.note : '', sellOut: sold[st.id] || 0,
      actualBy: row && users[row.sell_out_by] ? users[row.sell_out_by].name : '',
    };
  }).filter(Boolean).sort((a, b) => (b.held - a.held) || String(a.name).localeCompare(String(b.name)));
  return { month, rows, storesWithoutArea: rows_('Stores').filter(s => s.active && !s.area_id).length };
}

function actSellInSave_(req, me) {
  const team = actualTeam_(req, me), month = actualMonth_(req);
  const list = Array.isArray(req.rows) ? req.rows : [];
  if (!list.length || list.length > 500) fail_('Belum ada yang diubah.');
  const stores = {};
  actualStores_(team).forEach(s => { stores[s.id] = s; });
  list.forEach(r => {
    const st = stores[r.storeId];
    if (!st) fail_('Toko ini di luar area tim kamu.', 403);
    const sellIn = actualAmount_(r.sellIn, 'Sell in'), cur = actualRow_(st.id, month), before = cur ? cur.sell_in : null;
    if (sellIn === before) return;
    saveActualRow_(cur, st.id, month, { sell_in: sellIn, sell_in_by: me.id, sell_in_at: nowStamp_() });
    log_(me, 'ubah', 'sell in', team.id, st.name + ' · ' + month + ': ' + orDash_(before) + ' → ' + orDash_(sellIn));
  });
  return actActualsReport_(req, me);
}

// Stores an SPG holds in a month
const heldStoreIds_ = (me, month) => rows_('StoreTargets').filter(t => t.month === month && t.user_id === me.id).map(t => t.store_id);

const MAX_UNITS_ = 1000000;
// Stored sell out of a row: [{ id, productId, qty, price }] (sell_out_items: JSON [[id, productId, qty, price], ...])
function itemsOf_(row) {
  if (!row || !row.sell_out_items) return [];
  try {
    const raw = JSON.parse(row.sell_out_items);
    return Array.isArray(raw) ? raw.map(([id, productId, qty, price]) => ({ id, productId, qty, price })) : [];
  } catch (e) { return []; }
}
// The SPG's lines → what is stored, and their rupiah total
function parseItems_(raw) {
  const products = {};
  rows_('Products').forEach(p => { products[p.id] = p; });
  const lines = (Array.isArray(raw) ? raw : []).slice(0, 2000).map((x, i) => {
    const p = products[x && x.productId];
    if (!p) fail_('Produk tidak ditemukan.');
    const qty = int_(x.qty, 1, MAX_UNITS_, 'Jumlah ' + p.name + ' tidak valid.');
    const price = int_(x.price, 0, 1e9, 'Harga ' + p.name + ' tidak valid.');
    return [str_(x.id, 40) || 'l' + i, p.id, qty, price];
  });
  return { json: lines.length ? JSON.stringify(lines) : '', total: lines.length ? lines.reduce((a, l) => a + l[2] * l[3], 0) : null };
}

/** SPG: the stores they hold in the month, with the sell out they entered. */
function actActualsMine_(req, me) {
  if (me.role !== 'spg') fail_('Hanya SPG yang mengisi sell out bulanan.', 403);
  const month = actualMonth_(req), sold = soldInMonth_(month);
  const rows = heldStoreIds_(me, month).map(id => {
    const st = byId_('Stores', id), row = actualRow_(id, month);
    return st ? { storeId: id, name: st.name, city: st.city, sellOut: sold[id] || 0, actual: row ? row.sell_out : null, note: row ? row.note : '', items: itemsOf_(row), savedAt: row ? row.actual_at : '' } : null;
  }).filter(Boolean).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return { month, rows };
}

function actActualSave_(req, me) {
  if (me.role !== 'spg') fail_('Hanya SPG yang mengisi sell out bulanan.', 403);
  const month = actualMonth_(req), held = heldStoreIds_(me, month);
  const list = Array.isArray(req.rows) ? req.rows : [];
  if (!list.length || list.length > 100) fail_('Belum ada yang diubah.');
  list.forEach(r => {
    if (held.indexOf(String(r.storeId)) < 0) fail_('Toko ini bukan toko yang kamu pegang di bulan ini.', 403);
    const { json, total } = parseItems_(r.items), note = str_(r.note, 200), cur = actualRow_(String(r.storeId), month);
    const before = cur ? cur.sell_out : null;
    if (json === (cur ? cur.sell_out_items || '' : '') && note === (cur ? cur.note : '')) return;
    saveActualRow_(cur, String(r.storeId), month, { sell_out: total, sell_out_items: json, sell_out_by: me.id, sell_out_at: nowStamp_(), note });
    log_(me, 'ubah', 'sell out', me.team_id, (byId_('Stores', r.storeId) || {}).name + ' · ' + month + ': ' + orDash_(before) + ' → ' + orDash_(total));
  });
  return actActualsMine_(req, me);
}

/**
 * Team Leader / Manager: the month's sell out of the team's stores for the Excel in the company's layout
 * (one block of Qty and Val per store; assets/js/recap-export.js). Products are listed in catalog order.
 */
function actSellOutExport_(req, me) {
  const team = actualTeam_(req, me), month = actualMonth_(req);
  const users = {};
  rows_('Users').forEach(u => { users[u.id] = u; });
  const stores = rows_('StoreTargets').filter(t => t.month === month && t.user_id && users[t.user_id] && users[t.user_id].team_id === team.id).map(t => {
    const st = byId_('Stores', t.store_id), u = users[t.user_id], row = actualRow_(t.store_id, month);
    return st && { storeId: st.id, name: st.name, code: st.code || '', spg: u.name, spgCode: u.nma_code || '', target: t.monthly || 0, items: itemsOf_(row), submitted: !!(row && row.sell_out_items) };
  }).filter(Boolean).sort((a, b) => a.spg.localeCompare(b.spg) || a.name.localeCompare(b.name));
  // Per product: units and rupiah of the store's lines
  const used = {};
  stores.forEach(st => {
    const per = {};
    st.items.forEach(l => { const x = per[l.productId] || (per[l.productId] = { qty: 0, value: 0 }); x.qty += l.qty; x.value += l.qty * l.price; used[l.productId] = true; });
    st.items = per;
  });
  const products = rows_('Products').filter(p => p.id && (p.active || used[p.id])).map(p => ({ id: p.id, sku: p.sku, name: p.name, brand: p.brand || '', barcode: p.barcode || '', price: p.price || 0 }));
  return { month, team: team.name, products, stores };
}
