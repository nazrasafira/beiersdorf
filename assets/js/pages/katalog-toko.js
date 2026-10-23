Data.ready(function () {
  'use strict';
  const user = App.init({ roles: ['admin', 'manager', 'leader'] });
  if (!user) return;
  const D = Data, $ = id => document.getElementById(id);
  const form = $('form');
  const byName = id => { const u = D.user(id); return u ? u.name : '-'; };
  $('openAdd').hidden = !D.canAddCatalog(user);

  // A photo that can't be loaded (e.g. removed from Drive) falls back to the drawing
  const FALLBACK = `onerror="this.onerror=null;this.src='${App.esc(App.storeSrc(null))}'"`;

  /* ----- Shop-style grid: search, city filter, status tabs, pages ----- */
  const PAGE = 24; // cards per page (fills 2, 3 or 4 columns)
  let q = '', city = '', status = 'active', page = 1;

  // City filter: a searchable dropdown
  function renderCities() {
    const cities = [...new Set(D.stores(true).map(s => s.city).filter(Boolean))].sort();
    if (city && !cities.includes(city)) city = '';
    $('cityWrap').hidden = cities.length < 2;
    $('city').innerHTML = '<option value="">Semua kota</option>' + cities.map(c => `<option value="${App.esc(c)}" ${c === city ? 'selected' : ''}>${App.esc(c)}</option>`).join('');
    if ($('city')._combo) $('city')._combo.sync(); else App.combobox($('city'));
  }

  function card(s) {
    const where = [s.city, s.address].filter(Boolean).join(' · ');
    return `<button type="button" class="pcard-shop ${s.active ? '' : 'off'}" data-id="${s.id}" aria-label="${App.esc(s.name)}">
      <span class="ph"><img src="${App.esc(App.storeSrc(s))}" alt="" loading="lazy" ${FALLBACK}>${s.active ? '' : '<span class="pill">Nonaktif</span>'}</span>
      <span class="body">
        ${s.chain ? `<span class="brand" title="${App.esc(s.chain)}">${App.esc(s.chain)}</span>` : ''}
        <span class="name">${App.esc(s.name)}</span>
        ${where ? `<span class="where">${App.esc(where)}</span>` : ''}
      </span>
    </button>`;
  }

  function render(scroll) {
    const all = D.stores(true);
    $('count').textContent = `${all.filter(s => s.active).length} toko aktif dari ${all.length}`;
    const needle = q.trim().toLowerCase();
    const list = all.filter(s => (status === 'all' || s.active === (status === 'active'))
      && (!city || s.city === city)
      && (!needle || [s.name, s.chain, s.city, s.address].join(' ').toLowerCase().includes(needle)))
      .sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name));
    const [from, to, at] = App.pager($('pager'), { page, size: PAGE, total: list.length, label: 'toko', onPage: n => { page = n; render(true); } });
    page = at;
    $('grid').innerHTML = list.slice(from, to).map(card).join('');
    $('none').hidden = list.length > 0;
    $('shown').textContent = list.length ? `${list.length} toko` : '';
    if (scroll) $('q').closest('section').scrollIntoView({ block: 'start', behavior: 'smooth' });
    // Suggestions in the form: the chains and cities already used
    const uniq = k => [...new Set(all.map(s => s[k]).filter(Boolean))].sort();
    $('chains').innerHTML = uniq('chain').map(v => `<option value="${App.esc(v)}">`).join('');
    $('cities').innerHTML = uniq('city').map(v => `<option value="${App.esc(v)}">`).join('');
  }
  const refilter = () => { page = 1; render(); };

  $('q').addEventListener('input', e => { q = e.target.value; refilter(); });
  $('city').addEventListener('change', e => { city = e.target.value; refilter(); });
  $('statusTabs').addEventListener('click', e => {
    const b = e.target.closest('[data-status]');
    if (!b) return;
    status = b.dataset.status;
    $('statusTabs').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    refilter();
  });

  /* ----- Form: add, edit, or just look when the user may not change it ----- */
  let image = '';
  const showImage = () => { $('imgPreview').innerHTML = `<img src="${App.esc(App.storeSrc({ image }))}" alt="Foto toko" ${FALLBACK}>`; };
  $('pickImg').addEventListener('click', async () => {
    const photo = await App.pickImage('cover', 640, 480);
    if (photo) { image = photo; showImage(); }
  });

  function fill(s) {
    form.id.value = s ? s.id : '';
    form.name.value = s ? s.name : '';
    form.chain.value = s ? s.chain || '' : '';
    form.city.value = s ? s.city : '';
    form.address.value = s ? s.address || '' : '';
    form.active.checked = s ? s.active : true;
    image = s ? s.image || '' : '';
    showImage();
    const canEdit = !s || D.canEditCatalog(user, s);
    $('formTitle').textContent = !s ? 'Tambah toko' : canEdit ? 'Ubah toko' : 'Detail toko';
    form.querySelectorAll('input:not([type=hidden])').forEach(i => { i.disabled = !canEdit; });
    $('pickImg').hidden = !canEdit;
    $('saveBtn').hidden = !canEdit;
    $('cancelBtn').textContent = canEdit ? 'Batal' : 'Tutup';
    const by = s ? 'Ditambahkan oleh ' + byName(s.createdBy) + (s.updatedBy && s.updatedBy !== s.createdBy ? ' · diubah ' + byName(s.updatedBy) : '') : '';
    $('byline').textContent = by;
    $('byline').hidden = !by;
  }

  const dlg = App.modal($('dlg'));
  $('openAdd').addEventListener('click', () => { fill(null); dlg.open(); });
  $('grid').addEventListener('click', e => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    fill(D.store(b.dataset.id));
    dlg.open();
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const name = form.name.value.trim(), cityName = form.city.value.trim();
    if (!name || !cityName) { App.toast('Isi nama toko dan kota.'); return; }
    const error = await App.busy(form, () => D.saveStore({ id: form.id.value || undefined, name, chain: form.chain.value.trim(), city: cityName, address: form.address.value.trim(), areaId: user.areaId || (D.areas()[0] || {}).id, active: form.active.checked, image: image || '' }, user.id));
    if (error) { App.toast(error); return; }
    App.toast('Toko disimpan.');
    dlg.close();
    renderCities();
    render();
  });

  fill(null);
  renderCities();
  render();
});
