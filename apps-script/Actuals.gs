/**
 * Sell in and actual per store, typed in by the Team Leader or Manager from the reports they get (rupiah, per month or per week).
 * Sell out comes from the SPGs' Sales rows of the same dates, from every SPG who sold at the store.
 * One store-month is either monthly or weekly, never both: that would count the same sales twice.
 * A week belongs to the month it starts in.
 */
const ACTUAL_MAX_ = 999999999999;

function actualPeriod_(req) {
  const type = req.periodType, start = String(req.start || '');
  if (type !== 'month' && type !== 'week') fail_('Pilih per bulan atau per minggu.');
  if (!isDate_(start)) fail_('Periode tidak valid.');
  if (start > today_()) fail_('Periode ini belum dimulai.');
  if (type === 'week') {
    if (dow_(start) !== 1) fail_('Minggu harus mulai hari Senin.');
    return { type, start, end: addDays_(start, 6) };
  }
  if (start.slice(8) !== '01') fail_('Periode tidak valid.');
  return { type, start, end: monthLastDay_(start) };
}
function monthLastDay_(date) {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
function actualTeam_(req, me) {
  const team = byId_('Teams', req.teamId);
  if (!team || !canManageTeam_(me, team.id)) fail_('Kamu tidak punya akses ke tim ini.', 403);
  return team;
}
const actualStores_ = team => rows_('Stores').filter(s => s.area_id && s.area_id === team.area_id);
// What is already entered for a store in the month of `start`
function actualsOfMonth_(storeId, start) {
  const mk = start.slice(0, 7), rows = rows_('StoreActuals').filter(e => e.store_id === storeId && e.period_start.slice(0, 7) === mk);
  return { month: rows.find(e => e.period_type === 'month') || null, weeks: rows.filter(e => e.period_type === 'week') };
}
const sumOrNull_ = (rows, col) => {
  const vals = rows.map(r => r[col]).filter(v => v !== null && v !== undefined);
  return vals.length ? vals.reduce((a, v) => a + v, 0) : null;
};

function actActualsReport_(req, me) {
  const team = actualTeam_(req, me), p = actualPeriod_(req), mk = p.start.slice(0, 7);
  const users = {};
  rows_('Users').forEach(u => { users[u.id] = u; });
  const holder = {};
  rows_('StoreTargets').forEach(t => { if (t.month === mk && t.user_id) holder[t.store_id] = users[t.user_id]; });

  // Sales per store and day; weeks can run into the next month
  const lastDay = addDays_(monthLastDay_(p.start), 6), sold = {};
  rows_('Sales').forEach(s => {
    if (s.deleted || s.date < p.start.slice(0, 8) + '01' || s.date > lastDay) return;
    const day = sold[s.store_id] || (sold[s.store_id] = {});
    day[s.date] = (day[s.date] || 0) + (s.subtotal || 0);
  });
  const soldIn = (storeId, from, to) => {
    const day = sold[storeId] || {};
    return Object.keys(day).reduce((a, d) => a + (d >= from && d <= to ? day[d] : 0), 0);
  };

  const rows = actualStores_(team).map(st => {
    const { month, weeks } = actualsOfMonth_(st.id, p.start);
    const own = p.type === 'month' ? month : weeks.find(w => w.period_start === p.start) || null;
    // mode: 'own' = entered for this period, 'weeks' = a month added up from its weeks, 'month' = this week's month is entered as a whole
    const fromWeeks = p.type === 'month' && !month && weeks.length > 0;
    const mode = fromWeeks ? 'weeks' : p.type === 'week' && month ? 'month' : 'own';
    if (!st.active && !own && !fromWeeks) return null;
    const h = holder[st.id];
    return {
      storeId: st.id, name: st.name, chain: st.chain, city: st.city,
      held: !!h && h.team_id === team.id, spg: h ? h.name : '',
      mode, weeks: weeks.length,
      from: fromWeeks ? weeks.map(w => w.period_start).sort()[0] : p.start,
      to: fromWeeks ? weeks.map(w => w.period_end).sort().reverse()[0] : p.end,
      sellIn: fromWeeks ? sumOrNull_(weeks, 'sell_in') : own ? own.sell_in : null,
      actual: fromWeeks ? sumOrNull_(weeks, 'actual') : own ? own.actual : null,
      // Only the weeks that were entered, so sell out and actual cover the same days
      sellOut: fromWeeks ? weeks.reduce((a, w) => a + soldIn(st.id, w.period_start, w.period_end), 0) : soldIn(st.id, p.start, p.end),
      note: own ? own.note : '',
      enteredBy: own && users[own.entered_by] ? users[own.entered_by].name : '',
      enteredAt: own ? own.entered_at : '',
    };
  }).filter(Boolean).sort((a, b) => (b.held - a.held) || String(a.name).localeCompare(String(b.name)));
  return { periodType: p.type, start: p.start, end: p.end, rows, storesWithoutArea: rows_('Stores').filter(s => s.active && !s.area_id).length };
}

function actActualsSave_(req, me) {
  const team = actualTeam_(req, me), p = actualPeriod_(req);
  const list = Array.isArray(req.rows) ? req.rows : [];
  if (!list.length) fail_('Belum ada yang diubah.');
  if (list.length > 500) fail_('Terlalu banyak toko sekaligus.');
  const stores = {};
  actualStores_(team).forEach(s => { stores[s.id] = s; });
  const amount = (v, label) => (v === null || v === undefined || v === '' ? null : int_(v, 0, ACTUAL_MAX_, label + ' tidak valid.'));

  const add = [], touched = {}, logs = [];
  list.forEach(r => {
    const st = stores[r.storeId];
    if (!st) fail_('Toko ini di luar area tim kamu.', 403);
    if (touched[st.id]) return;
    const { month, weeks } = actualsOfMonth_(st.id, p.start);
    if (p.type === 'month' && weeks.length) fail_(st.name + ' sudah diisi per minggu di bulan ini.');
    if (p.type === 'week' && month) fail_(st.name + ' sudah diisi per bulan di bulan ini.');
    const cur = p.type === 'month' ? month : weeks.find(w => w.period_start === p.start);
    const sellIn = amount(r.sellIn, 'Sell in'), actual = amount(r.actual, 'Actual'), note = str_(r.note, 200);
    const curIn = cur ? cur.sell_in : null, curActual = cur ? cur.actual : null, curNote = cur ? cur.note : '';
    if (sellIn === curIn && actual === curActual && note === curNote) return;
    touched[st.id] = true;
    if (sellIn !== null || actual !== null) {
      add.push({
        id: cur ? cur.id : newId_('sa'), store_id: st.id, period_type: p.type, period_start: p.start, period_end: p.end,
        sell_in: sellIn, actual, note, entered_by: me.id, entered_at: nowStamp_(),
      });
    }
    logs.push(st.name + ' · ' + p.start + ': sell in ' + (curIn === null ? '-' : curIn) + ' → ' + (sellIn === null ? '-' : sellIn) + ', actual ' + (curActual === null ? '-' : curActual) + ' → ' + (actual === null ? '-' : actual));
  });
  if (logs.length) {
    replaceRows_('StoreActuals', e => touched[e.store_id] && e.period_type === p.type && e.period_start === p.start, add);
    logs.forEach(l => log_(me, 'ubah', 'sell in & actual', team.id, l));
  }
  return actActualsReport_(req, me);
}
