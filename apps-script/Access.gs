/**
 * Who may do what (same rules as the demo's data.js):
 * - Admin manages Managers and Team Leaders, all products and stores.
 * - Manager (role code "supervisor"): SPGs, schedules, store targets, settings and reports of every team in their area.
 * - Team Leader: their own team's SPGs, schedules, store targets, settings and reports.
 * - Admin, Manager and Team Leader add and change any product or store (shared lists).
 * - SPG: their own shifts and sales, today (with a shift) or inside the team's edit window.
 */
function teamIds_(me) {
  if (me.role === 'admin') return rows_('Teams').map(t => t.id);
  if (me.role === 'supervisor') return rows_('Teams').filter(t => t.area_id === me.area_id).map(t => t.id);
  return me.team_id ? [me.team_id] : [];
}

function canView_(me, owner) {
  if (!owner) return false;
  if (me.role === 'spg') return me.id === owner.id;
  if (me.role === 'leader' || me.role === 'supervisor') return !!owner.team_id && teamIds_(me).indexOf(owner.team_id) >= 0;
  return false;
}

const canManageTeam_ = (me, teamId) => (me.role === 'leader' || me.role === 'supervisor') && teamIds_(me).indexOf(teamId) >= 0;

/** Admin → Supervisors & Team Leaders; Leader → own team's SPGs; Supervisor → SPGs in their area. */
function canManageUser_(me, target) {
  if (!target) return false;
  if (me.role === 'admin') return target.role === 'leader' || target.role === 'supervisor';
  if (target.role !== 'spg' || !target.team_id) return false;
  return canManageTeam_(me, target.team_id);
}

const canAddCatalog_ = me => ['admin', 'supervisor', 'leader'].indexOf(me.role) >= 0;
// Products and stores are shared lists: Admin, Manager and Team Leader may add and change any of them
const canEditCatalog_ = (me, item) => !!item && canAddCatalog_(me);

function settingsFor_(teamId) {
  const s = find_('Settings', r => r.team_id === teamId);
  return {
    workingDays: s && s.working_days !== '' ? String(s.working_days).split(',').filter(x => x !== '').map(Number) : [1, 2, 3, 4, 5, 6],
    editDays: s && s.edit_days !== null ? s.edit_days : 2,
    reminder: (s && s.reminder) || '20:00',
  };
}

/** An SPG's own working days (0 = Sunday … 6), or null when they follow the team's working days. */
function workDays_(u) {
  const s = String((u && u.work_days) || '').trim();
  return s ? s.split(',').filter(x => x !== '').map(Number) : null;
}

/** Whether a day is a working day for this SPG: a team holiday decides first, then their own days or the team's. */
function isWorkingDayFor_(u, date, settings, holidays) {
  if (date in holidays) return holidays[date];
  const [y, m, d] = date.split('-').map(Number);
  return (workDays_(u) || settings.workingDays).indexOf(new Date(Date.UTC(y, m - 1, d)).getUTCDay()) >= 0;
}

const dayReport_ = (userId, date) => find_('DayReports', r => r.user_id === userId && r.date === date);

/** Locked for the SPG: older than the team's edit window and not unlocked by a leader. */
function isLocked_(owner, date) {
  const d = dayReport_(owner.id, date);
  if (d && d.unlocked) return false;
  return date < addDays_(today_(), -settingsFor_(owner.team_id).editDays);
}

function canEditDay_(me, owner, date) {
  if (date > today_() || !canView_(me, owner)) return false;
  return me.role === 'spg' ? !isLocked_(owner, date) : true;
}
