Data.ready(function () {
  'use strict';
  const user = App.init({ roles: ['leader', 'supervisor'], teamPicker: true });
  if (!user) return;
  const D = Data, $ = id => document.getElementById(id);
  const teamId = App.teamId(user);
  const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  let mk = App.param('bulan') || D.monthKey(D.TODAY);
  if (!/^\d{4}-\d{2}$/.test(mk)) mk = D.monthKey(D.TODAY);

  const fmtInput = n => n ? App.num(n) : '';
  const firstName = u => u.name.split(' ')[0];

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

    // Active stores, plus inactive ones that still have a target this month; own team's first, then free, then taken
    const list = D.stores(true).map(st => ({ st, ...holderOf(st.id, mk) }))
      .filter(x => x.st.active || (x.t && !x.taken))
      .map(x => ({ ...x, rank: x.taken ? 2 : x.holder ? 0 : 1 }))
      .sort((a, b) => a.rank - b.rank || (a.holder && b.holder ? a.holder.name.localeCompare(b.holder.name) : 0) || a.st.name.localeCompare(b.st.name));

    $('rows').innerHTML = list.map(({ st, t, holder, taken }) => {
      const place = App.esc([st.chain, st.city].filter(Boolean).join(' · '));
      const storeCell = `<td><b>${App.esc(st.name)}</b>${place ? `<small>${place}</small>` : ''}</td>`;
      if (taken) {
        const who = holder ? `${App.esc(holder.name)} · Tim ${App.esc((D.team(holder.teamId) || {}).name || '')}` : 'SPG tim lain';
        return `<tr class="taken">${storeCell}<td colspan="5" class="small muted">Dipegang ${who}</td></tr>`;
      }
      const opts = spgs.slice();
      if (holder && !opts.includes(holder)) opts.push(holder); // deactivated SPG who still holds it
      const setBy = t && t.setBy && D.user(t.setBy) ? `${App.esc(firstName(D.user(t.setBy)))}, ${App.dateMid(t.setAt)}` : '–';
      const v = t || {};
      return `<tr data-store="${st.id}" data-had="${t ? 1 : 0}">
        ${storeCell}
        <td><select class="input spg" aria-label="SPG untuk ${App.esc(st.name)}">
          <option value="">– Belum ada –</option>
          ${opts.map(u => `<option value="${u.id}" ${holder && holder.id === u.id ? 'selected' : ''}>${App.esc(u.name)}${u.active ? '' : ' (nonaktif)'}</option>`).join('')}
        </select></td>
        <td class="num"><input class="input t-input monthly" inputmode="numeric" value="${fmtInput(v.monthly)}" placeholder="0" aria-label="Target bulanan ${App.esc(st.name)}"></td>
        <td class="num"><input class="input t-input weekly ${v.weekly ? 'override' : ''}" inputmode="numeric" value="${fmtInput(v.weekly)}" aria-label="Target mingguan ${App.esc(st.name)}"></td>
        <td class="num"><input class="input t-input daily ${v.daily ? 'override' : ''}" inputmode="numeric" value="${fmtInput(v.daily)}" aria-label="Target harian ${App.esc(st.name)}"></td>
        <td class="small muted">${setBy}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" class="empty">Belum ada toko. Tambahkan di Katalog → Toko.</td></tr>';
    $('rows').querySelectorAll('tr[data-store]').forEach(updatePlaceholders);
    App.tableTools($('rows').closest('table'), {
      placeholder: 'Cari toko atau SPG...', pageSize: 50,
      text: tr => tr.cells[0].textContent + ' ' + (tr.querySelector('.spg') ? tr.querySelector('.spg').selectedOptions[0].text : tr.textContent),
    });
    renderSpgs();
  }

  // Per SPG: the stores chosen on this page and the sum of their monthly targets (follows the inputs before saving)
  function renderSpgs() {
    const by = {};
    document.querySelectorAll('#rows tr[data-store]').forEach(tr => {
      const id = tr.querySelector('.spg').value;
      if (!id) return;
      const b = by[id] || (by[id] = { stores: [], monthly: 0 });
      b.stores.push(tr.cells[0].querySelector('b').textContent);
      b.monthly += App.parseNum(tr.querySelector('.monthly').value);
    });
    const spgs = D.spgsOf(teamId).concat(Object.keys(by).map(D.user).filter(u => u && !u.active));
    $('spgRows').innerHTML = spgs.map(u => {
      const b = by[u.id];
      return `<tr>
        <td>${App.person(u, u.active ? '' : 'nonaktif')}</td>
        <td class="small">${b ? b.stores.map(App.esc).join(', ') : '<span class="pill warn">Belum ada toko</span>'}</td>
        <td class="num"><b>${b ? App.rp(b.monthly) : '–'}</b></td>
      </tr>`;
    }).join('') || '<tr><td colspan="3" class="empty">Belum ada SPG aktif di tim ini.</td></tr>';
  }

  function updatePlaceholders(tr) {
    const p = D.targetPreview(teamId, mk, App.parseNum(tr.querySelector('.monthly').value));
    tr.querySelector('.weekly').placeholder = 'otomatis ' + App.num(Math.round(p.weekly / 1000) * 1000);
    tr.querySelector('.daily').placeholder = 'otomatis ' + App.num(Math.round(p.daily / 1000) * 1000);
  }

  $('rows').addEventListener('input', e => {
    const tr = e.target.closest('tr');
    if (e.target.classList.contains('monthly')) { updatePlaceholders(tr); renderSpgs(); }
    else if (e.target.classList.contains('t-input')) e.target.classList.toggle('override', App.parseNum(e.target.value) > 0);
  });
  $('rows').addEventListener('change', e => { if (e.target.classList.contains('spg')) renderSpgs(); });
  $('rows').addEventListener('focusout', e => {
    if (e.target.matches('.t-input')) e.target.value = fmtInput(App.parseNum(e.target.value));
  });

  $('prev').addEventListener('click', () => { mk = D.addMonths(mk, -1); render(); });
  $('next').addEventListener('click', () => { mk = D.addMonths(mk, 1); render(); });

  $('applyAll').addEventListener('click', () => {
    const rows = [...document.querySelectorAll('#rows tr[data-store]')].filter(tr => tr.querySelector('.spg').value);
    const first = rows.map(tr => tr.querySelector('.monthly')).find(i => App.parseNum(i.value));
    if (!first) { App.toast('Pilih SPG dan isi target bulanan di salah satu toko dulu.'); return; }
    rows.forEach(tr => { tr.querySelector('.monthly').value = first.value; updatePlaceholders(tr); });
    renderSpgs();
    App.toast('Target ' + first.value + ' diterapkan ke semua toko yang punya SPG. Klik Simpan.');
  });

  // Last month's SPG and targets, for the stores still free on this page
  $('copyPrev').addEventListener('click', () => {
    const prev = D.addMonths(mk, -1);
    let n = 0;
    document.querySelectorAll('#rows tr[data-store]').forEach(tr => {
      const { t, holder } = holderOf(tr.dataset.store, prev);
      const sel = tr.querySelector('.spg');
      if (!t || !holder || !holder.active || holder.teamId !== teamId || ![...sel.options].some(o => o.value === holder.id)) return;
      n++;
      sel.value = holder.id;
      tr.querySelector('.monthly').value = fmtInput(t.monthly);
      tr.querySelector('.weekly').value = fmtInput(t.weekly);
      tr.querySelector('.daily').value = fmtInput(t.daily);
      tr.querySelector('.weekly').classList.toggle('override', !!t.weekly);
      tr.querySelector('.daily').classList.toggle('override', !!t.daily);
      updatePlaceholders(tr);
    });
    renderSpgs();
    App.toast(n ? `Toko dan target ${App.monthName(prev)} disalin. Klik Simpan.` : `Tidak ada target di ${App.monthName(prev)}.`);
  });

  $('save').addEventListener('click', () => {
    const rows = [];
    let missing = null;
    document.querySelectorAll('#rows tr[data-store]').forEach(tr => {
      const r = {
        storeId: tr.dataset.store, mk, userId: tr.querySelector('.spg').value || null,
        monthly: App.parseNum(tr.querySelector('.monthly').value),
        weekly: App.parseNum(tr.querySelector('.weekly').value),
        daily: App.parseNum(tr.querySelector('.daily').value),
      };
      if (!r.userId && (r.monthly || r.weekly || r.daily)) missing = missing || tr;
      if (r.userId || tr.dataset.had === '1') rows.push(r); // a store that had an SPG and now has none is released
    });
    if (missing) {
      App.toast('Pilih SPG untuk ' + missing.cells[0].querySelector('b').textContent + ' atau kosongkan targetnya.');
      missing.querySelector('.spg').focus();
      return;
    }
    if (!rows.length) { App.toast('Pilih SPG untuk minimal satu toko.'); return; }
    D.saveTargets(rows, user.id);
    App.toast('Target ' + App.monthName(mk) + ' disimpan.');
    render();
  });

  render();
});
