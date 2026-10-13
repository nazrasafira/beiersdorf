/**
 * Web app entry point. One URL, action-based:
 *   POST { action, token, ...params }  →  { ok: true, data } | { ok: false, status, error }
 * The pages send Content-Type text/plain so the browser makes no CORS preflight (Apps Script can't answer one).
 * Apps Script always replies HTTP 200, so the real status (401, 403, 422…) is in the body.
 */
function ApiError(status, message) {
  this.status = status;
  this.message = message;
}

// action: [handler, needs login, writes data (runs under the script lock)].
// A function, because handlers live in other files that may load after this one.
const actions_ = () => ({
  'login': [actLogin_, false, true],
  'bootstrap': [actBootstrap_, true, false],
  'password.change': [actChangePassword_, true, true],
  'shift.start': [actShiftStart_, true, true],
  'shift.switchStore': [actShiftSwitch_, true, true],
  'shift.end': [actShiftEnd_, true, true],
  'sale.add': [actSaleAdd_, true, true],
  'sale.remove': [actSaleRemove_, true, true],
  'report.unlock': [actUnlock_, true, true],
  'targets.save': [actTargets_, true, true],
  'settings.save': [actSettings_, true, true],
  'user.add': [actUserAdd_, true, true],
  'user.setActive': [actUserActive_, true, true],
  'user.resetPassword': [actUserReset_, true, true],
  'user.photo': [actUserPhoto_, true, true],
  'product.save': [actProductSave_, true, true],
  'store.save': [actStoreSave_, true, true],
});
// Allowed while the user still has to choose a new password
const BEFORE_NEW_PASSWORD = ['bootstrap', 'password.change'];

function doPost(e) {
  return json_(handle_(e && e.postData ? e.postData.contents : ''));
}

function doGet() {
  return json_({ ok: true, data: { app: 'Laporan SPG', today: today_() } });
}

function handle_(body) {
  TABLE_CACHE = {};
  let lock = null;
  try {
    let req;
    try { req = JSON.parse(body || '{}'); } catch (err) { throw new ApiError(400, 'Permintaan tidak valid.'); }
    const def = actions_()[req.action];
    if (!def) throw new ApiError(404, 'Aksi tidak dikenal.');
    if (def[2]) {
      lock = LockService.getScriptLock();
      if (!lock.tryLock(20000)) throw new ApiError(503, 'Server sibuk, coba lagi.');
    }
    let me = null;
    if (def[1]) {
      me = userFromToken_(req.token);
      if (me.must_change_password && BEFORE_NEW_PASSWORD.indexOf(req.action) < 0) throw new ApiError(403, 'Ganti password dulu.');
    }
    return { ok: true, data: def[0](req, me) || {} };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, status: err.status, error: err.message };
    console.error(err && err.stack ? err.stack : err);
    return { ok: false, status: 500, error: 'Terjadi kesalahan di server.' };
  } finally {
    if (lock) lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function log_(me, action, kind, subjectId, name) {
  append_('Activity', [{ at: nowStamp_(), by: me.id, action, kind, subject_id: subjectId || '', name: name || '' }]);
}

/* ---------- Small input checks ---------- */
const fail_ = (message, status) => { throw new ApiError(status || 422, message); };
const isDate_ = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const isTime_ = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ''));
const str_ = (v, max) => String(v === undefined || v === null ? '' : v).trim().slice(0, max || 200);
function int_(v, min, max, message) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) fail_(message || 'Angka tidak valid.');
  return n;
}
