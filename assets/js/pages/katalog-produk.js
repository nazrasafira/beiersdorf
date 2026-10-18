Data.ready(function () {
  'use strict';
  const user = App.init({ roles: ['admin', 'supervisor', 'leader'] });
  if (!user) return;
  const D = Data, $ = id => document.getElementById(id);
  const form = $('form');
  App.moneyInput(form.price); // "Rp 22.275" while typing

  /* ----- Shop-style grid: search, subbrand chips, status tabs, more on demand ----- */
  const PAGE = 24;
  let q = '', brand = '', status = 'active', limit = PAGE;

  function renderBrands() {
    const brands = [...new Set(D.products(true).map(p => p.brand).filter(Boolean))].sort();
    if (brand && !brands.includes(brand)) brand = '';
    $('brandChips').hidden = !brands.length;
    $('brandChips').innerHTML = ['', ...brands].map(b =>
      `<button type="button" class="chip ${b === brand ? 'on' : ''}" data-brand="${App.esc(b)}" aria-pressed="${b === brand}">${App.esc(b || 'Semua')}</button>`).join('');
  }

  function card(p) {
    return `<button type="button" class="pcard-shop ${p.active ? '' : 'off'}" data-id="${p.id}" aria-label="${App.esc(p.name)}, ${App.rp(p.price)}">
      <span class="ph"><img src="${App.esc(App.productSrc(p))}" alt="" loading="lazy">${p.active ? '' : '<span class="pill">Nonaktif</span>'}</span>
      <span class="body">
        ${p.brand ? `<span class="brand">${App.esc(p.brand)}</span>` : ''}
        <span class="name">${App.esc(p.name)}</span>
        ${p.sku ? `<span class="sku">SKU ${App.esc(p.sku)}</span>` : ''}
        <span class="price">${App.rp(p.price)}</span>
      </span>
    </button>`;
  }

  function render() {
    const all = D.products(true);
    $('count').textContent = `${all.filter(p => p.active).length} aktif dari ${all.length}`;
    const needle = q.trim().toLowerCase();
    const list = all.filter(p => (status === 'all' || p.active === (status === 'active'))
      && (!brand || p.brand === brand)
      && (!needle || [p.name, p.sku, p.brand, p.barcode].join(' ').toLowerCase().includes(needle)));
    $('grid').innerHTML = list.slice(0, limit).map(card).join('');
    $('none').hidden = list.length > 0;
    $('moreWrap').hidden = list.length <= limit;
    $('shown').textContent = list.length ? `${Math.min(limit, list.length)} dari ${list.length} produk` : '';
  }
  const refilter = () => { limit = PAGE; render(); };

  $('q').addEventListener('input', e => { q = e.target.value; refilter(); });
  $('brandChips').addEventListener('click', e => {
    const b = e.target.closest('[data-brand]');
    if (!b) return;
    brand = b.dataset.brand;
    renderBrands();
    $('brandChips').querySelector('.chip.on').scrollIntoView({ block: 'nearest', inline: 'center' });
    refilter();
  });
  $('statusTabs').addEventListener('click', e => {
    const b = e.target.closest('[data-status]');
    if (!b) return;
    status = b.dataset.status;
    $('statusTabs').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    refilter();
  });
  $('more').addEventListener('click', () => { limit += PAGE; render(); });

  const byName = id => { const u = D.user(id); return u ? u.name : '-'; };
  $('openAdd').hidden = !D.canAddCatalog(user);

  let image = '';
  const showImage = () => { $('imgPreview').innerHTML = App.productImg({ image }, 'lg'); };
  $('pickImg').addEventListener('click', async () => {
    const photo = await App.pickImage('contain', 320);
    if (photo) { image = photo; showImage(); }
  });

  // Subbrand suggestions: the ones already in the catalog
  const fillBrands = () => {
    const brands = [...new Set(D.products(true).map(p => p.brand).filter(Boolean))].sort();
    $('brands').innerHTML = brands.map(b => `<option value="${App.esc(b)}">`).join('');
  };

  function fill(p) {
    form.id.value = p ? p.id : '';
    form.name.value = p ? p.name : '';
    form.sku.value = p ? p.sku : '';
    form.brand.value = p ? p.brand || '' : '';
    form.barcode.value = p ? p.barcode || '' : '';
    App.setMoney(form.price, p ? p.price : 0);
    image = p ? p.image || '' : '';
    showImage();
    form.active.checked = p ? p.active : true;
    const canEdit = !p || D.canEditCatalog(user, p);
    $('formTitle').textContent = !p ? 'Tambah produk' : canEdit ? 'Ubah produk' : 'Detail produk';
    form.querySelectorAll('input:not([type=hidden])').forEach(i => { i.disabled = !canEdit; });
    $('pickImg').hidden = !canEdit;
    $('saveBtn').hidden = !canEdit;
    $('cancelBtn').textContent = canEdit ? 'Batal' : 'Tutup';
    const by = p ? 'Ditambahkan oleh ' + byName(p.createdBy) + (p.updatedBy && p.updatedBy !== p.createdBy ? ' · diubah ' + byName(p.updatedBy) : '') : '';
    $('byline').textContent = by;
    $('byline').hidden = !by;
  }

  // Tap a card: edit it, or just look when the user may not change it
  $('grid').addEventListener('click', e => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    fill(D.product(b.dataset.id));
    dlg.open();
  });
  const dlg = App.modal($('dlg'));
  $('openAdd').addEventListener('click', () => { fill(null); dlg.open(); });
  fillBrands();

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const price = App.parseNum(form.price.value);
    if (!form.name.value.trim() || !(price > 0)) { App.toast('Isi nama produk dan harga yang benar.'); return; }
    const error = await App.busy(form, () => D.saveProduct({ id: form.id.value || undefined, name: form.name.value.trim(), sku: form.sku.value.trim(), brand: form.brand.value.trim(), barcode: form.barcode.value.trim(), price, active: form.active.checked, image: image || 'assets/products/placeholder.svg' }, user.id));
    if (error) { App.toast(error); return; }
    App.toast('Produk disimpan.');
    dlg.close();
    fill(null);
    fillBrands();
    renderBrands();
    render();
  });

  fill(null);
  renderBrands();
  render();
});
