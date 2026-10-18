Data.ready(function () {
  'use strict';
  const user = App.init({ roles: ['leader', 'supervisor'], teamPicker: true });
  if (!user) return;
  const D = Data, $ = id => document.getElementById(id);
  const teamId = App.teamId(user);
  const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const NONE = '__none'; // "Tanpa SPG" in the picker ('' is the empty search box)
  let mk = App.param('bulan') || D.monthKey(D.TODAY);
  if (!/^\d{4}-\d{2}$/.test(mk)) mk = D.monthKey(D.TODAY);

  const fmtInput = n => n ? App.num(n) : '';
  const firstName = u => u.name.split(' ')[0];
  const cards = () => [...document.querySelectorAll('#rows .tcard')];
  const spgOf = card => { const v = card.querySelector('.spg').value; return v && v !== NONE ? v : null; };
  const nameOf = card => card.querySelector('.tcard-head b').textContent;

  // A store held by an active SPG of another team can't be given out from this page
  function holderOf(storeId, month) {
    const t = D.storeTarget(storeId, month);
    if (!t) return { t: null, holder: null, taken: false };
    const holder = t.userId ? D.user(t.userId) : null;
    const taken = !!t.taken || (!!holder && holder.teamId !== teamId && holder.active);
    return { t, holder, taken };
  }

  function render() {
    const spgs = D.spgsOf(teamId);
    const settings = D.getSettings(teamId);
    const wd = D.workingDaysInMonth(teamId, mk);
    const days = [1, 2, 3, 4, 5, 6, 0].filter(d => settings.workingDays.includes(d)).map(d => DAY_NAMES[d]).join(', ');
    $('month').textContent = App.monthName(mk);
    $('sub').textContent = `Tim ${D.team(teamId).name} · ${wd} hari kerja (${days})`;

    // Active stores, plus inactive ones that still have a target this month; own team's first, then free stores
    const all = D.stores(true).map(st => ({ st, ...holderOf(st.id, mk) })).filter(x => x.st.active || (x.t && !x.taken));
    const open = all.filter(x => !x.taken)
      .sort((a, b) => !!b.holder - !!a.holder || (a.holder && b.holder ? a.holder.name.localeCompare(b.holder.name) : 0) || a.st.name.localeCompare(b.st.name));
    const taken = all.filter(x => x.taken).sort((a, b) => a.st.name.localeCompare(b.st.name));
    const place = st => App.esc([st.chain, st.city].filter(Boolean).join(' · '));

    $('rows').innerHTML = open.map(({ st, t, holder }) => {
      const opts = spgs.slice();
      if (holder && !opts.includes(holder)) opts.push(holder); // deactivated SPG who still holds it
      const by = t && t.setBy && D.user(t.setBy);
      const v = t || {};
      return `<div class="tcard" data-store="${st.id}" data-had="${t ? 1 : 0}">
        <div class="tcard-head">
          <div><b>${App.esc(st.name)}</b>${place(st) ? `<small>${place(st)}</small>` : ''}</div>
          ${by ? `<span class="by">${App.esc(firstName(by))}<br>${App.dateMid(t.setAt)}</span>` : ''}
        </div>
        <div class="field"><label for="spg-${st.id}">SPG</label>
          <select class="spg" id="spg-${st.id}" data-placeholder="Cari SPG...">
            <option value=""></option>
            <option value="${NONE}" data-img="${App.esc(App.imgSrc('assets/avatars/default.svg'))}">Tanpa SPG</option>
            ${opts.map(u => `<option value="${u.id}" data-img="${App.esc(App.imgSrc(u.photo || 'assets/avatars/default.svg'))}" ${holder && holder.id === u.id ? 'selected' : ''}>${App.esc(u.name)}${u.active ? '' : ' (nonaktif)'}</option>`).join('')}
          </select>
        </div>
        <div class="tcard-nums">
          <div class="field monthly-f"><label for="m-${st.id}">Target bulanan</label><input class="input t-input monthly" id="m-${st.id}" inputmode="numeric" value="${fmtInput(v.monthly)}" placeholder="0"></div>
          <div class="field"><label for="w-${st.id}">Mingguan <small>· otomatis</small></label><input class="input t-input weekly ${v.weekly ? 'override' : ''}" id="w-${st.id}" inputmode="numeric" value="${fmtInput(v.weekly)}"></div>
          <div class="field"><label for="d-${st.id}">Harian <small>· otomatis</small></label><input class="input t-input daily ${v.daily ? 'override' : ''}" id="d-${st.id}" inputmode="numeric" value="${fmtInput(v.daily)}"></div>
        </div>
      </div>`;
    }).join('') || '<p class="empty">Belum ada toko. Tambahkan di Katalog → Toko.</p>';
    cards().forEach(c => { App.combobox(c.querySelector('.spg')); updatePlaceholders(c); });

    // Stores of other teams: listed apart, read only
    $('takenWrap').hidden = !taken.length;
    $('takenSum').textContent = `Toko yang dipegang tim lain (${taken.length})`;
    $('taken').innerHTML = taken.map(({ st, holder }) => `<div><div class="grow"><b>${App.esc(st.name)}</b><span>${place(st)}</span></div>
      <span class="small muted">${holder ? `${App.esc(holder.name)} · Tim ${App.esc((D.team(holder.teamId) || {}).name || '')}` : 'SPG tim lain'}</span></div>`).join('');

    filter();
    renderSpgs();
    markDirty();
  }

  // Per SPG: the stores chosen on this page and the sum of their monthly targets (follows the inputs before saving)
  function renderSpgs() {
    const by = {};
    cards().forEach(c => {
      const id = spgOf(c);
      if (!id) return;
      const b = by[id] || (by[id] = { stores: [], monthly: 0 });
      b.stores.push(nameOf(c));
      b.monthly += App.parseNum(c.querySelector('.monthly').value);
    });
    const spgs = D.spgsOf(teamId).concat(Object.keys(by).map(D.user).filter(u => u && !u.active));
    $('spgRows').innerHTML = spgs.map(u => {
      const b = by[u.id];
      const sub = b ? `${b.stores.length} toko · ${b.stores.join(', ')}` : 'Belum ada toko';
      return `<div><div class="grow">${App.person(u, sub, u.name + (u.active ? '' : ' (nonaktif)'))}</div>
        <div class="val">${b ? `<b>${App.rpShort(b.monthly)}</b>` : '<span class="pill warn">0 toko</span>'}</div></div>`;
    }).join('') || '<p class="empty">Belum ada SPG aktif di tim ini.</p>';
  }

  function updatePlaceholders(card) {
    const p = D.targetPreview(teamId, mk, App.parseNum(card.querySelector('.monthly').value));
    card.querySelector('.weekly').placeholder = App.num(Math.round(p.weekly / 1000) * 1000);
    card.querySelector('.daily').placeholder = App.num(Math.round(p.daily / 1000) * 1000);
  }

  // Unsaved changes: the card gets a blue border and the save bar says how many
  const snapshot = c => [spgOf(c) || '', ...['monthly', 'weekly', 'daily'].map(k => App.parseNum(c.querySelector('.' + k).value))].join('|');
  function markDirty() {
    let n = 0;
    cards().forEach(c => {
      if (c.dataset.orig === undefined) c.dataset.orig = snapshot(c);
      const dirty = snapshot(c) !== c.dataset.orig;
      c.classList.toggle('dirty', dirty);
      n += dirty;
    });
    $('dirty').textContent = n ? `${n} toko berubah` : '';
  }

  function filter() {
    const q = $('search').value.trim().toLowerCase();
    let shown = 0;
    cards().forEach(c => {
      const sel = c.querySelector('.spg');
      const text = (c.querySelector('.tcard-head').textContent + ' ' + (spgOf(c) ? sel.selectedOptions[0].textContent : '')).toLowerCase();
      c.hidden = !!q && !text.includes(q);
      shown += !c.hidden;
    });
    $('none').hidden = !q || shown > 0;
  }
  $('search').addEventListener('input', filter);

  $('rows').addEventListener('input', e => {
    const c = e.target.closest('.tcard');
    if (!c || !e.target.classList.contains('t-input')) return;
    if (e.target.classList.contains('monthly')) { updatePlaceholders(c); renderSpgs(); }
    else e.target.classList.toggle('override', App.parseNum(e.target.value) > 0);
    markDirty();
  });
  $('rows').addEventListener('change', e => { if (e.target.classList.contains('spg')) { renderSpgs(); markDirty(); } });
  $('rows').addEventListener('focusout', e => {
    if (e.target.matches('.t-input')) e.target.value = fmtInput(App.parseNum(e.target.value));
  });

  const go = n => {
    if ($('dirty').textContent && !confirm('Perubahan belum disimpan. Pindah bulan?')) return;
    mk = D.addMonths(mk, n); render();
  };
  $('prev').addEventListener('click', () => go(-1));
  $('next').addEventListener('click', () => go(1));

  $('applyAll').addEventListener('click', () => {
    const list = cards().filter(spgOf);
    const first = list.map(c => c.querySelector('.monthly')).find(i => App.parseNum(i.value));
    if (!first) { App.toast('Pilih SPG dan isi target bulanan di salah satu toko dulu.'); return; }
    list.forEach(c => { c.querySelector('.monthly').value = first.value; updatePlaceholders(c); });
    renderSpgs(); markDirty();
    App.toast('Target ' + first.value + ' diterapkan ke semua toko yang punya SPG. Klik Simpan.');
  });

  // Last month's SPG and targets, for the stores still free on this page
  $('copyPrev').addEventListener('click', () => {
    const prev = D.addMonths(mk, -1);
    let n = 0;
    cards().forEach(c => {
      const { t, holder } = holderOf(c.dataset.store, prev);
      const sel = c.querySelector('.spg');
      if (!t || !holder || !holder.active || holder.teamId !== teamId || ![...sel.options].some(o => o.value === holder.id)) return;
      n++;
      sel.value = holder.id;
      sel._combo.sync();
      c.querySelector('.monthly').value = fmtInput(t.monthly);
      c.querySelector('.weekly').value = fmtInput(t.weekly);
      c.querySelector('.daily').value = fmtInput(t.daily);
      c.querySelector('.weekly').classList.toggle('override', !!t.weekly);
      c.querySelector('.daily').classList.toggle('override', !!t.daily);
      updatePlaceholders(c);
    });
    renderSpgs(); markDirty();
    App.toast(n ? `Toko dan target ${App.monthName(prev)} disalin. Klik Simpan.` : `Tidak ada target di ${App.monthName(prev)}.`);
  });

  $('save').addEventListener('click', () => {
    const rows = [];
    let missing = null;
    cards().forEach(c => {
      const r = {
        storeId: c.dataset.store, mk, userId: spgOf(c),
        monthly: App.parseNum(c.querySelector('.monthly').value),
        weekly: App.parseNum(c.querySelector('.weekly').value),
        daily: App.parseNum(c.querySelector('.daily').value),
      };
      if (!r.userId && (r.monthly || r.weekly || r.daily)) missing = missing || c;
      if (r.userId || c.dataset.had === '1') rows.push(r); // a store that had an SPG and now has none is released
    });
    if (missing) {
      App.toast('Pilih SPG untuk ' + nameOf(missing) + ' atau kosongkan targetnya.');
      missing.hidden = false;
      missing.scrollIntoView({ block: 'center' });
      return;
    }
    if (!rows.length) { App.toast('Pilih SPG untuk minimal satu toko.'); return; }
    D.saveTargets(rows, user.id);
    App.toast('Target ' + App.monthName(mk) + ' disimpan.');
    render();
  });

  render();
});
