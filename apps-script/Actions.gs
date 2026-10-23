/* ---------- Login and password ---------- */
function actLogin_(req) {
  const phone = normalizePhone_(req.phone);
  if (!phone || !req.password) fail_('Isi nomor HP dan password.');
  if (loginBlocked_(phone)) fail_('Terlalu banyak percobaan. Coba lagi dalam 15 menit.', 429);
  const user = find_('Users', u => u.phone === phone);
  const rightPassword = !!user && checkPassword_(user, String(req.password));
  const ok = rightPassword && user.active;
  append_('LoginLog', [{ at: nowStamp_(), phone, success: ok }]);
  if (!ok) {
    loginFailed_(phone);
    // Only someone who knows the password learns that the account is deactivated
    fail_(rightPassword ? 'Akun kamu sudah dinonaktifkan. Hubungi Team Leader atau Manager.' : 'Nomor HP atau password salah.');
  }
  loginOk_(phone);
  return { token: makeToken_(user), state: buildState_(user) };
}

function actBootstrap_(req, me) {
  return buildState_(me);
}

/** Own password. Right after a reset (must_change_password) the current password is not asked again. */
function actChangePassword_(req, me) {
  const pw = String(req.password || '');
  if (pw.length < 6) fail_('Password minimal 6 karakter.');
  if (pw !== String(req.confirmation || '')) fail_('Konfirmasi password tidak sama.');
  if (!me.must_change_password && !checkPassword_(me, String(req.current || ''))) fail_('Password lama salah.');
  if (checkPassword_(me, pw)) fail_('Gunakan password yang berbeda dari sebelumnya.');
  setPassword_(me, pw);
  me.must_change_password = false;
  revokeTokens_(me); // other phones are signed out; this one gets a new token
  save_('Users', me);
  log_(me, 'ganti password', 'pengguna', me.id, me.name);
  return { token: makeToken_(me) };
}

/* ---------- Shifts (SPG, today). The phone sends its own time: calls may arrive late from the offline queue. ---------- */
function shiftInput_(req) {
  const st = byId_('Stores', req.storeId);
  if (!st || !st.active) fail_('Toko tidak ditemukan.');
  return { storeId: st.id, time: isTime_(req.time) ? req.time : nowTime_() };
}
const todayShift_ = me => find_('Shifts', s => s.user_id === me.id && s.date === today_());
const photosOf_ = shift => rows_('ShiftPhotos').filter(p => p.shift_id === shift.id).map(p => p.url);
const visitsOf_ = shift => rows_('StoreVisits').filter(v => v.shift_id === shift.id).map(v => ({ storeId: v.store_id, from: v.from_time }));

function actShiftStart_(req, me) {
  if (me.role !== 'spg') fail_('Hanya SPG yang memulai shift.', 403);
  const inp = shiftInput_(req);
  let sh = todayShift_(me);
  if (!sh) {
    sh = { id: newId_('sh'), user_id: me.id, date: today_(), start: inp.time, end: '', store_id: inp.storeId };
    append_('Shifts', [sh]);
    append_('StoreVisits', [{ shift_id: sh.id, store_id: inp.storeId, from_time: inp.time }]);
  }
  return { shift: shiftOut_(sh, visitsOf_(sh)) };
}

function actShiftSwitch_(req, me) {
  const inp = shiftInput_(req);
  const sh = todayShift_(me);
  if (!sh || sh.end) fail_('Tidak ada shift yang berjalan.');
  if (sh.store_id !== inp.storeId) {
    sh.store_id = inp.storeId;
    save_('Shifts', sh);
    append_('StoreVisits', [{ shift_id: sh.id, store_id: inp.storeId, from_time: inp.time }]);
  }
  return { shift: shiftOut_(sh, visitsOf_(sh)) };
}

/** Ending a shift needs 1–4 photos of the SPG's handwritten sales notes (saved in Drive). */
function actShiftEnd_(req, me) {
  const sh = todayShift_(me);
  if (!sh) fail_('Tidak ada shift yang berjalan.');
  if (!sh.end) { // already ended (e.g. resent from the offline queue): nothing to do
    const photos = Array.isArray(req.photos) ? req.photos : [];
    if (!photos.length) fail_('Foto catatan penjualan dulu sebelum mengakhiri shift.');
    if (photos.length > 4) fail_('Maksimal 4 foto catatan.');
    const urls = photos.map((p, i) => savePhoto_(p, 'catatan-' + me.id + '-' + sh.date + '-' + (i + 1)));
    append_('ShiftPhotos', urls.map(url => ({ shift_id: sh.id, url, at: nowStamp_() })));
    sh.end = isTime_(req.time) ? req.time : nowTime_();
    save_('Shifts', sh);
    // A shift without sales still counts as a report: "no sales"
    if (!activeSales_(me.id, sh.date).length) setDayReport_(me.id, sh.date, { no_sales: true });
  }
  return { shift: shiftOut_(sh, visitsOf_(sh), photosOf_(sh)) };
}

/* ---------- Sales ---------- */
const activeSales_ = (userId, date) => rows_('Sales').filter(s => s.user_id === userId && s.date === date && !s.deleted);

function setDayReport_(userId, date, fields) {
  const d = dayReport_(userId, date);
  if (d) {
    Object.assign(d, fields);
    save_('DayReports', d);
  } else {
    append_('DayReports', [Object.assign({ user_id: userId, date, no_sales: false, unlocked: false, unlocked_by: '' }, fields)]);
  }
}

/** Store of the shift at a given time (last visit that started at or before it). */
function storeAt_(shift, time) {
  let id = shift.store_id;
  visitsOf_(shift).forEach(v => { if (!time || v.from <= time) id = v.storeId; });
  return id;
}
function lastStoreId_(owner) {
  const shifts = rows_('Shifts').filter(s => s.user_id === owner.id && s.store_id).sort((a, b) => (a.date < b.date ? 1 : -1));
  return shifts.length ? shifts[0].store_id : owner.home_store_id;
}

/** One sale. Idempotent: the phone makes the id (UUID), so a resend from the offline queue never doubles a sale. */
function actSaleAdd_(req, me) {
  const id = str_(req.clientId, 64);
  if (!/^[0-9a-f-]{20,64}$/i.test(id)) fail_('ID transaksi tidak valid.');
  const existing = byId_('Sales', id);
  if (existing) {
    if (existing.user_id !== String(req.userId)) fail_('ID transaksi bentrok.', 409);
    return { duplicate: true };
  }
  const owner = byId_('Users', req.userId);
  const date = String(req.date || '');
  if (!isDate_(date)) fail_('Tanggal tidak valid.');
  if (!owner || owner.role !== 'spg' || !canEditDay_(me, owner, date)) fail_('Laporan hari ini sudah dikunci atau bukan milikmu.', 403);
  if (!byId_('Products', req.productId)) fail_('Produk tidak ditemukan.');
  const qty = int_(req.qty, 1, 10000, 'Jumlah tidak valid.');
  const price = int_(req.price, 0, 1e9, 'Harga tidak valid.');

  const isToday = date === today_();
  const shift = find_('Shifts', s => s.user_id === owner.id && s.date === date);
  if (me.role === 'spg' && isToday && !shift) fail_('Mulai shift dulu sebelum mencatat penjualan.');
  // Sales of today get the (phone's) time; sales added afterwards for a past day have none
  const time = isToday ? (isTime_(req.time) ? req.time : nowTime_()) : '';
  const storeId = byId_('Stores', req.storeId) ? String(req.storeId) : shift ? storeAt_(shift, time) : lastStoreId_(owner);

  append_('Sales', [{
    id, user_id: owner.id, date, time, store_id: storeId || '', product_id: String(req.productId), qty, price,
    subtotal: qty * price, created_by: me.id, created_at: nowStamp_(), deleted: false,
  }]);
  const d = dayReport_(owner.id, date);
  if (d && d.no_sales) setDayReport_(owner.id, date, { no_sales: false });
  if (me.id !== owner.id) log_(me, 'tambah penjualan', 'laporan', owner.id, owner.name + ' · ' + date);
  return { storeId: storeId || null, time };
}

function actSaleRemove_(req, me) {
  const sale = byId_('Sales', req.clientId);
  if (!sale || sale.deleted) return { missing: true }; // already removed (e.g. resent from the offline queue)
  const owner = byId_('Users', sale.user_id);
  if (!canEditDay_(me, owner, sale.date)) fail_('Laporan hari ini sudah dikunci atau bukan milikmu.', 403);
  sale.deleted = true;
  save_('Sales', sale);
  const shift = find_('Shifts', s => s.user_id === owner.id && s.date === sale.date);
  if (shift && shift.end && !activeSales_(owner.id, sale.date).length) setDayReport_(owner.id, sale.date, { no_sales: true });
  if (me.id !== owner.id) log_(me, 'hapus penjualan', 'laporan', owner.id, owner.name + ' · ' + sale.date);
  return {};
}

/** Leader/Supervisor lets an SPG edit a day outside the edit window again (or locks it again). */
function actUnlock_(req, me) {
  const owner = byId_('Users', req.userId);
  if (!owner || (me.role !== 'leader' && me.role !== 'manager') || !canView_(me, owner)) fail_('Kamu tidak punya akses.', 403);
  if (!isDate_(req.date)) fail_('Tanggal tidak valid.');
  setDayReport_(owner.id, req.date, { unlocked: !!req.unlocked, unlocked_by: me.id });
  log_(me, req.unlocked ? 'buka kunci' : 'kunci', 'laporan', owner.id, owner.name + ' · ' + req.date);
  return {};
}

/* ---------- Targets and team settings ---------- */
/** Holder of a store in the latest month before mk that has a row for it (null if none, or released). */
function lastHolderBefore_(storeId, mk) {
  let last = null;
  rows_('StoreTargets').forEach(t => { if (t.store_id === storeId && t.month < mk && (!last || t.month > last.month)) last = t; });
  return last && last.user_id ? byId_('Users', last.user_id) : null;
}

/** Manual weekly / daily targets must fit the monthly target: daily ≤ weekly ≤ monthly. */
function checkTargetParts_(store, monthly, weekly, daily) {
  if ((weekly || daily) && !monthly) fail_('Isi target bulanan ' + store + ' dulu.');
  if (weekly && weekly > monthly) fail_('Target mingguan ' + store + ' lebih besar dari target bulanan.');
  if (daily && daily > (weekly || monthly)) fail_('Target harian ' + store + ' lebih besar dari target ' + (weekly ? 'mingguan.' : 'bulanan.'));
}

/**
 * Store targets for a month: rows { storeId, mk, userId, monthly, weekly, daily }.
 * Each store is held by one SPG per month (userId null = no SPG); an SPG may hold several stores and their
 * target is the sum of those stores. A store held by an active SPG the user doesn't manage can't be taken.
 */
function actTargets_(req, me) {
  if (me.role !== 'leader' && me.role !== 'manager') fail_('Kamu tidak punya akses.', 403);
  const rowsIn = Array.isArray(req.rows) ? req.rows.slice(0, 300) : [];
  if (!rowsIn.length) fail_('Tidak ada target.');
  const seen = {};
  const checked = rowsIn.map(r => {
    const mk = String(r.mk || '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mk)) fail_('Bulan tidak valid.');
    if (mk < today_().slice(0, 7)) fail_('Target bulan yang sudah lewat tidak bisa diubah.');
    const st = byId_('Stores', r.storeId) || fail_('Toko tidak ditemukan.');
    if (seen[st.id + '|' + mk]) fail_('Toko ' + st.name + ' muncul dua kali.');
    seen[st.id + '|' + mk] = true;
    const holder = r.userId ? byId_('Users', r.userId) : null;
    if (r.userId && (!holder || holder.role !== 'spg' || !canManageUser_(me, holder))) fail_('Kamu hanya bisa memberi toko ke SPG timmu.', 403);
    const cur = find_('StoreTargets', t => t.store_id === st.id && t.month === mk);
    const curHolder = cur && cur.user_id ? byId_('Users', cur.user_id) : null;
    if (curHolder && curHolder.active && !canManageUser_(me, curHolder)) fail_('Toko ' + st.name + ' sudah dipegang SPG tim lain.', 409);
    if (!cur) { // nobody set this month yet: the store stays with the team that held it in the latest earlier month
      const last = lastHolderBefore_(st.id, mk);
      if (last && last.active && !canManageUser_(me, last)) fail_('Toko ' + st.name + ' dipegang SPG tim lain bulan lalu. Minta tim itu melepasnya dulu.', 409);
    }
    const vals = {
      user_id: holder ? holder.id : '',
      monthly: int_(r.monthly || 0, 0, 1e11, 'Target tidak valid.'),
      weekly: r.weekly ? int_(r.weekly, 0, 1e11, 'Target tidak valid.') : '',
      daily: r.daily ? int_(r.daily, 0, 1e11, 'Target tidak valid.') : '',
      set_by: me.id, set_at: today_(),
    };
    if (!holder && (vals.monthly || vals.weekly || vals.daily)) fail_('Pilih SPG untuk toko ' + st.name + '.');
    checkTargetParts_(st.name, vals.monthly, vals.weekly || 0, vals.daily || 0);
    return { st, mk, cur, vals };
  });
  const add = [];
  checked.forEach(c => {
    if (c.cur) save_('StoreTargets', Object.assign(c.cur, c.vals));
    // A new row: an SPG, or a release of a store some team held before (so it stays free in later months)
    else if (c.vals.user_id || lastHolderBefore_(c.st.id, c.mk)) add.push(Object.assign({ store_id: c.st.id, month: c.mk }, c.vals));
  });
  append_('StoreTargets', add);
  log_(me, 'atur', 'target', '', checked.length + ' toko · ' + checked[0].mk);
  return {};
}

function actSettings_(req, me) {
  const team = byId_('Teams', req.teamId);
  if (!team || !canManageTeam_(me, team.id)) fail_('Kamu tidak punya akses ke tim ini.', 403);
  const days = (Array.isArray(req.workingDays) ? req.workingDays : []).map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6);
  if (!days.length) fail_('Pilih minimal 1 hari kerja.');
  const editDays = int_(req.editDays, 0, 14, 'Batas ubah laporan harus 0–14 hari.');
  if (!isTime_(req.reminder)) fail_('Jam pengingat tidak valid.');
  const holidays = (Array.isArray(req.holidays) ? req.holidays : []).slice(0, 100).map(h => {
    if (!isDate_(h.date) || !str_(h.name)) fail_('Isi tanggal dan keterangan hari libur.');
    return { team_id: team.id, date: h.date, name: str_(h.name, 100), working: !!h.working };
  });
  const vals = { team_id: team.id, working_days: days.filter((d, i) => days.indexOf(d) === i).join(','), edit_days: editDays, reminder: req.reminder };
  const cur = find_('Settings', s => s.team_id === team.id);
  if (cur) save_('Settings', Object.assign(cur, vals));
  else append_('Settings', [vals]);
  replaceRows_('Holidays', h => h.team_id === team.id, holidays);
  log_(me, 'ubah', 'pengaturan', team.id, 'Tim ' + team.name);
  return {};
}

/* ---------- People ---------- */
function actUserAdd_(req, me) {
  const role = String(req.role || '');
  if (['spg', 'leader', 'manager'].indexOf(role) < 0) fail_('Peran tidak dikenal.');
  const name = str_(req.name, 100), phone = normalizePhone_(req.phone);
  if (!name || !phone) fail_('Nama dan nomor HP wajib diisi.');
  if (!/^08\d{8,11}$/.test(phone)) fail_('Nomor HP tidak valid (contoh: 0812 3456 7890).');
  if (find_('Users', u => u.phone === phone)) fail_('Nomor HP sudah terdaftar.');

  const u = {
    id: newId_('u'), phone, name, role, area_id: '', team_id: '', home_store_id: '', photo: '', token_version: 0,
    must_change_password: true, active: true, created_at: nowStamp_(),
  };
  setPassword_(u, DEFAULT_PASSWORD[role]);
  const firstArea = () => (byId_('Areas', req.areaId) || rows_('Areas')[0] || fail_('Buat area dulu.'));
  let newTeam = null;
  if (role === 'spg') {
    const t = byId_('Teams', req.teamId) || fail_('Pilih tim.');
    u.team_id = t.id;
  } else if (role === 'leader') {
    if (str_(req.newTeam)) {
      if (me.role !== 'admin') fail_('Kamu tidak punya akses untuk menambah pengguna ini.', 403);
      newTeam = { id: newId_('t'), name: str_(req.newTeam, 100), area_id: firstArea().id, leader_id: u.id };
      u.team_id = newTeam.id;
    } else {
      const t = byId_('Teams', req.teamId) || fail_('Pilih tim atau buat tim baru.');
      u.team_id = t.id;
    }
  } else {
    u.area_id = firstArea().id;
  }
  if (!newTeam && !canManageUser_(me, u)) fail_('Kamu tidak punya akses untuk menambah pengguna ini.', 403);

  append_('Users', [u]);
  let team = null;
  if (newTeam) {
    append_('Teams', [newTeam]);
    append_('Settings', [{ team_id: newTeam.id, working_days: '1,2,3,4,5,6', edit_days: 2, reminder: '20:00' }]);
    team = newTeam;
  } else if (u.team_id) {
    team = byId_('Teams', u.team_id);
    // A new leader leads the team when it has no (active) leader
    const lead = byId_('Users', team.leader_id);
    if (role === 'leader' && (!lead || !lead.active)) {
      team.leader_id = u.id;
      save_('Teams', team);
    }
  }
  log_(me, 'tambah', 'pengguna', u.id, u.name);
  return {
    user: userOut_(u, true),
    team: team ? teamOut_(team) : null,
    settings: newTeam ? Object.assign(settingsFor_(newTeam.id), { holidays: [] }) : null,
  };
}

/** Fix a typo in the name or phone number of someone the user manages (the phone number is their login). */
function actUserUpdate_(req, me) {
  const u = managed_(me, req.userId);
  const name = str_(req.name, 100), phone = normalizePhone_(req.phone);
  if (!name || !phone) fail_('Nama dan nomor HP wajib diisi.');
  if (!/^08\d{8,11}$/.test(phone)) fail_('Nomor HP tidak valid (contoh: 0812 3456 7890).');
  if (find_('Users', x => x.phone === phone && x.id !== u.id)) fail_('Nomor HP sudah terdaftar.');
  Object.assign(u, { name, phone });
  save_('Users', u);
  log_(me, 'ubah', 'pengguna', u.id, u.name);
  return { user: userOut_(u, true) };
}

function managed_(me, id) {
  const u = byId_('Users', id);
  if (!canManageUser_(me, u)) fail_('Kamu tidak punya akses.', 403);
  return u;
}

function actUserActive_(req, me) {
  const u = managed_(me, req.userId);
  u.active = !!req.active;
  if (!u.active) revokeTokens_(u);
  save_('Users', u);
  log_(me, u.active ? 'aktifkan' : 'nonaktifkan', 'pengguna', u.id, u.name);
  return {};
}

/** Back to the role's default password; the user must choose a new one at the next login. */
function actUserReset_(req, me) {
  const u = managed_(me, req.userId);
  setPassword_(u, DEFAULT_PASSWORD[u.role]);
  u.must_change_password = true;
  revokeTokens_(u);
  save_('Users', u);
  log_(me, 'reset password', 'pengguna', u.id, u.name);
  return { password: DEFAULT_PASSWORD[u.role] };
}

/**
 * An SPG's own schedule, set by their Team Leader or Manager: working days of the week and working hours.
 * days empty / useTeam = follow the team's working days again.
 */
function actUserSchedule_(req, me) {
  const u = managed_(me, req.userId);
  if (u.role !== 'spg') fail_('Jadwal hanya untuk SPG.');
  if (req.useTeam) {
    Object.assign(u, { work_days: '', work_start: '', work_end: '' });
  } else {
    const days = (Array.isArray(req.days) ? req.days : []).map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6);
    if (!days.length) fail_('Pilih minimal 1 hari kerja.');
    const start = str_(req.start, 5), end = str_(req.end, 5);
    if ((start || end) && (!isTime_(start) || !isTime_(end))) fail_('Isi jam mulai dan jam selesai (contoh 10:00 dan 19:00).');
    if (start && start >= end) fail_('Jam selesai harus setelah jam mulai.');
    Object.assign(u, { work_days: days.filter((d, i) => days.indexOf(d) === i).sort().join(','), work_start: start, work_end: end });
  }
  save_('Users', u);
  log_(me, 'atur jadwal', 'pengguna', u.id, u.name);
  return { user: userOut_(u, true) };
}

/** Profile photo: own photo, or of someone the user manages. Stored in Google Drive. */
function actUserPhoto_(req, me) {
  const u = String(req.userId) === me.id ? me : managed_(me, req.userId);
  u.photo = savePhoto_(req.photo, 'foto-' + u.id);
  save_('Users', u);
  return { photo: u.photo };
}

/* ---------- Products and stores: shared lists ---------- */
function catalogItem_(table, req, me, kind) {
  if (req.id) {
    const cur = byId_(table, req.id) || fail_(kind[0].toUpperCase() + kind.slice(1) + ' tidak ditemukan.', 404);
    if (!canEditCatalog_(me, cur)) fail_('Kamu tidak punya akses untuk mengubah ' + kind + '.', 403);
    return cur;
  }
  if (!canAddCatalog_(me)) fail_('Kamu tidak punya akses untuk menambah ' + kind + '.', 403);
  return null;
}

function actProductSave_(req, me) {
  const cur = catalogItem_('Products', req, me, 'produk');
  const name = str_(req.name, 150), sku = str_(req.sku, 50), brand = str_(req.brand, 100), barcode = str_(req.barcode, 50);
  if (!name) fail_('Isi nama produk.');
  const price = int_(req.price, 1, 1e9, 'Isi harga yang benar.');
  if (sku && find_('Products', p => p.sku === sku && (!cur || p.id !== cur.id))) fail_('SKU sudah dipakai produk lain.');
  const p = cur || { id: newId_('p'), created_by: me.id, photo: '' };
  Object.assign(p, { name, sku, brand, barcode, price, active: req.active !== false, updated_by: me.id, updated_at: today_() });
  if (/^data:image\//.test(String(req.image || ''))) p.photo = savePhoto_(req.image, 'produk-' + p.id);
  if (cur) save_('Products', p);
  else append_('Products', [p]);
  log_(me, cur ? 'ubah' : 'tambah', 'produk', p.id, p.name);
  return { product: productOut_(p) };
}

function actStoreSave_(req, me) {
  const cur = catalogItem_('Stores', req, me, 'toko');
  const name = str_(req.name, 150), city = titleCase_(str_(req.city, 100));
  if (!name || !city) fail_('Isi nama dan kota toko.');
  if (find_('Stores', x => x.name.trim().toLowerCase() === name.toLowerCase() && (!cur || x.id !== cur.id))) fail_('Nama toko ' + name + ' sudah ada. Pakai nama lain (mis. tambahkan cabang/kota).');
  const area = me.area_id || (byId_('Teams', me.team_id) || {}).area_id || (rows_('Areas')[0] || {}).id || '';
  const s = cur || { id: newId_('st'), created_by: me.id, area_id: area, photo: '' };
  Object.assign(s, { name, chain: str_(req.chain, 100), city, address: str_(req.address, 255), active: req.active !== false, updated_by: me.id, updated_at: today_() });
  if (/^data:image\//.test(String(req.image || ''))) s.photo = savePhoto_(req.image, 'toko-' + s.id);
  if (cur) save_('Stores', s);
  else append_('Stores', [s]);
  log_(me, cur ? 'ubah' : 'tambah', 'toko', s.id, s.name);
  return { store: storeOut_(s) };
}

/* ---------- Photos in Google Drive ---------- */
/**
 * Saves a JPEG/PNG/WebP data URL (already cropped and resized in the browser) in the photo folder,
 * shares it "anyone with the link" and returns the image address the pages show.
 */
function savePhoto_(dataUrl, name) {
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) fail_('Format foto harus JPG, PNG atau WebP.');
  const bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 2 * 1024 * 1024) fail_('Foto terlalu besar (maks. 2 MB).');
  const file = photoFolder_().createFile(Utilities.newBlob(bytes, 'image/' + m[1], name + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1])));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w400';
}

function photoFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('PHOTO_FOLDER_ID');
  if (id) return DriveApp.getFolderById(id);
  const folder = DriveApp.createFolder('Laporan SPG – Foto');
  props.setProperty('PHOTO_FOLDER_ID', folder.getId());
  return folder;
}
