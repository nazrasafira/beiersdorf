/**
 * The Google Sheet as a small database: one tab per table, row 1 = column names.
 * Every column is plain text ("@") so phone numbers keep their leading 0 and dates stay "YYYY-MM-DD";
 * numbers and TRUE/FALSE are converted on reading (see NUM_COLS / BOOL_COLS).
 */
const TABLES = {
  Users: ['id', 'phone', 'name', 'role', 'area_id', 'team_id', 'home_store_id', 'photo', 'password_hash', 'salt', 'token_version', 'must_change_password', 'active', 'created_at'],
  Areas: ['id', 'name'],
  Teams: ['id', 'name', 'area_id', 'leader_id'],
  Products: ['id', 'name', 'sku', 'price', 'photo', 'active', 'created_by', 'updated_by', 'updated_at'],
  Stores: ['id', 'name', 'chain', 'city', 'address', 'area_id', 'active', 'created_by', 'updated_by', 'updated_at'],
  Targets: ['user_id', 'month', 'monthly', 'weekly', 'daily', 'set_by', 'set_at'],
  Shifts: ['id', 'user_id', 'date', 'start', 'end', 'store_id'],
  StoreVisits: ['shift_id', 'store_id', 'from_time'],
  ShiftPhotos: ['shift_id', 'url', 'at'], // photos of the SPG's handwritten notes, taken when ending a shift
  Sales: ['id', 'user_id', 'date', 'time', 'store_id', 'product_id', 'qty', 'price', 'subtotal', 'created_by', 'created_at', 'deleted'],
  DayReports: ['user_id', 'date', 'no_sales', 'unlocked', 'unlocked_by'],
  Settings: ['team_id', 'working_days', 'edit_days', 'reminder'],
  Holidays: ['team_id', 'date', 'name', 'working'],
  Activity: ['at', 'by', 'action', 'kind', 'subject_id', 'name'],
  LoginLog: ['at', 'phone', 'success'],
};
const NUM_COLS = ['price', 'qty', 'subtotal', 'monthly', 'weekly', 'daily', 'edit_days', 'token_version'];
const BOOL_COLS = ['active', 'must_change_password', 'deleted', 'no_sales', 'unlocked', 'working', 'success'];
const TZ = 'Asia/Jakarta';

// Rows read during one request (cleared at the start of every request by the router)
let TABLE_CACHE = {};

function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  const sh = spreadsheet_().getSheetByName(name);
  if (!sh) throw new ApiError(500, 'Tab "' + name + '" tidak ada. Jalankan setupSheet() dulu.');
  return sh;
}

/** A cell as the app expects it: dates/times typed into the Sheet by hand come back as Date objects. */
function cell_(col, v) {
  if (v instanceof Date) {
    v = v.getFullYear() < 1900 ? Utilities.formatDate(v, TZ, 'HH:mm') : Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  }
  if (BOOL_COLS.indexOf(col) >= 0) return v === true || String(v).toUpperCase() === 'TRUE';
  if (NUM_COLS.indexOf(col) >= 0) return v === '' || v === null ? null : Number(v) || 0;
  return v === null || v === undefined ? '' : String(v);
}

/** All rows of a table as objects; each has _row (its row number in the Sheet). */
function rows_(name) {
  if (TABLE_CACHE[name]) return TABLE_CACHE[name];
  const sh = sheet_(name), cols = TABLES[name], n = sh.getLastRow() - 1;
  const values = n > 0 ? sh.getRange(2, 1, n, cols.length).getValues() : [];
  const out = [];
  values.forEach((r, i) => {
    if (r.every(v => v === '' || v === null)) return; // empty row left by hand edits
    const o = { _row: i + 2 };
    cols.forEach((c, j) => { o[c] = cell_(c, r[j]); });
    out.push(o);
  });
  TABLE_CACHE[name] = out;
  return out;
}

function toRow_(name, obj) {
  return TABLES[name].map(c => {
    const v = obj[c];
    if (v === undefined || v === null) return '';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return String(v);
  });
}

/** Adds rows at the end of a table (one write for many rows). */
function append_(name, objs) {
  if (!objs.length) return;
  const sh = sheet_(name);
  const start = sh.getLastRow() + 1;
  sh.getRange(start, 1, objs.length, TABLES[name].length).setValues(objs.map(o => toRow_(name, o)));
  if (TABLE_CACHE[name]) objs.forEach((o, i) => TABLE_CACHE[name].push(Object.assign({ _row: start + i }, o)));
}

/** Writes an object (read with rows_) back to its row. */
function save_(name, obj) {
  sheet_(name).getRange(obj._row, 1, 1, TABLES[name].length).setValues([toRow_(name, obj)]);
}

/** Replaces all rows matching `remove` with `add` (small tables only, e.g. one team's holidays). */
function replaceRows_(name, remove, add) {
  const keep = rows_(name).filter(r => !remove(r));
  const all = keep.concat(add);
  const sh = sheet_(name), cols = TABLES[name].length, old = sh.getLastRow() - 1;
  if (old > 0) sh.getRange(2, 1, old, cols).clearContent();
  if (all.length) sh.getRange(2, 1, all.length, cols).setValues(all.map(o => toRow_(name, o)));
  delete TABLE_CACHE[name];
}

const find_ = (name, pred) => rows_(name).find(pred) || null;
const byId_ = (name, id) => (id ? find_(name, r => r.id === String(id)) : null);
const newId_ = prefix => prefix + Utilities.getUuid().replace(/-/g, '').slice(0, 10);

/* ---------- Dates (Asia/Jakarta). Script property DEMO_TODAY fixes "today" for demos and tests. ---------- */
function today_() {
  return PropertiesService.getScriptProperties().getProperty('DEMO_TODAY') || Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}
const nowTime_ = () => Utilities.formatDate(new Date(), TZ, 'HH:mm');
const nowStamp_ = () => today_() + ' ' + nowTime_();
function addDays_(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Phone numbers in any common format (0812…, 62812…, +62 812-…) normalised to 0812… */
function normalizePhone_(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.indexOf('62') === 0) d = '0' + d.slice(2);
  else if (d.indexOf('8') === 0) d = '0' + d;
  return d;
}
