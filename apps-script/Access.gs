/**
 * Who may do what (same rules as the demo's data.js):
 * - Admin manages Supervisors and Team Leaders, all products and stores.
 * - Supervisor: SPGs, targets, settings and reports of every team in their area; edits any product/store.
 * - Team Leader: their own team's SPGs, targets, settings and reports; edits only products/stores they added.
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
const canEditCatalog_ = (me, item) => me.role === 'admin' || me.role === 'supervisor' || (me.role === 'leader' && item.created_by === me.id);

function settingsFor_(teamId) {
  const s = find_('Settings', r => r.team_id === teamId);
  return {
    workingDays: s && s.working_days !== '' ? String(s.working_days).split(',').filter(x => x !== '').map(Number) : [1, 2, 3, 4, 5, 6],
    editDays: s && s.edit_days !== null ? s.edit_days : 2,
    reminder: (s && s.reminder) || '20:00',
  };
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
