/*
 * Data layer. Every page reads and writes data only through the functions exported at the bottom (window.Data).
 * Two backends, picked by window.APP_CONFIG (assets/js/config.js):
 * - demo (default): data is generated once with a fixed seed and kept in localStorage.
 * - sheets: Data.ready() loads the logged-in user's data from the Google Apps Script web app ("bootstrap", same shape);
 *   writes update the local copy at once and are sent to the server through a retrying queue
 *   (the "outbox", kept in localStorage so nothing is lost offline). Pages wait for Data.ready().
 */
(function () {
  'use strict';

  const CONFIG = Object.assign({ backend: 'demo', url: '' }, window.APP_CONFIG || {});
  const LIVE = CONFIG.backend === 'sheets';
  const STORE_KEY = 'lspg-data-v1';
  const USER_KEY = 'lspg-user';
  // Demo: fixed dates. Live: set from the server (today, and the first day of data sent to the page).
  let DATA_START = '2026-09-01';
  let TODAY = '2026-10-22';

  /* ---------- Date helpers (dates are 'YYYY-MM-DD' strings) ---------- */
  const pad = n => String(n).padStart(2, '0');
  const toStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return toStr(d); };
  const addMonths = (mk, n) => { const d = parse(mk + '-01'); d.setMonth(d.getMonth() + n); return toStr(d).slice(0, 7); };
  const dow = s => parse(s).getDay(); // 0 = Sunday
  const weekStart = s => addDays(s, -((dow(s) + 6) % 7)); // Monday
  const weekEnd = s => addDays(weekStart(s), 6);
  const monthKey = s => s.slice(0, 7);
  const monthStart = s => s.slice(0, 7) + '-01';
  const monthEnd = s => { const d = parse(monthStart(s)); d.setMonth(d.getMonth() + 1); d.setDate(0); return toStr(d); };
  const eachDay = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };

  function range(period, date) {
    if (period === 'day') return [date, date];
    if (period === 'week') return [weekStart(date), weekEnd(date)];
    return [monthStart(date), monthEnd(date)];
  }

  /* ---------- Seed data ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  const PRODUCTS = [
    { id: 'p1', name: 'Soft Moisturizing Creme 100ml', sku: 'SOFT-100', price: 65000 },
    { id: 'p2', name: 'Men Deep Facial Foam 100g', sku: 'MEN-DFF-100', price: 55000 },
    { id: 'p3', name: 'Body Lotion Extra White 400ml', sku: 'BL-EW-400', price: 85000 },
    { id: 'p4', name: 'Deodorant Roll-on 50ml', sku: 'DEO-RO-50', price: 25000 },
    { id: 'p5', name: 'Micellar Water 400ml', sku: 'MIC-400', price: 95000 },
    { id: 'p6', name: 'Creme Tin 150ml', sku: 'CREME-150', price: 60000 },
    { id: 'p7', name: 'Lip Care Original 4.8g', sku: 'LIP-OR', price: 30000 },
  ];

  // username, name, store, monthly target (jt), skill factor
  const T1_SPGS = [
    ['sari', 'Sari Wulandari', 'Kemang', 50, 0.95],
    ['dewi', 'Dewi Lestari', 'Pondok Indah', 50, 1.17],
    ['putri', 'Putri Ayu', 'Cilandak', 45, 0.94],
    ['rani', 'Rani Kusuma', 'Blok M', 40, 0.66],
    ['maya', 'Maya Sari', 'Fatmawati', 45, 1.16],
    ['indah', 'Indah Permata', 'Tebet', 40, 0.81],
    ['fitri', 'Fitri Handayani', 'Pancoran', 45, 1.0],
    ['lina', 'Lina Marlina', 'Mampang', 40, 0.97],
  ];
  const OTHER_TEAMS = [
    ['t2', 'Jakarta Pusat', ['andi', 'Andi Pratama'], 1.06, ['Senen', 'Tanah Abang', 'Menteng', 'Cempaka Putih', 'Gambir', 'Kemayoran', 'Sawah Besar', 'Johar Baru', 'Cikini']],
    ['t3', 'Jakarta Barat', ['yuni', 'Yuni Rahmawati'], 0.88, ['Grogol', 'Kebon Jeruk', 'Cengkareng', 'Kalideres', 'Palmerah', 'Tambora', 'Taman Sari']],
    ['t4', 'Tangerang', ['hendra', 'Hendra Wijaya'], 0.9, ['Karawaci', 'Ciledug', 'BSD', 'Cipondoh', 'Tangerang Kota', 'Alam Sutera']],
    ['t5', 'Bekasi', ['siti', 'Siti Rahma'], 1.02, ['Bekasi Barat', 'Bekasi Timur', 'Summarecon', 'Harapan Indah', 'Jatiasih', 'Pondok Gede', 'Tambun', 'Cikarang']],
  ];
  const NAMES = ['Nur Aini', 'Wulan Sari', 'Tika Pratiwi', 'Ayu Rahmawati', 'Rina Safitri', 'Dian Puspita', 'Novi Andriani', 'Eka Susanti',
    'Mega Utami', 'Yuli Astuti', 'Ratna Dewi', 'Sri Wahyuni', 'Fera Oktaviani', 'Lia Amelia', 'Vina Melati', 'Siska Anggraini',
    'Tari Kurnia', 'Ani Suryani', 'Rika Febriani', 'Winda Sari', 'Ika Nuraini', 'Hana Pertiwi', 'Mira Yulianti', 'Nia Kurniasih',
    'Dina Maharani', 'Lusi Handayani', 'Okta Ramadhani', 'Ella Marlina', 'Gita Purnama', 'Yanti Susilo'];

  const defaultSettings = () => ({
    workingDays: [1, 2, 3, 4, 5, 6], // Mon–Sat
    holidays: [
      { date: '2026-12-25', name: 'Hari Raya Natal', working: true },
      { date: '2027-01-01', name: 'Tahun Baru 2027', working: false },
    ],
    editDays: 2,
    reminder: '20:00',
  });

  function seed() {
    const rng = mulberry32(20261022);
    // Demo accounts get easy numbers (they log in with them); everyone else a random, unique one
    const DEMO_PHONE = {
      admin: '081100000001', budi: '081100000002',
      rina: '081200000001', andi: '081200000002', yuni: '081200000003', hendra: '081200000004', siti: '081200000005',
      sari: '081300000001', dewi: '081300000002', putri: '081300000003', rani: '081300000004',
      maya: '081300000005', indah: '081300000006', fitri: '081300000007', lina: '081300000008',
    };
    const used = new Set(Object.values(DEMO_PHONE));
    const randomPhone = () => { let n; do { n = '0815' + String(Math.floor(rng() * 1e8)).padStart(8, '0'); } while (used.has(n)); used.add(n); return n; };
    const phoneFor = username => DEMO_PHONE[username] || randomPhone();
    const s = {
      version: 5,
      products: PRODUCTS.map(p => ({ ...p, active: true, image: 'assets/products/' + p.id + '.svg', createdBy: 'u-admin', updatedBy: 'u-admin', updatedAt: '2026-09-01' })),
      stores: [], activity: [],
      areas: [{ id: 'a1', name: 'Jabodetabek' }],
      teams: [], users: [], targets: {}, reports: {}, settings: {}, shifts: {},
    };
    const skill = {};
    const CITY = { t1: 'Jakarta Selatan', t2: 'Jakarta Pusat', t3: 'Jakarta Barat', t4: 'Tangerang', t5: 'Bekasi' };
    const CHAINS = ['Supermarket', 'Hypermarket', 'Department Store', 'Minimarket', 'Drugstore'];
    // Shared store list; each seeded SPG has a usual store (pre-selected when starting a shift)
    function addStore(name, teamId, by) {
      const st = { id: 'st' + (s.stores.length + 1), name: 'Toko ' + name, chain: CHAINS[Math.floor(rng() * CHAINS.length)], city: CITY[teamId],
        address: 'Jl. ' + name + ' No. ' + (1 + Math.floor(rng() * 120)), areaId: 'a1', active: true, createdBy: by, updatedBy: by, updatedAt: '2026-09-01' };
      s.stores.push(st);
      return st.id;
    }

    function setTargets(uid, monthly, by) {
      s.targets[uid + '|2026-09'] = { monthly, weekly: null, daily: null, setBy: by, setAt: '2026-08-28' };
      s.targets[uid + '|2026-10'] = { monthly, weekly: null, daily: null, setBy: by, setAt: '2026-09-28' };
    }
    function addTeam(id, name, [username, leaderName]) {
      s.teams.push({ id, name, areaId: 'a1', leaderId: 'u-' + username });
      s.users.push({ id: 'u-' + username, username, password: 'leader123', name: leaderName, role: 'leader', teamId: id, phone: phoneFor(username), active: true });
      s.settings[id] = defaultSettings();
    }

    s.users.push({ id: 'u-budi', username: 'budi', password: 'super123', name: 'Budi Santoso', role: 'supervisor', areaId: 'a1', phone: phoneFor('budi'), active: true });
    s.users.push({ id: 'u-admin', username: 'admin', password: 'admin123', name: 'Admin', role: 'admin', phone: phoneFor('admin'), active: true });

    addTeam('t1', 'Jakarta Selatan', ['rina', 'Rina Agustina']);
    T1_SPGS.forEach(([username, name, store, target, k]) => {
      const id = 'u-' + username;
      s.users.push({ id, username, password: 'spg123', name, role: 'spg', teamId: 't1', homeStoreId: addStore(store, 't1', 'u-rina'), phone: phoneFor(username), active: true });
      skill[id] = k;
      setTargets(id, target * 1e6, 'u-rina');
    });

    let ni = 0;
    OTHER_TEAMS.forEach(([teamId, teamName, leader, k, stores]) => {
      addTeam(teamId, teamName, leader);
      stores.forEach(store => {
        const name = NAMES[ni++];
        const username = name.split(' ')[0].toLowerCase() + ni;
        const id = 'u-' + username;
        s.users.push({ id, username, password: 'spg123', name, role: 'spg', teamId, homeStoreId: addStore(store, teamId, 'u-' + leader[0]), phone: phoneFor(username), active: true });
        skill[id] = k * (0.8 + rng() * 0.4);
        setTargets(id, [35, 40, 45, 50][Math.floor(rng() * 4)] * 1e6, 'u-' + leader[0]);
      });
    });

    // Default portraits (generated by tools/generate-avatars.js); uploaded photos replace them
    s.users.forEach(u => { u.photo = 'assets/avatars/' + u.username + '.svg'; });
    state = s;
    memo = {};

    const price = pid => PRODUCTS.find(p => p.id === pid).price;
    const missingToday = new Set(['u-rani', 'u-indah']);
    s.users.filter(u => u.role === 'spg').forEach(u => {
      const missRate = u.id === 'u-rani' ? 0.08 : u.id === 'u-indah' ? 0.06 : u.id === 'u-sari' ? 0 : 0.02;
      for (const d of eachDay(DATA_START, TODAY)) {
        if (!isWorkingDay(u.teamId, d)) continue;
        if (d === TODAY && (missingToday.has(u.id) || (u.teamId !== 't1' && rng() < 0.13))) continue;
        if (u.id === 'u-sari' && d === '2026-10-13') continue;
        if (d !== TODAY && rng() < missRate) continue;
        const items = (u.id === 'u-sari' && d === TODAY)
          ? [['p1', 5], ['p2', 6], ['p3', 4], ['p4', 10]].map(([productId, qty]) => ({ productId, qty, price: price(productId) }))
          : makeItems(dailyTarget(u.id, d) * skill[u.id] * (0.7 + rng() * 0.6), rng);
        const rep = buildReport(u.id, d, items, false, '', u.id, null);
        const startMin = 9 * 60 + Math.floor(rng() * 16);
        // Loginable team (t1) gets individual timestamped transactions; other teams keep daily totals only.
        const home = u.homeStoreId;
        const shift = { start: hhmm(startMin), end: d === TODAY ? null : hhmm(21 * 60 + Math.floor(rng() * 15)), storeId: home, visits: [{ storeId: home, from: hhmm(startMin) }] };
        // Demo of a store switch: Sari covers Toko Pondok Indah from 12:00 today
        if (u.id === 'u-sari' && d === TODAY) { shift.visits.push({ storeId: s.users.find(x => x.id === 'u-dewi').homeStoreId, from: '12:00' }); shift.storeId = shift.visits[1].storeId; }
        if (u.teamId === 't1') {
          rep.transactions = splitIntoTransactions(items, rng, startMin, d === TODAY ? 13 * 60 + 40 : 20 * 60 + 50)
            .map(t => ({ ...t, storeId: visitAt(shift, t.time) }));
        }
        s.reports[u.id + '|' + d] = rep;
        s.shifts[u.id + '|' + d] = shift;
      }
    });
    return s;
  }

  // Store the shift was at, at a given time (last visit that started at or before it)
  function visitAt(shift, time) {
    let id = shift.storeId;
    (shift.visits || []).forEach(v => { if (!time || v.from <= time) id = v.storeId; });
    return id;
  }
  const hhmm = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
  function splitIntoTransactions(items, rng, fromMin, toMin) {
    const tx = [];
    items.forEach(i => {
      let left = i.qty;
      while (left > 0) {
        const q = Math.min(left, 1 + Math.floor(rng() * 3));
        tx.push({ productId: i.productId, qty: q, price: i.price });
        left -= q;
      }
    });
    const times = tx.map(() => fromMin + 10 + Math.floor(rng() * (toMin - fromMin - 10))).sort((a, b) => a - b);
    tx.sort(() => rng() - 0.5);
    return tx.map((t, n) => ({ id: 's' + n, time: hhmm(times[n]), ...t }));
  }

  function makeItems(goal, rng) {
    const pool = PRODUCTS.slice().sort(() => rng() - 0.5).slice(0, 2 + Math.floor(rng() * 4));
    const qty = {};
    let total = 0;
    while (total < goal) {
      const p = pool[Math.floor(rng() * pool.length)];
      qty[p.id] = (qty[p.id] || 0) + 1;
      total += p.price;
    }
    return pool.filter(p => qty[p.id]).map(p => ({ productId: p.id, qty: qty[p.id], price: p.price }));
  }

  function buildReport(userId, date, items, noSales, notes, by, prev) {
    const clean = noSales ? [] : items.filter(i => i.qty > 0).map(i => ({ productId: i.productId, qty: +i.qty, price: +i.price }));
    return {
      userId, date, items: clean, noSales: !!noSales, notes: notes || '',
      total: clean.reduce((a, i) => a + i.qty * i.price, 0),
      createdAt: prev ? prev.createdAt : date, updatedAt: TODAY, updatedBy: by,
      unlocked: prev ? !!prev.unlocked : false,
    };
  }

  // Ids made on the phone. Live: a UUID, which the server uses to ignore a sale sent twice.
  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }

  /* ---------- Storage ---------- */
  let state = null;
  let memo = {};

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable: keep in memory */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }

  // Demo: all data in localStorage. Live: the page's copy of the server data (cache for the next page)
  function persist() { if (LIVE) saveCache(state); else lsSet(STORE_KEY, JSON.stringify(state)); }


  /* ---------- Session (hardcoded accounts) ---------- */
  // Phone numbers in any common format (0812…, 62812…, +62 812-…) compare as 0812…
  function normalizePhone(v) {
    let d = String(v || '').replace(/\D/g, '');
    if (d.startsWith('62')) d = '0' + d.slice(2);
    else if (d.startsWith('8')) d = '0' + d;
    return d;
  }
  function login(phone, password) {
    const n = normalizePhone(phone);
    const u = n && state.users.find(x => normalizePhone(x.phone) === n && x.password === password && x.active);
    if (!u) return null;
    lsSet(USER_KEY, u.id);
    return u;
  }
  function logout() { lsDel(USER_KEY); }
  function currentUser() { const id = lsGet(USER_KEY); return id ? user(id) || null : null; }

  /* ---------- Lookups ---------- */
  const user = id => state.users.find(u => u.id === id);
  const team = id => state.teams.find(t => t.id === id);
  const teams = () => state.teams.slice();
  const allUsers = () => state.users.slice();
  // photo: a data URL (uploaded) or a path relative to the site root
  function setUserPhoto(userId, photo) { const u = user(userId); if (u) { u.photo = photo; persist(); } }
  const area = id => state.areas.find(a => a.id === id);
  const spgsOf = (teamId, includeInactive) => state.users.filter(u => u.role === 'spg' && u.teamId === teamId && (includeInactive || u.active));
  const products = includeInactive => state.products.filter(p => includeInactive || p.active);
  const product = id => state.products.find(p => p.id === id);

  function canView(viewer, owner) {
    if (!viewer || !owner) return false;
    if (viewer.role === 'spg') return viewer.id === owner.id;
    if (viewer.role === 'leader') return owner.teamId === viewer.teamId;
    return viewer.role === 'supervisor';
  }

  /* ---------- Working days ---------- */
  function isWorkingDay(teamId, d) {
    const st = state.settings[teamId];
    const h = st.holidays.find(x => x.date === d);
    if (h) return !!h.working;
    return st.workingDays.includes(dow(d));
  }
  const workingDays = (teamId, from, to) => eachDay(from, to).filter(d => isWorkingDay(teamId, d));
  function workingDaysInMonth(teamId, mk) {
    const key = teamId + '|' + mk;
    if (!(key in memo)) memo[key] = workingDays(teamId, mk + '-01', monthEnd(mk + '-01')).length;
    return memo[key];
  }

  /* ---------- Targets ---------- */
  const targetRow = (userId, mk) => state.targets[userId + '|' + mk] || null;

  function dailyTarget(userId, date) {
    const u = user(userId);
    if (!isWorkingDay(u.teamId, date)) return 0;
    const t = targetRow(userId, monthKey(date));
    if (!t) return 0;
    if (t.daily) return t.daily;
    const wd = workingDaysInMonth(u.teamId, monthKey(date));
    return wd ? t.monthly / wd : 0;
  }
  function weekTarget(userId, date) {
    const t = targetRow(userId, monthKey(date));
    if (t && t.weekly) return t.weekly;
    return eachDay(weekStart(date), weekEnd(date)).reduce((a, d) => a + dailyTarget(userId, d), 0);
  }
  function periodTarget(userId, period, date) {
    if (period === 'day') return dailyTarget(userId, date);
    if (period === 'week') return weekTarget(userId, date);
    const t = targetRow(userId, monthKey(date));
    return t ? t.monthly : 0;
  }
  // Preview of derived targets for the target page
  function targetPreview(teamId, mk, monthly) {
    const wd = workingDaysInMonth(teamId, mk);
    const daily = wd ? monthly / wd : 0;
    return { workDays: wd, daily, weekly: daily * state.settings[teamId].workingDays.length };
  }
  function saveTargets(rows, by) {
    rows.forEach(r => {
      state.targets[r.userId + '|' + r.mk] = {
        monthly: r.monthly || 0, weekly: r.weekly || null, daily: r.daily || null, setBy: by, setAt: TODAY,
      };
    });
    persist();
  }

  /* ---------- Reports ---------- */
  const getReport = (userId, date) => state.reports[userId + '|' + date] || null;

  /* ---------- Shifts & per-sale transactions ---------- */
  const nowTime = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const getShift = (userId, date) => (state.shifts || {})[userId + '|' + date] || null;
  function startShift(userId, storeId, time) {
    state.shifts = state.shifts || {};
    const key = userId + '|' + TODAY;
    if (!state.shifts[key]) {
      const t = time || nowTime();
      state.shifts[key] = { start: t, end: null, storeId, visits: [{ storeId, from: t }] };
      delete memo.lastStore;
    }
    persist();
    return state.shifts[key];
  }
  // Move the open shift to another store; new sales get that store
  function switchStore(userId, storeId, time) {
    const sh = getShift(userId, TODAY);
    if (!sh || sh.end || sh.storeId === storeId) return sh;
    sh.storeId = storeId;
    (sh.visits = sh.visits || []).push({ storeId, from: time || nowTime() });
    delete memo.lastStore;
    persist();
    return sh;
  }
  // Store of a user's most recent shift (or their usual store)
  function lastStoreId(userId) {
    if (!memo.lastStore) {
      const m = {};
      Object.keys(state.shifts || {}).sort().forEach(k => { const [uid] = k.split('|'); const sh = state.shifts[k]; if (sh.storeId) m[uid] = sh.storeId; });
      memo.lastStore = m;
    }
    const u = user(userId);
    return memo.lastStore[userId] || (u && u.homeStoreId) || null;
  }
  const storeLabel = u => { const st = u && store(lastStoreId(u.id)); return st ? st.name : ''; };
  // Store for a sale on a given date/time
  function storeFor(userId, date, time) {
    const sh = getShift(userId, date);
    return sh ? visitAt(sh, time) : lastStoreId(userId);
  }
  // photos: pictures of the SPG's handwritten sales notes, required when ending a shift
  function endShift(userId, by, photos, time) {
    const sh = getShift(userId, TODAY);
    if (!sh || sh.end) return sh;
    sh.end = time || nowTime();
    sh.photos = (photos || []).slice();
    // A shift with no sales still counts as a report: "no sales"
    if (!getReport(userId, TODAY)) state.reports[userId + '|' + TODAY] = { ...emptyReport(userId, TODAY, by), noSales: true };
    persist();
    return sh;
  }
  // Transactions of a report; older/other-team reports only have daily totals per product (no time)
  const getTransactions = r => !r ? [] : r.transactions || r.items.map((i, n) => ({ id: 'i' + n, time: '', storeId: storeFor(r.userId, r.date, ''), ...i }));

  function emptyReport(userId, date, by) {
    return { userId, date, transactions: [], items: [], total: 0, noSales: false, notes: '', createdAt: TODAY, updatedAt: TODAY, updatedBy: by, unlocked: false };
  }
  function rebuild(r) {
    const map = {};
    r.transactions.forEach(t => {
      const k = t.productId + '|' + t.price;
      (map[k] = map[k] || { productId: t.productId, qty: 0, price: t.price }).qty += t.qty;
    });
    r.items = Object.values(map);
    r.total = r.transactions.reduce((a, t) => a + t.qty * t.price, 0);
  }
  function addSale(userId, date, sale, by) {
    const key = userId + '|' + date;
    let r = state.reports[key];
    if (!r) r = state.reports[key] = emptyReport(userId, date, by);
    if (!r.transactions) r.transactions = getTransactions(r);
    const time = sale.time != null ? sale.time : date === TODAY ? nowTime() : ''; // '' = added afterwards for a past day
    const tx = {
      id: sale.id || newId(),
      time,
      storeId: sale.storeId || storeFor(userId, date, time),
      productId: sale.productId, qty: Math.max(1, Math.floor(+sale.qty || 1)), price: Math.max(0, Math.round(+sale.price || 0)), by,
    };
    r.transactions.push(tx);
    r.noSales = false;
    r.updatedAt = TODAY; r.updatedBy = by;
    rebuild(r);
    persist();
    return tx;
  }
  function removeSale(userId, date, txId, by) {
    const key = userId + '|' + date;
    const r = state.reports[key];
    if (!r) return;
    r.transactions = getTransactions(r).filter(t => t.id !== txId);
    r.updatedAt = TODAY; r.updatedBy = by;
    rebuild(r);
    const sh = getShift(userId, date);
    if (!r.transactions.length) {
      if (sh && sh.end) r.noSales = true; else delete state.reports[key];
    }
    persist();
  }

  function saveReport(r, by) {
    const prev = getReport(r.userId, r.date);
    state.reports[r.userId + '|' + r.date] = buildReport(r.userId, r.date, r.items, r.noSales, r.notes, by, prev);
    persist();
  }
  function setUnlocked(userId, date, value) {
    const r = getReport(userId, date);
    if (!r) return;
    r.unlocked = !!value;
    persist();
  }
  // Locked for the SPG: older than the team's edit window and not unlocked by a leader
  function isLocked(userId, date) {
    const u = user(userId);
    const r = getReport(userId, date);
    if (r && r.unlocked) return false;
    return date < addDays(TODAY, -state.settings[u.teamId].editDays);
  }
  function canEdit(viewer, ownerId, date) {
    const owner = user(ownerId);
    if (date > TODAY || !canView(viewer, owner)) return false;
    if (viewer.role === 'spg') return !isLocked(ownerId, date);
    return true;
  }
  function listReports({ userIds, from, to }) {
    const out = [];
    userIds.forEach(id => eachDay(from, to).forEach(d => { const r = getReport(id, d); if (r) out.push(r); }));
    return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : user(a.userId).name.localeCompare(user(b.userId).name)));
  }

  /* ---------- Progress, levels, ranking ---------- */
  const actualSum = (userId, from, to) => eachDay(from, to).reduce((a, d) => { const r = getReport(userId, d); return a + (r ? r.total : 0); }, 0);

  function progress(userId, period, date) {
    date = date || TODAY;
    const [from, to] = range(period, date);
    const u = user(userId);
    const actual = actualSum(userId, from, date < to ? date : to);
    const target = periodTarget(userId, period, date);
    const pct = target > 0 ? actual / target * 100 : 0;
    const remaining = Math.max(0, target - actual);
    let restDays = workingDays(u.teamId, addDays(date, 1), to).length;
    if (!getReport(userId, date) && isWorkingDay(u.teamId, date)) restDays += 1;
    return { period, from, to, actual, target, pct, remaining, restDays, perDay: restDays ? remaining / restDays : remaining };
  }

  const LEVELS = [
    // color = ring/progress color, iconColor = medal color
    { min: 120, name: 'Berlian', label: 'Level Berlian', icon: 'gem', color: '#1E8E5A', iconColor: '#1E8E5A' },
    { min: 100, name: 'Emas', label: 'Level Emas', icon: 'award', color: '#C9A227', iconColor: '#B8901A' },
    { min: 80, name: 'Perak', label: 'Level Perak', icon: 'award', color: '#00136F', iconColor: '#7A8699' },
    { min: 50, name: 'Perunggu', label: 'Level Perunggu', icon: 'award', color: '#B26B00', iconColor: '#A0612A' },
    { min: 0, name: 'Pemula', label: 'Level Pemula', icon: 'target', color: '#C8323C', iconColor: '#C8323C' },
  ];
  const level = pct => LEVELS.find(l => pct >= l.min);
  const nextLevel = pct => LEVELS.slice().reverse().find(l => l.min > pct) || null;

  function leaderboard(teamId, period, date) {
    date = date || TODAY;
    return spgsOf(teamId)
      .map(u => { const p = progress(u.id, period, date); return { user: u, ...p, level: level(p.pct) }; })
      .sort((a, b) => b.pct - a.pct || b.actual - a.actual)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }

  // Working days in a row with sales >= daily target. Today only counts once it's reached.
  function streak(userId, date) {
    date = date || TODAY;
    const u = user(userId);
    let d = date;
    const r0 = getReport(userId, d);
    if (!(r0 && dailyTarget(userId, d) > 0 && r0.total >= dailyTarget(userId, d))) d = addDays(d, -1);
    let n = 0;
    for (; d >= DATA_START; d = addDays(d, -1)) {
      if (!isWorkingDay(u.teamId, d)) continue;
      const r = getReport(userId, d), t = dailyTarget(userId, d);
      if (!r || !t || r.total < t) break;
      n++;
    }
    return n;
  }

  function productTotals(userIds, from, to) {
    const map = {};
    listReports({ userIds, from, to }).forEach(r => r.items.forEach(i => {
      const m = map[i.productId] || (map[i.productId] = { product: product(i.productId), qty: 0, amount: 0 });
      m.qty += i.qty; m.amount += i.qty * i.price;
    }));
    return Object.values(map).sort((a, b) => b.amount - a.amount);
  }

  // Daily totals for a group of SPGs: one point per working day (actual sales vs. summed daily target)
  // With storeId: only sales made at that store, and no target (targets are per SPG, not per store)
  function dailySeries(userIds, teamIds, from, to, storeId) {
    const amount = r => !r ? 0 : !storeId ? r.total
      : getTransactions(r).filter(t => t.storeId === storeId).reduce((a, t) => a + t.qty * t.price, 0);
    return eachDay(from, to)
      .filter(d => teamIds.some(t => isWorkingDay(t, d)))
      .map(d => ({
        date: d,
        actual: userIds.reduce((a, id) => a + amount(getReport(id, d)), 0),
        target: storeId ? 0 : userIds.reduce((a, id) => a + dailyTarget(id, d), 0),
      }));
  }
  // Chart window per period: last 14 days for "today", otherwise the period itself (up to today)
  function chartRange(period, date) {
    if (period === 'day') return [addDays(date, -13), date];
    const [from, to] = range(period, date);
    return [from, to < date ? to : date];
  }

  function teamSummary(teamId, period, date) {
    date = date || TODAY;
    const lb = leaderboard(teamId, period, date);
    const [from, to] = range(period, date);
    const actual = lb.reduce((a, r) => a + r.actual, 0);
    const target = lb.reduce((a, r) => a + r.target, 0);
    let expected = null;
    if (period !== 'day') {
      const all = workingDays(teamId, from, to).length;
      expected = all ? workingDays(teamId, from, date).length / all * 100 : null;
    }
    const working = isWorkingDay(teamId, date);
    const missing = working ? lb.filter(r => !getShift(r.user.id, date) && !getReport(r.user.id, date)).map(r => r.user) : [];
    return {
      team: team(teamId), lb, from, to, actual, target, pct: target ? actual / target * 100 : 0, expected, working,
      missing, reported: lb.length - missing.length, size: lb.length,
      products: productTotals(lb.map(r => r.user.id), from, date < to ? date : to),
    };
  }

  function areaSummary(areaId, period, date) {
    const list = state.teams.filter(t => t.areaId === areaId).map(t => teamSummary(t.id, period, date));
    const actual = list.reduce((a, t) => a + t.actual, 0);
    const target = list.reduce((a, t) => a + t.target, 0);
    const topSpgs = list.flatMap(t => t.lb).sort((a, b) => b.pct - a.pct || b.actual - a.actual);
    return {
      area: area(areaId), teams: list.sort((a, b) => b.pct - a.pct), actual, target,
      pct: target ? actual / target * 100 : 0, expected: list[0] ? list[0].expected : null,
      reported: list.reduce((a, t) => a + t.reported, 0), size: list.reduce((a, t) => a + t.size, 0), topSpgs,
    };
  }

  /* ---------- Team, settings, products ---------- */
  /* ---------- People, products, stores (with permissions + activity log) ---------- */
  const DEFAULT_PW = { spg: 'spg123', leader: 'leader123', supervisor: 'super123', admin: 'admin123' };
  function log(by, action, kind, id, name) {
    (state.activity = state.activity || []).unshift({ at: TODAY + ' ' + nowTime(), by, action, kind, id, name });
    state.activity.length = Math.min(state.activity.length, 500);
  }
  // Who may manage which accounts: Admin → Supervisors & Team Leaders; Leader → own team's SPGs; Supervisor → SPGs in area
  function canManageUser(viewer, target) {
    if (!viewer || !target) return false;
    if (viewer.role === 'admin') return target.role === 'leader' || target.role === 'supervisor';
    if (target.role !== 'spg') return false;
    if (viewer.role === 'leader') return target.teamId === viewer.teamId;
    if (viewer.role === 'supervisor') { const t = team(target.teamId); return !!t && t.areaId === viewer.areaId; }
    return false;
  }
  function addUser(data, by) {
    const viewer = user(by);
    const role = data.role;
    const phone = normalizePhone(data.phone);
    const name = String(data.name || '').trim();
    if (!name || !phone) return 'Nama dan nomor HP wajib diisi.';
    if (!/^08\d{8,11}$/.test(phone)) return 'Nomor HP tidak valid (contoh: 0812 3456 7890).';
    if (state.users.some(u => normalizePhone(u.phone) === phone)) return 'Nomor HP sudah terdaftar.';
    const u = { id: 'u' + Date.now().toString(36), username: '', password: DEFAULT_PW[role], name, role, phone, active: true, photo: '' };
    if (role === 'spg') {
      const t = team(data.teamId);
      if (!t) return 'Pilih tim.';
      u.teamId = t.id;
    } else if (role === 'leader') {
      if (data.newTeam) {
        const tid = 't' + Date.now().toString(36);
        state.teams.push({ id: tid, name: String(data.newTeam).trim(), areaId: data.areaId || 'a1', leaderId: u.id });
        state.settings[tid] = defaultSettings();
        u.teamId = tid;
      } else {
        const t = team(data.teamId);
        if (!t) return 'Pilih tim atau buat tim baru.';
        u.teamId = t.id;
        if (!t.leaderId || !(user(t.leaderId) || {}).active) t.leaderId = u.id;
      }
    } else if (role === 'supervisor') {
      u.areaId = data.areaId || 'a1';
    } else return 'Peran tidak dikenal.';
    if (!canManageUser(viewer, u)) return 'Kamu tidak punya akses untuk menambah pengguna ini.';
    state.users.push(u);
    log(by, 'tambah', 'pengguna', u.id, u.name);
    persist();
    return null;
  }
  const addSpg = (data, by) => addUser({ ...data, role: 'spg' }, by);
  function resetPassword(userId, by) {
    const u = user(userId);
    if (!u || !canManageUser(user(by), u)) return null;
    u.password = DEFAULT_PW[u.role];
    log(by, 'reset password', 'pengguna', u.id, u.name);
    persist();
    return u.password;
  }

  // Products and stores are shared lists. Add: Admin, Supervisor, Team Leader.
  // Edit/deactivate: Admin and Supervisor any item, Team Leader only items they added.
  const canAddCatalog = viewer => !!viewer && ['admin', 'supervisor', 'leader'].includes(viewer.role);
  const canEditCatalog = (viewer, item) => !!viewer && !!item && (viewer.role === 'admin' || viewer.role === 'supervisor' || (viewer.role === 'leader' && item.createdBy === viewer.id));
  function saveCatalogItem(list, kind, prefix, item, by) {
    const viewer = user(by);
    if (item.id) {
      const cur = list.find(x => x.id === item.id);
      if (!canEditCatalog(viewer, cur)) return 'Kamu hanya bisa mengubah ' + kind + ' yang kamu tambahkan.';
      Object.assign(cur, item, { updatedBy: by, updatedAt: TODAY });
      log(by, 'ubah', kind, cur.id, cur.name);
    } else {
      if (!canAddCatalog(viewer)) return 'Kamu tidak punya akses untuk menambah ' + kind + '.';
      const created = { ...item, id: prefix + Date.now().toString(36), createdBy: by, updatedBy: by, updatedAt: TODAY };
      list.push(created);
      log(by, 'tambah', kind, created.id, created.name);
    }
    persist();
    return null;
  }
  const saveProduct = (p, by) => saveCatalogItem(state.products, 'produk', 'p', p, by);
  const saveStore = (st, by) => saveCatalogItem(state.stores, 'toko', 'st', st, by);
  const stores = includeInactive => (state.stores || []).filter(x => includeInactive || x.active);
  const store = id => (state.stores || []).find(x => x.id === id);
  const activity = () => (state.activity || []).slice();

  // Sales per store for a group of SPGs (for dashboards)
  function storeTotals(userIds, from, to) {
    const map = {};
    listReports({ userIds, from, to }).forEach(r => getTransactions(r).forEach(t => {
      const m = map[t.storeId] || (map[t.storeId] = { store: store(t.storeId), amount: 0, tx: 0, spgs: new Set() });
      m.amount += t.qty * t.price; m.tx++; m.spgs.add(r.userId);
    }));
    return Object.values(map).filter(m => m.store).map(m => ({ ...m, spgs: m.spgs.size })).sort((a, b) => b.amount - a.amount);
  }

  function setActive(userId, value) { const u = user(userId); if (u) { u.active = !!value; persist(); } }
  const getSettings = teamId => JSON.parse(JSON.stringify(state.settings[teamId]));
  function saveSettings(teamId, s) { state.settings[teamId] = s; memo = {}; persist(); }

  /* ---------- Live backend (Google Sheets + Apps Script, see apps-script/) ---------- */
  const CACHE_KEY = 'lspg-live-cache';   // last data from the server: pages open at once, also offline
  const OUTBOX_KEY = 'lspg-outbox';      // writes not yet confirmed by the server
  const TOKEN_KEY = 'lspg-token';        // login token (localStorage with "Ingat saya", else this tab only)
  const CACHE_FRESH_MS = 5 * 60 * 1000;  // younger cache: show it at once and refresh in the background
  let lastError = '';
  let writes = 0;                        // local writes since the page opened (see refreshCache)
  const emptyState = () => ({ me: null, areas: [], teams: [], users: [], products: [], stores: [], targets: {}, reports: {}, settings: {}, shifts: {}, activity: [] });
  const notify = msg => { if (window.App && App.toast) App.toast(msg); };
  const siteRoot = () => (document.body && document.body.dataset.root) || '';
  // Page addresses as written in the pages ('spg/laporan.html'); a server with clean URLs can set cleanUrls
  const page = p => (CONFIG.cleanUrls ? p.replace(/(^|\/)index\.html/, '$1').replace(/\.html(?=$|[?#])/, '') : p);

  function getToken() {
    try { return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  const remembered = () => { try { return !!localStorage.getItem(TOKEN_KEY); } catch (e) { return false; } };
  function setToken(token, remember) {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
      if (token) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
    } catch (e) { /* storage blocked */ }
  }

  /**
   * One call to the Apps Script web app; resolves { ok, status, data }. status 0 = no connection.
   * text/plain avoids the CORS preflight Apps Script can't answer; the real status is in the reply body.
   */
  async function call(action, params) {
    let res;
    try {
      res = await fetch(CONFIG.url, {
        method: 'POST', redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action, token: getToken() }, params || {})),
      });
    } catch (e) {
      return { ok: false, status: 0, data: { message: 'Tidak ada koneksi internet.' } };
    }
    let body = null;
    try { body = await res.json(); } catch (e) { /* Google error page instead of JSON */ }
    if (!body) return { ok: false, status: 502, data: { message: 'Server sedang bermasalah, coba lagi.' } };
    return body.ok ? { ok: true, status: 200, data: body.data } : { ok: false, status: body.status || 500, data: { message: body.error } };
  }

  function saveCache(s) {
    lsSet(CACHE_KEY, JSON.stringify(Object.assign({}, s, { _at: s._at || Date.now() })));
  }
  function readCache() {
    try { return JSON.parse(lsGet(CACHE_KEY) || 'null'); } catch (e) { return null; }
  }
  // Fresh data for the next page; skipped if this page wrote something meanwhile (the reply could predate it)
  function refreshCache() {
    const before = writes;
    return call('bootstrap').then(res => {
      if (res.ok && writes === before) saveCache(Object.assign(res.data, { _at: Date.now() }));
      if (res.status === 401) signedOut();
      return res;
    });
  }
  function signedOut() {
    setToken('');
    lsDel(CACHE_KEY);
    location.href = siteRoot() + page('index.html');
  }

  /* Outbox: queued writes are already applied to the page; they are sent in order, retried when offline. */
  const outbox = () => { try { return JSON.parse(lsGet(OUTBOX_KEY) || '[]'); } catch (e) { return []; } };
  const saveOutbox = list => lsSet(OUTBOX_KEY, JSON.stringify(list));
  function enqueue(op, args, action, params) {
    writes++;
    const list = outbox();
    list.push({ id: newId(), me: state.me, op, args, action, params });
    saveOutbox(list);
    flush();
  }
  let flushing = null, retryTimer = null, retryDelay = 2000;
  function flush() {
    if (!flushing) flushing = sendQueued().finally(() => { flushing = null; });
    return flushing;
  }
  async function sendQueued() {
    for (;;) {
      const item = outbox()[0];
      if (!item) { retryDelay = 2000; return; }
      // Left on this phone by someone else who has logged out since: never send it as the current user
      if (item.me !== state.me) { saveOutbox(outbox().filter(x => x.id !== item.id)); continue; }
      const res = await call(item.action, item.params);
      if (res.status === 0 || res.status >= 500 || res.status === 429) {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(flush, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 60000);
        return;
      }
      if (res.status === 401) { signedOut(); return; } // kept until they log in again
      saveOutbox(outbox().filter(x => x.id !== item.id));
      if (!res.ok) notify('Tidak tersimpan: ' + res.data.message);
    }
  }
  if (LIVE) window.addEventListener('online', () => flush());

  // Re-applies queued writes on top of server data (they may not have reached the server yet)
  const REPLAY = {
    startShift: (u, st, t) => startShift(u, st, t),
    switchStore: (u, st, t) => switchStore(u, st, t),
    endShift: (u, by, photos, t) => endShift(u, by, photos, t),
    addSale: (u, d, sale, by) => { if (!getTransactions(getReport(u, d)).some(t => t.id === sale.id)) addSale(u, d, sale, by); },
    removeSale: (u, d, id, by) => removeSale(u, d, id, by),
    setUnlocked: (u, d, v) => setUnlocked(u, d, v),
    saveTargets: (rows, by) => saveTargets(rows, by),
    saveSettings: (teamId, st) => saveSettings(teamId, st),
    setActive: (u, v) => setActive(u, v),
    setUserPhoto: (u, photo) => setUserPhoto(u, photo),
  };
  function useServerState(s) {
    state = Object.assign(emptyState(), s);
    memo = {};
    TODAY = s.today || TODAY;
    DATA_START = s.from || DATA_START;
    outbox().filter(x => x.me === s.me).forEach(x => { try { REPLAY[x.op](...x.args); } catch (e) { /* skip */ } });
  }
  let loading = null;
  async function loadLive() {
    if (!getToken()) { state = emptyState(); return; }
    const cached = readCache();
    // Recent data on this phone: show it now, fetch newer data for the next page in the background
    if (cached && Date.now() - (cached._at || 0) < CACHE_FRESH_MS) {
      useServerState(cached);
      refreshCache();
      flush();
      return;
    }
    const res = await refreshCache();
    if (res.ok) {
      useServerState(res.data);
      flush();
      return;
    }
    if (res.status === 0 && cached) {
      useServerState(cached); // offline: the last data seen on this phone
      setTimeout(() => notify('Offline. Data tersimpan di HP dan dikirim saat online.'), 300);
      return;
    }
    state = emptyState();
  }
  // Pages start with Data.ready(() => { ... }): immediately in the demo, after loading in live mode
  function ready(cb) {
    if (!LIVE) { cb(); return; }
    if (!loading) loading = loadLive();
    loading.then(cb);
  }

  const upsert = (list, item) => { const i = list.findIndex(x => x.id === item.id); if (i >= 0) list[i] = item; else list.push(item); };
  // Awaited writes: change the page's data, keep the cache in step
  const changed = () => { writes++; memo = {}; persist(); };
  const LIVE_API = {
    async login(phone, password, remember) {
      lastError = '';
      const res = await call('login', { phone: normalizePhone(phone), password });
      if (!res.ok) { lastError = res.data.message; return null; }
      setToken(res.data.token, !!remember);
      saveCache(Object.assign(res.data.state, { _at: Date.now() }));
      useServerState(res.data.state);
      return user(state.me) || null;
    },
    async logout() {
      await Promise.race([flush(), new Promise(r => setTimeout(r, 3000))]); // try to send what is still queued
      setToken('');
      lsDel(CACHE_KEY);
      state = emptyState();
    },
    currentUser: () => (state && state.me ? user(state.me) || null : null),
    async changePassword(current, password, confirmation) {
      const res = await call('password.change', { current, password, confirmation });
      if (!res.ok) return res.data.message;
      setToken(res.data.token, remembered()); // the old token stops working
      state.mustChangePassword = false;
      changed();
      return null;
    },

    // Queued writes
    startShift(userId, storeId) {
      const t = nowTime(), sh = startShift(userId, storeId, t);
      enqueue('startShift', [userId, storeId, t], 'shift.start', { storeId, time: t });
      return sh;
    },
    switchStore(userId, storeId) {
      const t = nowTime(), sh = switchStore(userId, storeId, t);
      enqueue('switchStore', [userId, storeId, t], 'shift.switchStore', { storeId, time: t });
      return sh;
    },
    endShift(userId, by, photos) {
      const t = nowTime(), sh = endShift(userId, by, photos, t);
      enqueue('endShift', [userId, by, photos, t], 'shift.end', { time: t, photos });
      return sh;
    },
    addSale(userId, date, sale, by) {
      const tx = addSale(userId, date, sale, by);
      const saved = { id: tx.id, time: tx.time, storeId: tx.storeId, productId: tx.productId, qty: tx.qty, price: tx.price };
      enqueue('addSale', [userId, date, saved, by], 'sale.add',
        { clientId: tx.id, userId, date, productId: tx.productId, qty: tx.qty, price: tx.price, storeId: tx.storeId, time: tx.time || null });
      return tx;
    },
    removeSale(userId, date, txId, by) {
      removeSale(userId, date, txId, by);
      enqueue('removeSale', [userId, date, txId, by], 'sale.remove', { clientId: txId });
    },
    setUnlocked(userId, date, value) {
      setUnlocked(userId, date, value);
      enqueue('setUnlocked', [userId, date, !!value], 'report.unlock', { userId, date, unlocked: !!value });
    },
    saveTargets(rows, by) {
      saveTargets(rows, by);
      const n = v => (v ? Math.round(v) : null);
      enqueue('saveTargets', [rows, by], 'targets.save', { rows: rows.map(r => ({ userId: r.userId, mk: r.mk, monthly: n(r.monthly) || 0, weekly: n(r.weekly), daily: n(r.daily) })) });
    },
    saveSettings(teamId, st) {
      saveSettings(teamId, st);
      enqueue('saveSettings', [teamId, st], 'settings.save', {
        teamId, workingDays: st.workingDays, editDays: st.editDays, reminder: st.reminder,
        holidays: st.holidays.map(h => ({ date: h.date, name: h.name, working: !!h.working })),
      });
    },
    setActive(userId, value) {
      setActive(userId, value);
      enqueue('setActive', [userId, !!value], 'user.setActive', { userId, active: !!value });
    },
    setUserPhoto(userId, photo) {
      setUserPhoto(userId, photo);
      enqueue('setUserPhoto', [userId, photo], 'user.photo', { userId, photo });
    },

    // Writes that wait for the server (they return an error message, or null when saved)
    async addUser(data) {
      const res = await call('user.add', {
        role: data.role, name: data.name, phone: data.phone, teamId: data.teamId || null, newTeam: data.newTeam || null, areaId: data.areaId || null,
      });
      if (!res.ok) return res.data.message;
      const { user: u, team: t, settings: st } = res.data;
      state.users.push(u);
      if (t) upsert(state.teams, t);
      if (t && st) state.settings[t.id] = st;
      changed();
      return null;
    },
    async resetPassword(userId) {
      const res = await call('user.resetPassword', { userId });
      if (!res.ok) { notify(res.data.message); return null; }
      return res.data.password;
    },
    async saveProduct(p) {
      const res = await call('product.save', { id: p.id || null, name: p.name, sku: p.sku || '', price: p.price, active: p.active !== false, image: p.image || null });
      if (!res.ok) return res.data.message;
      upsert(state.products, res.data.product);
      changed();
      return null;
    },
    async saveStore(st) {
      const res = await call('store.save', { id: st.id || null, name: st.name, chain: st.chain || '', city: st.city, address: st.address || '', active: st.active !== false });
      if (!res.ok) return res.data.message;
      upsert(state.stores, res.data.store);
      changed();
      return null;
    },
    reset() { /* demo only */ },
  };
  LIVE_API.addSpg = data => LIVE_API.addUser({ ...data, role: 'spg' });

  function reset() { lsDel(STORE_KEY); lsDel(USER_KEY); }
  // Full demo data (used by tools/export-demo-data.js for the Apps Script importDemoData())
  const exportState = () => JSON.parse(JSON.stringify(state));

  // Load saved demo data, or generate it on first visit (runs last so all helpers above are defined)
  (function load() {
    if (LIVE) { state = emptyState(); return; }
    const raw = lsGet(STORE_KEY);
    if (raw) {
      try { const s = JSON.parse(raw); if (s && s.version === 5) { state = s; return; } } catch (e) { /* reseed */ }
    }
    seed();
    persist();
  })();

  const areas = () => state.areas.slice();

  window.Data = Object.assign({
    get TODAY() { return TODAY; },
    get DATA_START() { return DATA_START; },
    LIVE, CONFIG, LEVELS, ready, page,
    lastError: () => lastError,
    mustChangePassword: () => !!(state && state.mustChangePassword),
    pendingCount: () => (LIVE ? outbox().length : 0),
    changePassword: async () => null,
    parse, addDays, addMonths, monthKey, monthStart, monthEnd, weekStart, weekEnd, eachDay, range,
    login, logout, currentUser,
    user, team, teams, area, spgsOf, products, product, canView,
    isWorkingDay, workingDays, workingDaysInMonth,
    targetRow, dailyTarget, periodTarget, targetPreview, saveTargets,
    getReport, saveReport, setUnlocked, isLocked, canEdit, listReports,
    progress, level, nextLevel, leaderboard, streak, teamSummary, areaSummary, dailySeries, chartRange,
    addSpg, setActive, getSettings, saveSettings, saveProduct, reset,
    getShift, startShift, endShift, switchStore, lastStoreId, storeLabel, storeFor, getTransactions, addSale, removeSale,
    addUser, resetPassword, canManageUser, canAddCatalog, canEditCatalog, saveStore, stores, store, activity, storeTotals,
    allUsers, setUserPhoto, normalizePhone, exportState, areas,
  }, LIVE ? LIVE_API : {});
})();
