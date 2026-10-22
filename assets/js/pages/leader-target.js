Data.ready(function () {
  'use strict';
  const user = App.init({ roles: ['leader', 'supervisor'], teamPicker: true });
  if (!user) return;
  const D = Data, $ = id => document.getElementById(id);
  const teamId = App.teamId(user);
  let mk = App.param('bulan') || D.monthKey(D.TODAY);
  if (!/^\d{4}-\d{2}$/.test(mk)) mk = D.monthKey(D.TODAY);

  const place = st => [st.chain, st.city].filter(Boolean).join(' · ');
  const photo = u => App.imgSrc((u && u.photo) || 'assets/avatars/default.svg');

  // Who holds a store in a month. "taken" = an active SPG of another team (can't be given out from here).
  function holderOf(storeId, month) {
    const t = D.storeTarget(storeId, month);
    const holder = t && t.userId ? D.user(t.userId) : null;
    const taken = !!t && (!!t.taken || (!!holder && holder.teamId !== teamId && holder.active));
    return { t: t && t.userId ? t : null, holder, taken, mine: !!holder && holder.teamId === teamId };
  }
  // Stores nobody in this team holds and no other team has taken (the inactive stores are left out)
  const freeStores = month => D.stores().filter(st => { const h = holderOf(st.id, month); return !h.mine && !h.taken; })
    .sort((a, b) => a.name.localeCompare(b.name));
  // Team SPGs to show: the active ones, plus deactivated ones that still hold a store this month
  const teamSpgs = () => D.spgsOf(teamId, true).filter(u => u.active || D.heldStores(u.id, mk).length)
    .sort((a, b) => b.active - a.active || a.name.localeCompare(b.name));

  /* ---------- Page ---------- */
  function render() {
    $('month').textContent = App.monthName(mk);
    $('sub').textContent = `Tim ${D.team(teamId).name} · target harian dihitung dari jadwal kerja tiap SPG`;

    const spgs = teamSpgs();
    const held = spgs.map(u => ({ u, stores: D.heldStores(u.id, mk).map(t => ({ ...t, st: D.store(t.storeId) || { id: t.storeId, name: t.storeId } })) }));
    const free = freeStores(mk);
    const total = held.reduce((a, h) => a + h.stores.reduce((b, t) => b + (t.monthly || 0), 0), 0);
    const nHeld = held.reduce((a, h) => a + h.stores.length, 0);
    const noStore = held.filter(h => h.u.active && !h.stores.length).length;

    $('summary').innerHTML = `
      <div class="stat-box"><div class="l">Target tim</div><div class="v">${App.rpShort(total)}</div>
        <div class="s">${held.length ? '≈ ' + App.rpShort(held.reduce((a, h) => a + D.dailyTarget(h.u.id, firstWorkingDay(h.u.id)), 0)) + ' per hari (sesuai jadwal SPG)' : 'Belum ada SPG'}</div></div>
      <div class="stat-box"><div class="l">Toko dipegang</div><div class="v">${nHeld} <span class="small muted">/ ${nHeld + free.length}</span></div>
        <div class="s">${noStore ? `${noStore} SPG belum punya toko` : spgs.length ? 'Semua SPG punya toko' : 'Belum ada SPG'}</div></div>`;

    $('spgs').innerHTML = held.map(({ u, stores }) => {
      const sum = stores.reduce((a, t) => a + (t.monthly || 0), 0);
      const daily = D.dailyTarget(u.id, firstWorkingDay(u.id)) || 0;
      return `<div class="tg-spg">
        <div class="tg-spg-head">
          ${App.person(u, u.active ? `${stores.length} toko · ${D.scheduleLabel(u.id)}` : 'nonaktif · pindahkan tokonya', u.name)}
          <div class="total"><b>${stores.length ? App.rpShort(sum) : '–'}</b>${stores.length && daily ? `<small>${App.rpShort(daily)}/hari</small>` : ''}</div>
        </div>
        ${stores.length ? `<div class="tg-stores">${stores.sort((a, b) => a.st.name.localeCompare(b.st.name)).map(t => `
          <button type="button" class="tg-store" data-store="${t.storeId}">
            ${App.icon('store')}
            <span class="grow"><b>${App.esc(t.st.name)}</b>${place(t.st) ? `<small>${App.esc(place(t.st))}</small>` : ''}</span>
            <span class="amt ${t.monthly ? '' : 'zero'}">${t.monthly ? App.rpShort(t.monthly) : 'Isi target'}</span>
            ${App.icon('right')}
          </button>`).join('')}</div>` : '<p class="tg-empty">Belum ada toko.</p>'}
        ${u.active ? `<div class="tg-foot"><button type="button" class="btn ghost block" data-add="${u.id}">${App.icon('plus')}Tambah toko</button></div>` : ''}
      </div>`;
    }).join('') || '<p class="empty">Belum ada SPG di tim ini. Tambahkan di menu Tim.</p>';

    $('freeTitle').textContent = `Toko tanpa SPG (${free.length})`;
    $('freeSearchWrap').hidden = free.length < 7;
    $('free').innerHTML = free.map(st => `
      <button type="button" class="tg-store" data-store="${st.id}" data-name="${App.esc((st.name + ' ' + place(st)).toLowerCase())}">
        ${App.icon('store')}
        <span class="grow"><b>${App.esc(st.name)}</b>${place(st) ? `<small>${App.esc(place(st))}</small>` : ''}</span>
        <span class="btn small">Pilih SPG</span>
      </button>`).join('') || '<p class="tg-empty" style="padding:12px 14px">Semua toko sudah punya SPG.</p>';
    filterFree();

    // Stores of other teams: read only
    const taken = D.stores().filter(st => holderOf(st.id, mk).taken).sort((a, b) => a.name.localeCompare(b.name));
    $('takenWrap').hidden = !taken.length;
    $('takenSum').textContent = `Dipegang tim lain (${taken.length})`;
    $('taken').innerHTML = taken.map(st => {
      const h = holderOf(st.id, mk).holder;
      return `<div><div class="grow"><b>${App.esc(st.name)}</b><span>${App.esc(place(st))}</span></div>
        <span class="small muted">${h ? `${App.esc(h.name)} · Tim ${App.esc((D.team(h.teamId) || {}).name || '')}` : 'SPG tim lain'}</span></div>`;
    }).join('');
  }
  const firstWorkingDay = userId => D.eachDay(mk + '-01', D.monthEnd(mk + '-01')).find(d => D.isWorkingDayFor(userId, d)) || mk + '-01';

  function filterFree() {
    const q = $('freeSearch').value.trim().toLowerCase();
    $('free').querySelectorAll('[data-name]').forEach(b => { b.hidden = !!q && !b.dataset.name.includes(q); });
  }
  $('freeSearch').addEventListener('input', filterFree);

  $('prev').addEventListener('click', () => { mk = D.addMonths(mk, -1); render(); });
  $('next').addEventListener('click', () => { mk = D.addMonths(mk, 1); render(); });

  /* ---------- Sheet: give a store to an SPG and set its target ---------- */
  const dlg = App.modal($('sheet'));
  const form = $('sheetForm');
  ['sheetMonthly', 'sheetWeekly', 'sheetDaily'].forEach(id => App.moneyInput($(id)));
  App.combobox($('sheetStore'));
  App.combobox($('sheetSpg'));
  let editing = null; // store id when the sheet opened on one store

  function updateHint() {
    const monthly = App.parseNum($('sheetMonthly').value);
    const spg = $('sheetSpg').value || null; // the chosen SPG's own working days
    const p = D.targetPreview(teamId, mk, monthly, spg);
    const who = spg ? ' ' + D.user(spg).name.split(' ')[0] : ' tim';
    $('sheetHint').textContent = monthly && p.workDays
      ? `≈ ${App.rpK(p.daily)} per hari · ${App.rpK(p.weekly)} per minggu (${p.workDays} hari kerja${who} di ${App.monthName(mk)})`
      : `${p.workDays} hari kerja${who} di ${App.monthName(mk)}.`;
  }
  $('sheetMonthly').addEventListener('input', updateHint);
  $('sheetSpg').addEventListener('change', updateHint);

  function openSheet({ storeId, userId }) {
    editing = storeId || null;
    const h = storeId ? holderOf(storeId, mk) : { t: null, holder: null, mine: false };
    const st = storeId && D.store(storeId);
    $('sheetTitle').textContent = st ? st.name : 'Tambah toko';
    $('storeField').hidden = !!storeId;
    $('sheetStore').innerHTML = '<option value=""></option>' + (storeId ? '' : freeStores(mk).map(s =>
      `<option value="${s.id}">${App.esc(s.name)}${place(s) ? ' · ' + App.esc(place(s)) : ''}</option>`).join(''));
    $('sheetStore')._combo.sync();
    const opts = D.spgsOf(teamId);
    if (h.mine && !opts.includes(h.holder)) opts.push(h.holder);
    const chosen = userId || (h.mine ? h.holder.id : '');
    $('sheetSpg').innerHTML = '<option value=""></option>' + opts.map(u =>
      `<option value="${u.id}" data-img="${App.esc(photo(u))}" ${u.id === chosen ? 'selected' : ''}>${App.esc(u.name)}${u.active ? '' : ' (nonaktif)'}</option>`).join('');
    $('sheetSpg')._combo.sync();
    const t = h.mine ? h.t : null;
    App.setMoney($('sheetMonthly'), t ? t.monthly : 0);
    App.setMoney($('sheetWeekly'), t ? t.weekly : 0);
    App.setMoney($('sheetDaily'), t ? t.daily : 0);
    $('manual').open = !!(t && (t.weekly || t.daily));
    $('release').hidden = !h.mine;
    updateHint();
    dlg.open();
    // Adding: start in the store search. Editing: no keyboard until a field is tapped.
    if (storeId) document.activeElement.blur(); else $('sheetStore')._combo.focus();
  }

  $('spgs').addEventListener('click', e => {
    const s = e.target.closest('[data-store]'), a = e.target.closest('[data-add]');
    if (s) openSheet({ storeId: s.dataset.store });
    else if (a) {
      if (!freeStores(mk).length) { App.toast('Semua toko sudah punya SPG. Pindahkan toko dari SPG lain.'); return; }
      openSheet({ userId: a.dataset.add });
    }
  });
  $('free').addEventListener('click', e => { const s = e.target.closest('[data-store]'); if (s) openSheet({ storeId: s.dataset.store }); });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const storeId = editing || $('sheetStore').value;
    const userId = $('sheetSpg').value;
    if (!storeId) { App.toast('Pilih toko dulu.'); $('sheetStore')._combo.focus(); return; }
    if (!userId) { App.toast('Pilih SPG dulu.'); $('sheetSpg')._combo.focus(); return; }
    const monthly = App.parseNum($('sheetMonthly').value);
    D.saveTargets([{ storeId, mk, userId, monthly, weekly: App.parseNum($('sheetWeekly').value), daily: App.parseNum($('sheetDaily').value) }], user.id);
    dlg.close();
    App.toast(`${D.store(storeId).name} → ${D.user(userId).name.split(' ')[0]}${monthly ? ' · ' + App.rpShort(monthly) : ''}`);
    render();
  });

  $('release').addEventListener('click', async () => {
    const st = D.store(editing);
    if (!await App.confirm(`${st.name} jadi tanpa SPG untuk ${App.monthName(mk)} dan targetnya dihapus.`, { title: 'Lepas toko?', ok: 'Lepas toko', danger: true })) return;
    D.saveTargets([{ storeId: editing, mk, userId: null }], user.id);
    dlg.close();
    App.toast(st.name + ' sekarang tanpa SPG.');
    render();
  });

  /* ---------- Copy last month: SPGs and targets of stores not set yet this month ---------- */
  $('copyPrev').addEventListener('click', async () => {
    const prev = D.addMonths(mk, -1);
    const rows = [];
    D.stores(true).forEach(st => {
      const was = holderOf(st.id, prev), now = holderOf(st.id, mk);
      if (!was.mine || !was.holder.active || now.mine || now.taken) return;
      rows.push({ storeId: st.id, mk, userId: was.holder.id, monthly: was.t.monthly || 0, weekly: was.t.weekly || 0, daily: was.t.daily || 0 });
    });
    if (!rows.length) { App.toast(`Tidak ada yang bisa disalin dari ${App.monthName(prev)}.`); return; }
    if (!await App.confirm(`${rows.length} toko beserta SPG dan targetnya disalin dari ${App.monthName(prev)}. Toko yang sudah diatur bulan ini tidak diubah.`, { title: 'Salin dari bulan lalu?', ok: 'Salin' })) return;
    D.saveTargets(rows, user.id);
    App.toast(`${rows.length} toko disalin dari ${App.monthName(prev)}.`);
    render();
  });

  render();
});
