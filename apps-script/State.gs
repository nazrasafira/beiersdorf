/**
 * Everything a page needs for the logged-in user, limited to what they may see, in the same shape
 * as the demo's local data (so all page calculations work unchanged).
 * Window: first day of the previous month until today.
 */
function buildState_(me) {
  const today = today_();
  const from = (function () {
    const [y, m] = today.split('-').map(Number);
    const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
    return py + '-' + String(pm).padStart(2, '0') + '-01';
  })();
  const teamIds = teamIds_(me);
  const teams = rows_('Teams').filter(t => teamIds.indexOf(t.id) >= 0);
  const areaIds = me.role === 'admin' ? rows_('Areas').map(a => a.id) : teams.map(t => t.area_id).concat(me.area_id ? [me.area_id] : []);

  // People: everyone in the visible teams + all staff (for "set by" / "added by" names)
  const people = rows_('Users').filter(u => teamIds.indexOf(u.team_id) >= 0 || u.role !== 'spg');
  const spgIds = people.filter(u => u.role === 'spg').map(u => u.id);
  // Whose sales: SPG → own (full) + teammates (daily totals only); Leader/Supervisor → team SPGs (full); Admin → none
  const fullIds = me.role === 'spg' ? [me.id] : me.role === 'admin' ? [] : spgIds;
  const totalsIds = me.role === 'spg' ? spgIds.filter(id => id !== me.id) : [];

  const settings = {};
  teamIds.forEach(id => {
    settings[id] = Object.assign(settingsFor_(id), {
      holidays: rows_('Holidays').filter(h => h.team_id === id).sort((a, b) => (a.date < b.date ? -1 : 1))
        .map(h => ({ date: h.date, name: h.name, working: h.working })),
    });
  });

  return {
    version: 'live',
    me: me.id,
    mustChangePassword: me.must_change_password,
    today, from,
    areas: rows_('Areas').filter(a => areaIds.indexOf(a.id) >= 0).map(a => ({ id: a.id, name: a.name })),
    teams: teams.map(teamOut_),
    users: people.map(u => userOut_(u, u.id === me.id || canManageUser_(me, u))),
    products: rows_('Products').filter(p => p.id).map(productOut_),
    stores: rows_('Stores').map(storeOut_),
    settings,
    targets: targetsFor_(me.role === 'admin' ? [] : spgIds),
    reports: reportsFor_(fullIds, totalsIds, from, today),
    shifts: shiftsFor_(fullIds.concat(totalsIds), from, today, fullIds),
    activity: me.role === 'admin' || me.role === 'supervisor' ? rows_('Activity').slice(-200).reverse()
      .map(a => ({ at: a.at, by: a.by, action: a.action, kind: a.kind, id: a.subject_id, name: a.name })) : [],
  };
}

const userOut_ = (u, withPhone) => ({
  id: u.id, name: u.name, role: u.role, teamId: u.team_id || null, areaId: u.area_id || null, homeStoreId: u.home_store_id || null,
  photo: u.photo, phone: withPhone ? u.phone : '', active: u.active, username: '',
});
const teamOut_ = t => ({ id: t.id, name: t.name, areaId: t.area_id, leaderId: t.leader_id || null });
const productOut_ = p => ({
  id: p.id, name: p.name, sku: p.sku, price: p.price || 0, image: p.photo || 'assets/products/placeholder.svg', active: p.active,
  createdBy: p.created_by || null, updatedBy: p.updated_by || null, updatedAt: p.updated_at,
});
const storeOut_ = s => ({
  id: s.id, name: s.name, chain: s.chain, city: s.city, address: s.address, areaId: s.area_id || null, active: s.active,
  createdBy: s.created_by || null, updatedBy: s.updated_by || null, updatedAt: s.updated_at,
});

function targetsFor_(userIds) {
  const out = {};
  rows_('Targets').forEach(t => {
    if (userIds.indexOf(t.user_id) < 0) return;
    out[t.user_id + '|' + t.month] = { monthly: t.monthly || 0, weekly: t.weekly || null, daily: t.daily || null, setBy: t.set_by || null, setAt: t.set_at };
  });
  return out;
}

function reportsFor_(fullIds, totalsIds, from, to) {
  const full = {}, totals = {}, out = {};
  fullIds.forEach(id => { full[id] = true; });
  totalsIds.forEach(id => { totals[id] = true; });
  const newReport = (uid, date) => {
    const r = { userId: uid, date, items: [], total: 0, noSales: false, unlocked: false };
    if (full[uid]) { r.transactions = []; r._items = {}; }
    return r;
  };
  rows_('Sales').forEach(s => {
    if (s.deleted || (!full[s.user_id] && !totals[s.user_id]) || s.date < from || s.date > to) return;
    const key = s.user_id + '|' + s.date;
    const r = out[key] || (out[key] = newReport(s.user_id, s.date));
    r.total += s.qty * s.price;
    if (full[s.user_id]) {
      r.transactions.push({ id: s.id, time: s.time, storeId: s.store_id || null, productId: s.product_id, qty: s.qty, price: s.price });
      const ik = s.product_id + '|' + s.price;
      const it = r._items[ik] || (r._items[ik] = { productId: s.product_id, price: s.price, qty: 0 });
      it.qty += s.qty;
    }
  });
  rows_('DayReports').forEach(d => {
    if ((!full[d.user_id] && !totals[d.user_id]) || d.date < from || d.date > to) return;
    const key = d.user_id + '|' + d.date;
    if (!out[key]) {
      if (!d.no_sales) return;
      out[key] = newReport(d.user_id, d.date);
    }
    out[key].noSales = d.no_sales && out[key].total === 0;
    out[key].unlocked = d.unlocked;
  });
  Object.keys(out).forEach(k => {
    const r = out[k];
    if (r.transactions) r.transactions.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    r.items = r._items ? Object.keys(r._items).map(i => r._items[i]) : [];
    delete r._items;
  });
  return out;
}

/** Notes photos only for photoIds (own / managed SPGs), not for teammates. */
function shiftsFor_(userIds, from, to, photoIds) {
  const out = {}, visits = {}, photos = {};
  rows_('StoreVisits').forEach(v => { (visits[v.shift_id] = visits[v.shift_id] || []).push({ storeId: v.store_id, from: v.from_time }); });
  rows_('ShiftPhotos').forEach(p => { (photos[p.shift_id] = photos[p.shift_id] || []).push(p.url); });
  rows_('Shifts').forEach(s => {
    if (userIds.indexOf(s.user_id) < 0 || s.date < from || s.date > to) return;
    out[s.user_id + '|' + s.date] = shiftOut_(s, visits[s.id] || [], (photoIds || []).indexOf(s.user_id) >= 0 ? photos[s.id] || [] : []);
  });
  return out;
}

const shiftOut_ = (s, visits, photos) => ({ start: s.start, end: s.end || null, storeId: s.store_id || null, visits, photos: photos || [] });
