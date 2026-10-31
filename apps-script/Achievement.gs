/**
 * Achievement of a date range per SPG and per store, best first (the page shows it, Laporan tab Pencapaian).
 * Target = the monthly store targets; a month only partly in the range counts by its working days in the range.
 * Offtake = the store's actual where the Team Leader or Manager entered one (spread evenly over the days of its period,
 * and credited to the SPG holding the store that month), otherwise the sales the SPGs reported.
 * A store-month without a target counts for neither, or sales without a target would inflate Ach.
 */
const MAX_ACHIEVEMENT_DAYS_ = 731;

function monthTargetIn_(t, u, settings, holidays, from, to) {
  const first = t.month + '-01', last = monthLastDay_(first);
  if (from <= first && to >= last && !t.daily) return t.monthly || 0;
  let working = 0, inRange = 0;
  for (let d = first; d <= last; d = addDays_(d, 1)) {
    if (!isWorkingDayFor_(u, d, settings, holidays)) continue;
    working++;
    if (d >= from && d <= to) inRange++;
  }
  if (t.daily) return t.daily * inRange;
  return working ? (t.monthly || 0) * inRange / working : 0;
}

function achievementRows_(map) {
  return Object.keys(map).map(k => {
    const r = map[k];
    return Object.assign(r, {
      target: Math.round(r.target), offtake: Math.round(r.fromActual + r.fromSpg), fromActual: Math.round(r.fromActual), fromSpg: Math.round(r.fromSpg),
      ach: r.target > 0 ? (r.fromActual + r.fromSpg) / r.target : null,
    });
  }).sort((a, b) => (b.ach === null ? -1 : b.ach) - (a.ach === null ? -1 : a.ach) || b.offtake - a.offtake || String(a.name).localeCompare(String(b.name)));
}

function actAchievement_(req, me) {
  const team = actualTeam_(req, me), today = today_(), from = String(req.from || ''), to = String(req.to || '');
  if (!isDate_(from) || !isDate_(to) || from > to) fail_('Pilih tanggal mulai dan selesai yang benar.');
  if (to > today) fail_('Tanggal selesai tidak boleh melewati hari ini.');
  let span = 0;
  for (let d = from; d <= to; d = addDays_(d, 1)) if (++span > MAX_ACHIEVEMENT_DAYS_) fail_('Rentang tanggal maksimal 2 tahun.');

  const settings = settingsFor_(team.id), holidays = {};
  rows_('Holidays').filter(h => h.team_id === team.id).forEach(h => { holidays[h.date] = !!h.working; });
  const users = {}, stores = {};
  rows_('Users').forEach(u => { users[u.id] = u; });
  rows_('Stores').forEach(s => { stores[s.id] = s; });

  const spgs = {}, shops = {};
  const blank = () => ({ target: 0, fromActual: 0, fromSpg: 0 });
  const spgRow = u => spgs[u.id] || (spgs[u.id] = Object.assign({ id: u.id, name: u.name }, blank()));
  const shopRow = id => shops[id] || (shops[id] = Object.assign({ id, name: (stores[id] || {}).name || id, city: (stores[id] || {}).city || '' }, blank()));
  rows_('Users').forEach(u => { if (u.role === 'spg' && u.active && u.team_id === team.id) spgRow(u); });

  const targeted = {}, holder = {}; // store|month with a target (any team), and the SPG of this team holding it
  rows_('StoreTargets').forEach(t => {
    if (t.month > to.slice(0, 7) || t.month < from.slice(0, 7) || !t.user_id || !t.monthly) return;
    targeted[t.store_id + '|' + t.month] = true;
    const u = users[t.user_id];
    if (!u || u.team_id !== team.id) return;
    holder[t.store_id + '|' + t.month] = u;
    const amount = monthTargetIn_(t, u, settings, holidays, from, to);
    spgRow(u).target += amount;
    shopRow(t.store_id).target += amount;
  });

  // Days with an entered actual replace the SPGs' sales of those days. A period still running counts up to today.
  const covered = {};
  rows_('StoreActuals').forEach(a => {
    if (a.actual === null || a.actual === undefined || a.period_start > to || a.period_end < from) return;
    const end = a.period_end < today ? a.period_end : today;
    let days = 0;
    for (let d = a.period_start; d <= end; d = addDays_(d, 1)) days++;
    if (!days) return;
    for (let d = a.period_start; d <= end; d = addDays_(d, 1)) {
      covered[a.store_id + '|' + d] = true;
      if (d < from || d > to) continue;
      const u = holder[a.store_id + '|' + d.slice(0, 7)];
      if (!u) continue;
      shopRow(a.store_id).fromActual += a.actual / days;
      spgRow(u).fromActual += a.actual / days;
    }
  });

  let excluded = 0;
  rows_('Sales').forEach(s => {
    if (s.deleted || s.date < from || s.date > to || covered[s.store_id + '|' + s.date]) return;
    const key = s.store_id + '|' + s.date.slice(0, 7), u = users[s.user_id], own = u && u.team_id === team.id, amount = s.subtotal || 0;
    if (holder[key]) shopRow(s.store_id).fromSpg += amount;
    if (!own) return;
    if (targeted[key]) spgRow(u).fromSpg += amount;
    else excluded += amount;
  });
  return { from, to, excluded, spgs: achievementRows_(spgs), stores: achievementRows_(shops) };
}
