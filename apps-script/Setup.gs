/**
 * One-time setup and Sheet tools (menu "Laporan SPG" in the spreadsheet).
 * 1. setupSheet()   creates the tabs with their columns (safe to run again: adds what is missing)
 * 2. createAdmin()  first Admin account (asks for phone, name and password)
 * 3. importDemoData()  optional: the demo's people, stores, products and sales, for trying the app
 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Laporan SPG')
    .addItem('1. Siapkan tab (setupSheet)', 'setupSheet')
    .addItem('2. Buat akun Admin', 'createAdminPrompt')
    .addSeparator()
    .addItem('Isi data demo…', 'importDemoDataPrompt')
    .addToUi();
}

function setupSheet() {
  const ss = spreadsheet_();
  Object.keys(TABLES).forEach(name => {
    const cols = TABLES[name];
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
    // Plain text everywhere: keeps the 0 of phone numbers and stops "2026-10-22" turning into a date
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
  });
  // Products can be edited by hand (Admin): price must be a number, active a checkbox
  const p = ss.getSheetByName('Products'), n = p.getMaxRows() - 1, col = c => TABLES.Products.indexOf(c) + 1;
  p.getRange(2, col('price'), n, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireNumberGreaterThan(0).setAllowInvalid(true).build());
  p.getRange(2, col('active'), n, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['TRUE', 'FALSE']).setAllowInvalid(true).build());
  // Everything except Products is changed through the app only
  Object.keys(TABLES).filter(name => name !== 'Products').forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) sh.protect().setDescription('Diubah lewat aplikasi Laporan SPG').setWarningOnly(true);
  });
  const blank = ss.getSheetByName('Sheet1') || ss.getSheetByName('Sheet 1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  secret_(); // makes the token secret now
  return 'ok';
}

function createAdminPrompt() {
  const ui = SpreadsheetApp.getUi();
  const phone = ui.prompt('Nomor HP Admin (untuk login)').getResponseText();
  const name = ui.prompt('Nama Admin').getResponseText() || 'Admin';
  const pw = ui.prompt('Password sementara (min. 8 karakter, diganti saat login pertama)').getResponseText();
  ui.alert(createAdmin(phone, name, pw));
}

/** First Admin (and the first area). The Admin then adds Supervisors and Team Leaders in the app. */
function createAdmin(phone, name, password, areaName) {
  TABLE_CACHE = {};
  phone = normalizePhone_(phone);
  if (!/^08\d{8,11}$/.test(phone)) return 'Nomor HP tidak valid (contoh: 0812 3456 7890).';
  if (String(password || '').length < 8) return 'Password minimal 8 karakter.';
  if (find_('Users', u => u.phone === phone)) return 'Nomor HP sudah terdaftar.';
  if (!rows_('Areas').length) append_('Areas', [{ id: newId_('a'), name: areaName || 'Jabodetabek' }]);
  const u = { id: newId_('u'), phone, name: name || 'Admin', role: 'admin', area_id: '', team_id: '', home_store_id: '', photo: '', token_version: 0, must_change_password: true, active: true, created_at: nowStamp_() };
  setPassword_(u, password);
  append_('Users', [u]);
  return 'Admin ' + phone + ' dibuat. Login di aplikasi dengan nomor HP ini.';
}

/* ---------- Manual edits in the Products tab ---------- */
/**
 * Runs when someone edits the Sheet by hand. In Products: gives new rows an id, stamps updated_at, cleans prices ("Rp 45.000" → 45000),
 * and marks rows the app can't use (no name, price not a positive number) red with a note.
 */
function onEdit(e) {
  const sh = e.range.getSheet();
  if (sh.getName() !== 'Products') return;
  const cols = TABLES.Products, col = c => cols.indexOf(c) + 1;
  for (let r = e.range.getRow(); r < e.range.getRow() + e.range.getNumRows(); r++) {
    if (r === 1) continue;
    const row = sh.getRange(r, 1, 1, cols.length);
    const v = row.getValues()[0];
    if (v.every(x => x === '')) continue;
    const get = c => v[col(c) - 1];
    if (!get('id')) sh.getRange(r, col('id')).setValue(newId_('p'));
    if (get('active') === '') sh.getRange(r, col('active')).setValue('TRUE');
    sh.getRange(r, col('updated_at')).setValue(Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'));
    const price = Number(String(get('price')).replace(/[^\d]/g, ''));
    if (price > 0 && String(get('price')) !== String(price)) sh.getRange(r, col('price')).setValue(String(price)); // "45.000" → 45000
    const problem = !String(get('name')).trim() ? 'Nama produk kosong.' : !(price > 0) ? 'Harga harus angka lebih dari 0 (contoh: 45000).' : '';
    row.setBackground(problem ? '#fde2e2' : null);
    sh.getRange(r, col('name')).setNote(problem || null);
  }
}

/* ---------- Demo data ---------- */
function importDemoDataPrompt() {
  const ui = SpreadsheetApp.getUi();
  const url = ui.prompt('Isi data demo', 'Alamat demo-data.json (raw GitHub) atau ID file di Google Drive. Kosongkan untuk alamat bawaan:\n' + DEMO_DATA_URL, ui.ButtonSet.OK_CANCEL);
  if (url.getSelectedButton() !== ui.Button.OK) return;
  ui.alert(importDemoData(url.getResponseText() || DEMO_DATA_URL));
}
const DEMO_DATA_URL = 'https://raw.githubusercontent.com/MuhGhifari/sales-daily-report/google-sheets/apps-script/demo-data.json';

/**
 * Fills an empty Sheet with the demo data (made from the demo by `node tools/export-demo-data.js`).
 * Ids and phone numbers are the demo's, so the demo logins work (e.g. SPG 0813 0000 0001 / spg123).
 * When "today" is later than the demo's today, all dates move forward by whole weeks.
 */
function importDemoData(source) {
  TABLE_CACHE = {};
  if (rows_('Users').length) return 'Sheet sudah berisi pengguna. Data demo hanya untuk Sheet yang masih kosong.';
  source = source || DEMO_DATA_URL;
  // An address (raw GitHub link), or the id of demo-data.json uploaded to Google Drive (private repository)
  const text = typeof source === 'object' ? null
    : /^(https?|file):/.test(source) ? UrlFetchApp.fetch(source).getContentText()
      : DriveApp.getFileById(source).getBlob().getDataAsString();
  const d = text === null ? source : JSON.parse(text);
  const days = Math.round((Date.parse(today_()) - Date.parse(d.today)) / 864e5);
  const shift = days > 0 ? Math.floor(days / 7) * 7 : 0;
  const mv = date => (shift ? addDays_(date, shift) : date);
  const stamp = nowStamp_();
  const hashes = {};

  append_('Areas', d.areas.map(a => ({ id: a.id, name: a.name })));
  append_('Teams', d.teams.map(t => ({ id: t.id, name: t.name, area_id: t.areaId, leader_id: t.leaderId || '' })));
  append_('Users', d.users.map(u => {
    const salt = 'demo-' + u.role; // one hash per role keeps the import quick; demo accounts only
    hashes[u.role] = hashes[u.role] || hashPassword_(DEFAULT_PASSWORD[u.role], salt);
    return {
      id: u.id, phone: u.phone, name: u.name, role: u.role, area_id: u.areaId || '', team_id: u.teamId || '', home_store_id: u.homeStoreId || '',
      photo: u.photo || '', password_hash: hashes[u.role], salt, token_version: 0, must_change_password: false, active: u.active, created_at: stamp,
    };
  }));
  const cat = x => ({ active: x.active, created_by: x.createdBy || '', updated_by: x.updatedBy || '', updated_at: x.updatedAt || '' });
  append_('Products', d.products.map(p => Object.assign({ id: p.id, name: p.name, sku: p.sku || '', price: p.price, photo: p.image || '' }, cat(p))));
  append_('Stores', d.stores.map(s => Object.assign({ id: s.id, name: s.name, chain: s.chain || '', city: s.city, address: s.address || '', area_id: s.areaId || '' }, cat(s))));
  append_('Settings', Object.keys(d.settings).map(t => ({ team_id: t, working_days: d.settings[t].workingDays.join(','), edit_days: d.settings[t].editDays, reminder: d.settings[t].reminder })));
  append_('Holidays', [].concat.apply([], Object.keys(d.settings).map(t => d.settings[t].holidays.map(h => ({ team_id: t, date: h.date, name: h.name, working: h.working })))));

  // Targets for every month the moved data covers, plus the current month (from the user's latest demo target)
  const targets = {}, latest = {};
  Object.keys(d.targets).forEach(k => {
    const [uid, month] = k.split('|'), t = d.targets[k];
    if (!latest[uid] || month > latest[uid][0]) latest[uid] = [month, t];
    [mv(month + '-01').slice(0, 7), mv(month + '-28').slice(0, 7)].forEach(m => { targets[uid + '|' + m] = t; });
  });
  Object.keys(latest).forEach(uid => { targets[uid + '|' + today_().slice(0, 7)] = targets[uid + '|' + today_().slice(0, 7)] || latest[uid][1]; });
  append_('Targets', Object.keys(targets).map(k => {
    const [uid, month] = k.split('|'), t = targets[k];
    return { user_id: uid, month, monthly: t.monthly, weekly: t.weekly || '', daily: t.daily || '', set_by: t.setBy || '', set_at: t.setAt || '' };
  }));

  const shifts = [], visits = [], sales = [], days_ = [];
  Object.keys(d.shifts).forEach(k => {
    const [uid, date] = k.split('|'), s = d.shifts[k], id = 'sh-' + uid + '-' + date;
    shifts.push({ id, user_id: uid, date: mv(date), start: s.start, end: s.end || '', store_id: s.storeId || '' });
    (s.visits || []).forEach(v => visits.push({ shift_id: id, store_id: v.storeId, from_time: v.from }));
  });
  Object.keys(d.reports).forEach(k => {
    const r = d.reports[k], sh = d.shifts[k];
    const lines = r.transactions || r.items.map(i => Object.assign({ time: '', storeId: sh ? sh.storeId : '' }, i));
    lines.forEach(t => sales.push({
      id: Utilities.getUuid(), user_id: r.userId, date: mv(r.date), time: t.time || '', store_id: t.storeId || (sh ? sh.storeId : ''),
      product_id: t.productId, qty: t.qty, price: t.price, subtotal: t.qty * t.price, created_by: r.userId, created_at: stamp, deleted: false,
    }));
    if (r.noSales || r.unlocked) days_.push({ user_id: r.userId, date: mv(r.date), no_sales: r.noSales, unlocked: r.unlocked, unlocked_by: '' });
  });
  append_('Shifts', shifts);
  append_('StoreVisits', visits);
  append_('Sales', sales);
  append_('DayReports', days_);
  return 'Data demo dimuat: ' + d.users.length + ' pengguna, ' + d.stores.length + ' toko, ' + sales.length + ' penjualan.';
}
