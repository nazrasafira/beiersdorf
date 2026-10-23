/**
 * Daily sales recap per SPG for a date range (the page turns it into an Excel file, assets/js/recap-export.js):
 * each day's sales per SPG, OFF on the SPG's days off, MISSING when a working day has no report, then the total, the target
 * (monthly targets of the stores the SPG holds in the months of the range) and the achievement, best first.
 * Team Leader: own team; Supervisor: teams in their area; Admin: any team or all.
 */
const DAY_NAMES_ = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MAX_EXPORT_DAYS_ = 62;

function dow_(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The recap as plain data (no Google calls, so it can be tested): { teams, days, offDays, rows }. */
function dailyRecap_(me, req) {
  if (['admin', 'manager', 'leader'].indexOf(me.role) < 0) fail_('Kamu tidak punya akses ke laporan ini.', 403);
  const from = req.from, to = req.to;
  if (!isDate_(from) || !isDate_(to) || from > to) fail_('Pilih tanggal mulai dan selesai yang benar.');
  const days = [];
  for (let d = from; d <= to; d = addDays_(d, 1)) {
    days.push(d);
    if (days.length > MAX_EXPORT_DAYS_) fail_('Rentang tanggal maksimal ' + MAX_EXPORT_DAYS_ + ' hari.');
  }
  const allowed = teamIds_(me);
  const teamIds = req.teamId ? [req.teamId] : allowed;
  if (teamIds.some(t => allowed.indexOf(t) < 0)) fail_('Kamu tidak punya akses ke tim ini.', 403);
  const teams = rows_('Teams').filter(t => teamIds.indexOf(t.id) >= 0);
  if (!teams.length) fail_('Belum ada tim.');

  // Working days per team (holidays override the weekly pattern); each SPG then has their own days or the team's
  const teamSettings = {}, teamHolidays = {};
  teams.forEach(t => {
    teamSettings[t.id] = settingsFor_(t.id);
    teamHolidays[t.id] = {};
    rows_('Holidays').filter(h => h.team_id === t.id).forEach(h => { teamHolidays[t.id][h.date] = !!h.working; });
  });
  const workingFor = (u, d) => isWorkingDayFor_(u, d, teamSettings[u.team_id], teamHolidays[u.team_id]);
  const teamWorking = (t, d) => (d in teamHolidays[t.id] ? teamHolidays[t.id][d] : teamSettings[t.id].workingDays.indexOf(dow_(d)) >= 0);

  const spgs = rows_('Users').filter(u => u.role === 'spg' && u.active && teamIds.indexOf(u.team_id) >= 0);
  const ids = {};
  spgs.forEach(u => { ids[u.id] = true; });
  const amount = {}, noSales = {}, target = {};
  rows_('Sales').forEach(s => {
    if (s.deleted || !ids[s.user_id] || s.date < from || s.date > to) return;
    const k = s.user_id + '|' + s.date;
    amount[k] = (amount[k] || 0) + (s.subtotal || s.qty * s.price || 0);
  });
  rows_('DayReports').forEach(r => { if (r.no_sales && ids[r.user_id]) noSales[r.user_id + '|' + r.date] = true; });
  const months = {};
  days.forEach(d => { months[d.slice(0, 7)] = true; });
  // An SPG's target: the monthly targets of the stores they hold in those months
  rows_('StoreTargets').forEach(t => { if (ids[t.user_id] && months[t.month]) target[t.user_id] = (target[t.user_id] || 0) + (t.monthly || 0); });

  const today = today_();
  const teamName = {};
  teams.forEach(t => { teamName[t.id] = t.name; });
  const rows = spgs.map(u => {
    let total = 0;
    // Each day: a number (sales), 'OFF' (day off without sales), 'MISSING' (working day, nothing reported) or '' (not yet)
    const cells = days.map(d => {
      const k = u.id + '|' + d;
      if (amount[k]) { total += amount[k]; return amount[k]; }
      if (noSales[k]) return 0;
      if (d > today) return '';
      if (u.created_at && d < String(u.created_at).slice(0, 10)) return ''; // before the account existed
      return workingFor(u, d) ? 'MISSING' : 'OFF';
    });
    const t = target[u.id] || 0;
    return { name: u.name, team: teamName[u.team_id] || '', cells, total, target: t, ach: t ? total / t : null };
  }).sort((a, b) => (b.ach === null ? -1 : b.ach) - (a.ach === null ? -1 : a.ach) || b.total - a.total || a.name.localeCompare(b.name));

  // A day is marked in the header when it is a day off for every team in the recap
  const offDays = days.map(d => teams.every(t => !teamWorking(t, d)));
  return { teams, days, offDays, rows };
}

function actDailyRecap_(req, me) {
  const r = dailyRecap_(me, req);
  return { teams: r.teams.map(t => ({ id: t.id, name: t.name })), days: r.days, offDays: r.offDays, rows: r.rows };
}
