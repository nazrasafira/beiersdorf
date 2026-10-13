/* Shared page helpers: login guard, top bar, navigation, formatting. */
(function () {
  'use strict';

  const root = document.body.dataset.root || '';

  // Client logo (Beiersdorf wordmark), see assets/brand/README.md. Until the file is there, only the name shows.
  // Empty = show the generic app mark.
  const BRAND_LOGO = 'assets/brand/beiersdorf-logo.png';
  const logoImg = () => `<img class="brand-logo" src="${root + BRAND_LOGO}" alt="Beiersdorf" onerror="this.remove()">`;

  const ROLE_LABEL = { spg: 'SPG', leader: 'Team Leader', supervisor: 'Supervisor', admin: 'Admin' };
  const HOME = {
    spg: 'spg/beranda.html',
    leader: 'leader/dashboard.html',
    supervisor: 'supervisor/dashboard.html',
    admin: 'admin/pengguna.html',
  };
  const NAV = {
    spg: [['spg/beranda.html', 'home', 'Beranda'], ['spg/laporan.html', 'edit', 'Penjualan'], ['spg/peringkat.html', 'trophy', 'Peringkat'], ['spg/riwayat.html', 'calendar', 'Riwayat']],
    // [href, icon, label, optional folder that also marks the item active]
    leader: [['leader/dashboard.html', 'grid', 'Dashboard'], ['leader/laporan.html', 'file', 'Laporan'], ['leader/target.html', 'target', 'Target'], ['leader/tim.html', 'users', 'Tim'], ['katalog/produk.html', 'box', 'Katalog', 'katalog/'], ['leader/pengaturan.html', 'settings', 'Pengaturan']],
    supervisor: [['supervisor/dashboard.html', 'map', 'Area'], ['leader/laporan.html', 'file', 'Laporan'], ['leader/target.html', 'target', 'Target'], ['leader/tim.html', 'users', 'SPG'], ['katalog/produk.html', 'box', 'Katalog', 'katalog/'], ['leader/pengaturan.html', 'settings', 'Pengaturan']],
    admin: [['admin/pengguna.html', 'users', 'Pengguna'], ['katalog/produk.html', 'box', 'Katalog', 'katalog/']],
  };
  // Server addresses (clean URLs on Laravel)
  const page = Data.page;
  Object.keys(HOME).forEach(r => { HOME[r] = page(HOME[r]); });
  Object.values(NAV).forEach(items => items.forEach(item => { item[0] = page(item[0]); }));

  /* ---------- Icons (Lucide, ISC license — inline SVG, inherit text color) ---------- */
  const ICONS = {
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    edit: '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.7V17c0 .6-.5 1-1 1.2C7.9 18.8 7 20.2 7 22"/><path d="M14 14.7V17c0 .6.5 1 1 1.2 1.1.6 2 2 2 3.8"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    chart: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="M15.5 12.9 17 22l-5-3-5 3 1.5-9.1"/>',
    gem: '<path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    crown: '<path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7Z"/><path d="M5 20h14"/>',
    up: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    down: '<path d="m22 17-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    unlock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    pencil: '<path d="M21.2 6.8a2.8 2.8 0 0 0-4-4L4 16v4h4Z"/><path d="m14.5 5.5 4 4"/>',
    userX: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m17 8 5 5M22 8l-5 5"/>',
    userCheck: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
    minus: '<path d="M5 12h14"/>',
    key: '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
    store: '<path d="M2 7 4.4 2.7A2 2 0 0 1 6.1 2h11.8a2 2 0 0 1 1.7.9L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-2-1 2.7 2.7 0 0 1-2 1 2.7 2.7 0 0 1-2-1 2.7 2.7 0 0 1-2 1 2.7 2.7 0 0 1-2-1 2.7 2.7 0 0 1-2 1 2 2 0 0 1-2-2Z"/>',
    grid: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h8M8 17h5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    settings: '<path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    map: '<path d="M14.1 6.3 9.9 3.6a2 2 0 0 0-1.8 0L3.6 5.8A1 1 0 0 0 3 6.7v13a1 1 0 0 0 1.4.9l3.7-1.9a2 2 0 0 1 1.8 0l4.2 2.7a2 2 0 0 0 1.8 0l4.5-2.2a1 1 0 0 0 .6-.9v-13a1 1 0 0 0-1.4-.9l-3.7 1.9a2 2 0 0 1-1.8 0z"/><path d="M15 5.8v15M9 3.2v15"/>',
    box: '<path d="M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    plus: '<path d="M5 12h14M12 5v14"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    sparkles: '<path d="M9.9 15.5a2 2 0 0 0-1.4-1.4l-6.1-1.6a.5.5 0 0 1 0-1l6.1-1.6a2 2 0 0 0 1.4-1.4l1.6-6.1a.5.5 0 0 1 1 0l1.6 6.1a2 2 0 0 0 1.4 1.4l6.1 1.6a.5.5 0 0 1 0 1l-6.1 1.6a2 2 0 0 0-1.4 1.4l-1.6 6.1a.5.5 0 0 1-1 0Z"/>',
    coffee: '<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><path d="M6 2v2M10 2v2M14 2v2"/>',
  };
  function icon(name, opts) {
    opts = opts || {};
    const style = opts.color ? ` style="color:${opts.color}"` : '';
    return `<svg class="icon${opts.cls ? ' ' + opts.cls : ''}"${style} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
  }
  // Icon-only button/link: the label is the tooltip and the accessible name.
  const iconBtn = (name, label, attrs, cls) =>
    `<button type="button" class="icon-btn${cls ? ' ' + cls : ''}" aria-label="${esc(label)}" title="${esc(label)}" ${attrs || ''}>${icon(name)}</button>`;
  const iconLink = (href, name, label, attrs, cls) =>
    `<a class="icon-btn${cls ? ' ' + cls : ''}" href="${href}" aria-label="${esc(label)}" title="${esc(label)}" ${attrs || ''}>${icon(name)}</a>`;
  const initials = name => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  // Images are stored as a site-relative path or as an uploaded data URL
  const imgSrc = v => (/^(data:|https?:)/.test(v) ? v : root + v);
  // Avatar: the user's photo, or initials when there is none. Accepts a user object or a name.
  function avatar(u, cls) {
    const name = typeof u === 'string' ? u : u && u.name;
    const photo = u && typeof u === 'object' && u.photo;
    return photo
      ? `<img class="avatar${cls ? ' ' + cls : ''}" src="${esc(imgSrc(photo))}" alt="" loading="lazy">`
      : `<span class="avatar${cls ? ' ' + cls : ''}" aria-hidden="true">${esc(initials(name))}</span>`;
  }
  // Name with avatar and an optional second line
  const person = (u, sub, label) => `<div class="person">${avatar(u)}<div><b>${esc(label || (typeof u === 'string' ? u : u.name))}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div></div>`;
  const productSrc = p => imgSrc((p && p.image) || 'assets/products/placeholder.svg');
  const productImg = (p, cls) => `<img class="pimg${cls ? ' ' + cls : ''}" src="${esc(productSrc(p))}" alt="" loading="lazy">`;

  // Photo of a document (the SPG's handwritten sales notes): opens the camera on phones, keeps the
  // page's proportions and shrinks it to at most `maxSide` px, so it stays readable but small to send.
  function pickPhoto(maxSide = 1280) {
    return new Promise(resolve => {
      const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
      input.setAttribute('capture', 'environment');
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) return resolve(null);
        const img = new Image();
        img.onload = () => {
          const k = Math.min(1, maxSide / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          const g = c.getContext('2d');
          g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
          g.drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(img.src);
          resolve(c.toDataURL('image/jpeg', 0.72));
        };
        img.onerror = () => resolve(null);
        img.src = URL.createObjectURL(file);
      });
      input.click();
    });
  }
  // Thumbnails of the notes photos of a shift; a click opens the photo large (viewPhoto)
  const notePhotos = photos => `<div class="note-photos">${photos.map((p, i) =>
    `<button type="button" class="note-photo" data-view-photo="${esc(imgSrc(p))}" aria-label="Lihat foto catatan ${i + 1}"><img src="${esc(imgSrc(p))}" alt="" loading="lazy"></button>`).join('')}</div>`;
  function viewPhoto(src) {
    const dlg = document.createElement('dialog');
    dlg.className = 'modal photo-view';
    dlg.innerHTML = `<div class="modal-head"><h3>Foto catatan</h3><button type="button" class="icon-btn" data-close aria-label="Tutup">${icon('x')}</button></div>
      <div class="modal-body"><a href="${esc(src)}" target="_blank" rel="noopener"><img src="${esc(src)}" alt="Foto catatan penjualan"></a></div>`;
    document.body.append(dlg);
    modal(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.showModal();
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-view-photo]');
    if (b) viewPhoto(b.dataset.viewPhoto);
  });

  // Let the user pick a photo (camera or gallery), then crop/resize it in the browser.
  // mode 'cover' = square crop (profile photos), 'contain' = fit on white (product photos).
  function pickImage(mode, size) {
    return new Promise(resolve => {
      const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) return resolve(null);
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = c.height = size;
          const g = c.getContext('2d');
          g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
          const k = mode === 'cover' ? Math.max(size / img.width, size / img.height) : Math.min(size / img.width, size / img.height);
          const w = img.width * k, h = img.height * k;
          g.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
          URL.revokeObjectURL(img.src);
          resolve(c.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => resolve(null);
        img.src = URL.createObjectURL(file);
      });
      input.click();
    });
  }
  // Top-3 podium with faces (order 2-1-3). rows: [{ user, pct, rank }], sub: optional line under the name
  function podium(rows, meId, sub) {
    const top = rows.slice(0, 3);
    return [top[1], top[0], top[2]].filter(Boolean).map(r => `
      <div class="p p${r.rank}${r.user.id === meId ? ' me' : ''}">
        <div class="face">${avatar(r.user)}${rankBadge(r.rank)}</div>
        <div class="n">${esc(r.user.name.split(' ')[0])}</div>
        <div class="s">${esc(sub ? sub(r) : Data.storeLabel(r.user))}</div>
        <div class="v">${pct(r.pct)}</div>
      </div>`).join('');
  }
  const rankBadge = n => `<span class="rank-badge${n <= 3 ? ' r' + n : ''}">${n}</span>`;
  const levelIcon = (lv, cls) => icon(lv.icon, { color: lv.iconColor, cls });
  const levelBadge = lv => `<span class="lvl">${levelIcon(lv)}${lv.name}</span>`;

  /* ---------- Formatting ---------- */
  const nf = new Intl.NumberFormat('id-ID');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = n => nf.format(Math.round(n || 0));
  const rp = n => 'Rp ' + num(n);
  const rpK = n => rp(Math.round((n || 0) / 1000) * 1000); // targets rounded to the nearest thousand
  function rpShort(n) {
    if (n >= 1e9) return 'Rp ' + (n / 1e9).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' M';
    if (n >= 1e6) return 'Rp ' + (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
    return rp(n);
  }
  const pct = p => Math.round(p || 0) + '%';
  // 081300000001 → 0813 0000 0001
  const phoneFmt = v => { const d = Data.normalizePhone(v); return d ? d.replace(/^(\d{4})(\d{4})(\d+)$/, '$1 $2 $3') : ''; };
  const pct1 = p => (p || 0).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  const fmt = opts => { const f = new Intl.DateTimeFormat('id-ID', opts); return s => f.format(Data.parse(s)); };
  const dateLong = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dateShort = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
  const dateMid = fmt({ day: 'numeric', month: 'short', year: 'numeric' });
  const monthName = mk => fmt({ month: 'long', year: 'numeric' })(mk + '-01');
  const param = name => new URLSearchParams(location.search).get(name);
  const parseNum = s => +String(s || '').replace(/\D/g, '') || 0;

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  /* ---------- Team for leader / supervisor pages ---------- */
  function teamId(user) {
    if (user.role === 'leader') return user.teamId;
    const list = Data.teams();
    let id = param('tim') || lsGet('lspg-team') || list[0].id;
    if (!list.some(t => t.id === id)) id = list[0].id;
    lsSet('lspg-team', id);
    return id;
  }

  /* ---------- Page chrome ---------- */
  function init(opts) {
    const user = Data.currentUser();
    // Not logged in, wrong role, or a new password must be chosen first (on the login page)
    if (!user || (opts.roles && !opts.roles.includes(user.role)) || Data.mustChangePassword()) {
      location.replace(root + Data.page('index.html'));
      return null;
    }
    const here = location.pathname;
    const isOn = (href, folder) => here.endsWith('/' + href) || (!!folder && here.includes('/' + folder));
    const top = document.createElement('header');
    top.className = 'topbar';
    top.innerHTML = `
      <div class="topbar-inner">
        <a class="brand" href="${root + HOME[user.role]}">${BRAND_LOGO ? logoImg() : `<span class="brand-mark">${icon('chart')}</span>`}</a>
        ${user.role === 'spg' ? '' : `<nav class="mainnav" id="mainnav" aria-label="Menu utama">${NAV[user.role].map(([href, ic, label, folder]) =>
          `<a href="${root + href}" class="${isOn(href, folder) ? 'on' : ''}" ${isOn(href, folder) ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></a>`).join('')}</nav>`}
        <div class="user">
          ${avatar(user, 'sm')}
          <span class="name"><b>${esc(user.name)}</b><small>${ROLE_LABEL[user.role]}</small></span>
          <button class="logout icon-btn" type="button" aria-label="Keluar" title="Keluar">${icon('logout')}</button>
          ${user.role === 'spg' ? '' : `<button class="icon-btn menu-btn" type="button" aria-label="Menu" aria-expanded="false" aria-controls="mainnav">${icon('menu')}</button>`}
        </div>
      </div>`;
    // Static markup can ask for an icon with data-icon="name"
    document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); if (!el.title) el.title = el.getAttribute('aria-label') || ''; });
    top.querySelector('.logout').addEventListener('click', async e => {
      if (Data.pendingCount() && !confirm('Ada data yang belum terkirim (offline). Keluar sekarang? Data akan dikirim saat kamu login lagi.')) return;
      e.currentTarget.disabled = true;
      await Data.logout();
      location.href = root + Data.page('index.html');
    });
    document.body.prepend(top);

    const items = NAV[user.role];
    if (user.role === 'spg') {
      document.body.classList.add('spg');
      const nav = document.createElement('nav');
      nav.className = 'bottomnav';
      nav.innerHTML = items.map(([href, ic, label]) =>
        `<a href="${root + href}" class="${isOn(href) ? 'on' : ''}" ${isOn(href) ? 'aria-current="page"' : ''}>${icon(ic, { cls: 'ic' })}${label}</a>`).join('');
      document.body.append(nav);
    } else {
      // Phone: the navbar links fold into a dropdown behind the menu button
      const btn = top.querySelector('.menu-btn'), nav = top.querySelector('.mainnav');
      const setOpen = open => { nav.classList.toggle('open', open); btn.setAttribute('aria-expanded', open); };
      btn.addEventListener('click', e => { e.stopPropagation(); setOpen(!nav.classList.contains('open')); });
      document.addEventListener('click', e => { if (!nav.contains(e.target)) setOpen(false); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
    }

    if (opts.teamPicker && user.role === 'supervisor') {
      const current = teamId(user);
      const box = document.createElement('div');
      box.className = 'team-pick';
      box.innerHTML = `<label for="teamPick">Lihat tim</label>
        <select id="teamPick" class="input">${Data.teams().map(x =>
          `<option value="${x.id}" ${x.id === current ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`;
      box.querySelector('select').addEventListener('change', e => {
        lsSet('lspg-team', e.target.value);
        location.search = '?tim=' + e.target.value;
      });
      document.querySelector('main').prepend(box);
      combobox(box.querySelector('select'));
    }
    return user;
  }

  /* ---------- Searchable dropdown ----------
   * Enhances a native <select>: the select stays in the DOM (hidden) and keeps the value,
   * so existing code reading select.value / listening to 'change' keeps working. */
  let comboSeq = 0;
  function combobox(select) {
    if (!select || select._combo) return;
    const id = 'combo-' + (++comboSeq);
    const wrap = document.createElement('div');
    wrap.className = 'combo';
    wrap.innerHTML = `<input class="input combo-input" type="text" id="${id}" role="combobox" aria-expanded="false" aria-controls="${id}-list" aria-autocomplete="list" autocomplete="off" spellcheck="false">
      <ul class="combo-list" id="${id}-list" role="listbox" hidden></ul>`;
    const input = wrap.querySelector('input'), list = wrap.querySelector('ul');
    const label = select.id && document.querySelector(`label[for="${select.id}"]`);
    if (label) label.htmlFor = id; else if (select.getAttribute('aria-label')) input.setAttribute('aria-label', select.getAttribute('aria-label'));
    select.hidden = true;
    select.after(wrap);

    let items = [], active = -1;
    const ph = select.dataset.placeholder; // optional: empty value shows as a placeholder and is not listed
    const options = () => [...select.options].filter(o => !(ph && o.value === '')).map(o => ({ value: o.value, text: o.textContent.trim(), img: o.dataset.img }));
    const sync = () => {
      const o = select.options[select.selectedIndex];
      input.value = o && !(ph && o.value === '') ? o.textContent.trim() : '';
      if (ph) input.placeholder = ph;
      input.disabled = select.disabled;
    };
    const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); sync(); };
    function render(q) {
      const needle = q.trim().toLowerCase();
      items = options().filter(o => !needle || o.text.toLowerCase().includes(needle));
      active = Math.max(0, items.findIndex(o => o.value === select.value));
      list.innerHTML = items.length
        ? items.map((o, i) => `<li role="option" id="${id}-${i}" data-i="${i}" aria-selected="${o.value === select.value}" class="${i === active ? 'active' : ''}">${o.img ? `<img src="${esc(o.img)}" alt="">` : ''}<span>${esc(o.text)}</span></li>`).join('')
        : '<li class="none">Tidak ditemukan</li>';
      highlight();
    }
    function highlight() {
      list.querySelectorAll('li[data-i]').forEach(li => li.classList.toggle('active', +li.dataset.i === active));
      const el = list.querySelector(`li[data-i="${active}"]`);
      if (el) { input.setAttribute('aria-activedescendant', el.id); el.scrollIntoView({ block: 'nearest' }); }
    }
    function open() {
      if (select.disabled) return;
      render('');
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      input.select();
    }
    function choose(i) {
      const o = items[i];
      if (!o) return;
      const changed = select.value !== o.value;
      select.value = o.value;
      close();
      if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    input.addEventListener('focus', open);
    input.addEventListener('click', () => { if (list.hidden) open(); });
    input.addEventListener('input', () => { if (list.hidden) { list.hidden = false; input.setAttribute('aria-expanded', 'true'); } render(input.value); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (list.hidden) return open();
        active = Math.min(Math.max(active + (e.key === 'ArrowDown' ? 1 : -1), 0), items.length - 1);
        highlight();
      } else if (e.key === 'Enter') {
        if (!list.hidden) { e.preventDefault(); choose(active); }
      } else if (e.key === 'Escape') {
        close(); input.blur();
      } else if (e.key === 'Tab') {
        close();
      }
    });
    input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) close(); }, 120));
    list.addEventListener('mousedown', e => e.preventDefault()); // keep focus in the input
    list.addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (li) choose(+li.dataset.i); });
    select.addEventListener('change', sync);
    new MutationObserver(sync).observe(select, { attributes: true, attributeFilter: ['disabled'] });

    select._combo = { sync, focus: () => input.focus() };
    sync();
  }
  const enhanceSelects = (scope) => (scope || document).querySelectorAll('select').forEach(combobox);

  /* ---------- Table search + pagination ----------
   * Call after every (re)render of a table: App.tableTools(tableEl, { placeholder, pageSize }).
   * Controls are created once per table and keep their search text and page across re-renders.
   * Rows with class "detail" belong to the row above them and follow its visibility. */
  function tableTools(table, opts) {
    if (!table) return;
    opts = opts || {};
    const size = opts.pageSize || 10;
    const minRows = opts.minRows == null ? 6 : opts.minRows; // smaller tables get no controls
    let st = table._tt;
    if (!st) {
      const anchor = table.closest('.table-wrap') || table;
      st = table._tt = { q: '', page: 1 };
      st.bar = document.createElement('div');
      st.bar.className = 'tt-bar';
      const ph = opts.placeholder || 'Cari...';
      st.bar.innerHTML = `<label class="tt-search">${icon('search')}<input type="search" class="input" placeholder="${esc(ph)}" aria-label="${esc(ph)}" autocomplete="off"></label>`;
      st.pager = document.createElement('div');
      st.pager.className = 'tt-pager';
      anchor.before(st.bar);
      anchor.after(st.pager);
      st.input = st.bar.querySelector('input');
      st.input.addEventListener('input', () => { st.q = st.input.value; st.page = 1; apply(); });
      st.pager.addEventListener('click', e => {
        const b = e.target.closest('[data-pg]');
        if (b && !b.disabled) { st.page += +b.dataset.pg; apply(); }
      });
    }
    function apply() {
      const body = table.tBodies[0];
      if (!body) return;
      const old = body.querySelector('tr.tt-none');
      if (old) old.remove();
      const rows = [...body.rows].filter(r => !r.classList.contains('detail') && !r.querySelector('td.empty'));
      const needle = st.q.trim().toLowerCase();
      const match = rows.filter(r => !needle || r.textContent.toLowerCase().includes(needle));
      const pages = Math.max(1, Math.ceil(match.length / size));
      st.page = Math.min(Math.max(1, st.page), pages);
      const from = (st.page - 1) * size;
      const shown = new Set(match.slice(from, from + size));
      rows.forEach(r => {
        const on = shown.has(r);
        r.classList.toggle('tt-hide', !on);
        for (let n = r.nextElementSibling; n && n.classList.contains('detail'); n = n.nextElementSibling) n.classList.toggle('tt-hide', !on);
      });
      if (rows.length && !match.length) {
        const cols = (table.tHead && table.tHead.rows[0] && table.tHead.rows[0].cells.length) || 1;
        body.insertAdjacentHTML('beforeend', `<tr class="tt-none"><td colspan="${cols}" class="empty">Tidak ditemukan</td></tr>`);
      }
      st.bar.hidden = rows.length < minRows && !needle;
      st.pager.hidden = match.length <= size;
      st.pager.innerHTML = `<span class="small muted">${from + 1}–${Math.min(from + size, match.length)} dari ${match.length}</span>
        <span class="icon-group">${iconBtn('left', 'Halaman sebelumnya', `data-pg="-1"${st.page <= 1 ? ' disabled' : ''}`)}<span class="small tt-page">${st.page} / ${pages}</span>${iconBtn('right', 'Halaman berikutnya', `data-pg="1"${st.page >= pages ? ' disabled' : ''}`)}</span>`;
    }
    apply();
  }

  /* ---------- Pop-up form (native <dialog>) ----------
   * Closes with [data-close] buttons, Esc, or a click on the backdrop. */
  function modal(dlg) {
    if (!dlg._modal) {
      dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
      dlg._modal = {
        open() { dlg.showModal(); const f = dlg.querySelector('input:not([type=hidden]):not([type=checkbox]), select'); if (f) f.focus(); },
        close() { dlg.close(); },
      };
    }
    return dlg._modal;
  }

  /* ---------- Store picker (start shift / switch store) ----------
   * Resolves with the chosen store id, or null when cancelled. */
  function pickStore(opts) {
    opts = opts || {};
    return new Promise(resolve => {
      const dlg = document.createElement('dialog');
      dlg.className = 'modal';
      dlg.setAttribute('aria-labelledby', 'pickStoreTitle');
      const list = Data.stores();
      dlg.innerHTML = `<form method="dialog" id="pickStoreForm">
        <div class="modal-head"><h3 id="pickStoreTitle">${esc(opts.title || 'Pilih toko')}</h3><button type="button" class="icon-btn" data-close aria-label="Tutup">${icon('x')}</button></div>
        <div class="modal-body">
          <div class="field"><label for="pickStoreSel">Toko</label>
            <select id="pickStoreSel" data-placeholder="Cari toko...">${'<option value=""></option>' + list.map(st =>
              `<option value="${st.id}" ${st.id === opts.current ? 'selected' : ''}>${esc(st.name)} · ${esc(st.city)}</option>`).join('')}</select>
          </div>
          ${opts.note ? `<p class="note" style="margin:0">${esc(opts.note)}</p>` : ''}
        </div>
        <div class="modal-foot"><button type="button" class="btn ghost" data-close>Batal</button><button class="btn" type="submit">${esc(opts.action || 'Pilih')}</button></div>
      </form>`;
      document.body.append(dlg);
      let result = null;
      dlg.querySelector('form').addEventListener('submit', e => {
        e.preventDefault();
        const v = dlg.querySelector('select').value;
        if (!v) { toast('Pilih toko dulu.'); return; }
        result = v;
        dlg.close();
      });
      dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
      modal(dlg);
      combobox(dlg.querySelector('select'));
      dlg.showModal();
      if (!opts.current) dlg.querySelector('.combo-input').focus();
    });
  }

  function toast(msg) {
    let el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2400);
  }

  // Disables the form's submit button while a save is running (it may wait for the server)
  async function busy(form, fn) {
    const btn = form.querySelector('[type=submit]');
    if (btn) btn.disabled = true;
    try { return await fn(); } finally { if (btn) btn.disabled = false; }
  }

  /* ---------- Big progress ring (SVG) ---------- */
  // Single-color ring: blue until the target is reached, then green.
  function ring(p, centerHtml, label) {
    const r = 96, c = 2 * Math.PI * r;
    const frac = Math.min(Math.max(p, 0), 100) / 100;
    const color = p >= 100 ? '#15803D' : '#00136F';
    return `<div class="ring" role="img" aria-label="${esc(label || pct(p))}">
      <svg viewBox="0 0 220 220" aria-hidden="true">
        <circle cx="110" cy="110" r="${r}" stroke="#F1F3F6" stroke-width="12" fill="none"/>
        ${frac > 0 ? `<circle class="arc" cx="110" cy="110" r="${r}" stroke="${color}" stroke-width="12" stroke-dasharray="${c}" stroke-dashoffset="${c}" data-off="${c * (1 - frac)}"/>` : ''}
      </svg>
      <div class="center">${centerHtml}</div>
    </div>`;
  }
  function animateRings() {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.querySelectorAll('.ring .arc').forEach(a => { a.style.strokeDashoffset = a.dataset.off; });
    }));
  }

  function bar(p) {
    return `<div class="bar${p >= 100 ? ' done' : ''}"><span style="width:${Math.min(Math.max(p, 0), 100)}%"></span></div>`;
  }

  /* ---------- Sales trend chart: one bar per day + dashed daily-target line ---------- */
  function trendChart(el, series) {
    if (!series.length) { el.innerHTML = '<p class="empty">Belum ada data.</p>'; return; }
    // Draw at the real width so labels stay readable on phones; redraw when the width changes.
    if (!el._chartResize) {
      let t;
      el._chartResize = () => { clearTimeout(t); t = setTimeout(() => { if (el.clientWidth !== el._chartW) trendChart(el, el._series); }, 150); };
      window.addEventListener('resize', el._chartResize);
    }
    el._series = series;
    const W = el._chartW = Math.max(280, Math.round(el.clientWidth || 640));
    const H = W < 500 ? 180 : 220, L = 40, R = 4, T = 10, B = 24;
    const max = Math.max(...series.map(p => Math.max(p.actual, p.target))) * 1.1 || 1;
    const step = niceStep(max / 3);
    const top = Math.ceil(max / step) * step;
    const y = v => T + (H - T - B) * (1 - v / top);
    const slot = (W - L - R) / series.length;
    const bw = Math.max(2, Math.min(28, slot - 2)); // 2px gap between bars
    const unit = top >= 1e9 ? [1e9, ' M'] : [1e6, ' jt'];
    const tick = v => (v / unit[0]).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + (v ? unit[1] : '');
    const every = Math.ceil(series.length / Math.max(4, Math.floor(W / 70)));

    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik penjualan harian">`;
    for (let v = 0; v <= top; v += step) {
      s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#F1F3F6"/>`;
      s += `<text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" class="tick">${tick(v)}</text>`;
    }
    series.forEach((p, i) => {
      const x = L + i * slot + (slot - bw) / 2, h = y(0) - y(p.actual), r = Math.min(4, bw / 2, h);
      if (h > 0) s += `<path d="M${x},${y(0)} V${y(p.actual) + r} q0,-${r} ${r},-${r} H${x + bw - r} q${r},0 ${r},${r} V${y(0)} Z" fill="#00136F"/>`;
      if (i % every === 0 || i === series.length - 1) s += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" class="tick">${+p.date.slice(8)}</text>`;
      s += `<rect class="hit" x="${L + i * slot}" y="${T}" width="${slot}" height="${H - T - B}" fill="transparent" data-i="${i}"/>`;
    });
    // Target line: steps per day (targets can differ by day)
    const path = series.map((p, i) => `${i ? 'L' : 'M'}${L + i * slot},${y(p.target)} H${L + (i + 1) * slot}`).join(' ');
    if (series.some(p => p.target > 0)) s += `<path d="${path}" fill="none" stroke="#6B7280" stroke-width="1.5" stroke-dasharray="4 4"/>`;
    s += '</svg>';
    el.innerHTML = `<div class="chart">${s}<div class="tip" hidden></div></div>`;

    const tip = el.querySelector('.tip'), svg = el.querySelector('svg');
    el.querySelectorAll('.hit').forEach(h => {
      const show = () => {
        const p = series[+h.dataset.i];
        tip.innerHTML = `<b>${dateShort(p.date)}</b><br>${rp(p.actual)}${p.target > 0 ? `<br><span>Target ${rpK(p.target)}</span>` : ''}`;
        tip.hidden = false;
        const box = svg.getBoundingClientRect(), hb = h.getBoundingClientRect();
        const left = hb.left - box.left + hb.width / 2;
        tip.style.left = Math.min(Math.max(left, 60), box.width - 60) + 'px';
      };
      h.addEventListener('mouseenter', show);
      h.addEventListener('click', show);
    });
    svg.addEventListener('mouseleave', () => { tip.hidden = true; });
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }

  function downloadCsv(filename, rows) {
    const csv = rows.map(r => r.map(v => {
      const s = String(v == null ? '' : v);
      return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.App = {
    root, HOME, ROLE_LABEL, page, init, teamId, toast, busy, modal, pickStore, tableTools, combobox, enhanceSelects, ring, animateRings, bar, trendChart, downloadCsv, icon, iconBtn, iconLink, avatar, person, rankBadge, podium, productImg, productSrc, pickImage, pickPhoto, notePhotos, viewPhoto, imgSrc, levelIcon, levelBadge,
    esc, num, rp, rpK, phoneFmt, rpShort, pct, pct1, dateLong, dateShort, dateMid, monthName, param, parseNum,
    home: user => root + HOME[user.role],
    BRAND_LOGO, logoImg,
  };
})();
