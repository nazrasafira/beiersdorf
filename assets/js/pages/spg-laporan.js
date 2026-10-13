/* Penjualan: record each sale as it happens during a shift. The day's report is built from these. */
Data.ready(function () {
  'use strict';
  const user = App.init({ roles: ['spg', 'leader', 'supervisor'] });
  if (!user) return;
  const D = Data, $ = id => document.getElementById(id);
  const isSpg = user.role === 'spg';

  const owner = isSpg ? user : D.user(App.param('spg'));
  if (!owner || !D.canView(user, owner)) {
    document.querySelector('main').innerHTML = '<p class="empty">Laporan tidak ditemukan.</p>';
    return;
  }
  let date = App.param('tanggal') || D.TODAY;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > D.TODAY) date = D.TODAY;
  const isToday = date === D.TODAY;
  const editDays = D.getSettings(owner.teamId).editDays;

  $('sub').textContent = (isSpg ? '' : owner.name + ' · ') + App.dateLong(date);
  if (!isToday && isSpg) $('back').hidden = false;

  /* ----- Product entry ----- */
  const products = D.products();
  $('product').innerHTML = '<option value=""></option>' +
    products.map(p => `<option value="${p.id}" data-img="${App.esc(App.productSrc(p))}">${App.esc(p.name)}</option>`).join('');
  App.combobox($('product'));

  const qty = () => Math.max(1, Math.floor(+$('qty').value || 1));
  const updateSubtotal = () => { $('subtotal').textContent = App.rp(qty() * Math.max(0, +$('price').value || 0)); };
  $('product').addEventListener('change', () => {
    const p = D.product($('product').value);
    $('price').value = p ? p.price : '';
    $('preview').innerHTML = p ? App.productImg(p, 'lg') : '';
    $('preview').hidden = !p;
    updateSubtotal();
  });
  $('minus').addEventListener('click', () => { $('qty').value = Math.max(1, qty() - 1); updateSubtotal(); });
  $('plus').addEventListener('click', () => { $('qty').value = qty() + 1; updateSubtotal(); });
  ['qty', 'price'].forEach(id => $(id).addEventListener('input', updateSubtotal));

  $('entry').addEventListener('submit', e => {
    e.preventDefault();
    const productId = $('product').value;
    if (!productId) { App.toast('Pilih produk dulu.'); $('product')._combo.focus(); return; }
    const price = Math.round(+$('price').value);
    if (!(price > 0)) { App.toast('Isi harga yang benar.'); $('price').focus(); return; }

    const before = isSpg && isToday ? D.level(D.progress(owner.id, 'day', date).pct) : null;
    const q = qty();
    D.addSale(owner.id, date, { productId, qty: q, price }, user.id);
    let msg = `Tersimpan: ${q} × ${D.product(productId).name}`;
    if (before) {
      const after = D.level(D.progress(owner.id, 'day', date).pct);
      if (after.min > before.min) msg = `Tersimpan. Selamat, kamu mencapai ${after.label}!`;
    }
    App.toast(msg);

    // Ready for the next sale
    $('product').value = '';
    $('product').dispatchEvent(new Event('change'));
    $('qty').value = 1;
    updateSubtotal();
    render();
  });

  /* ----- Shift controls ----- */
  $('startShift').addEventListener('click', async () => {
    const storeId = await App.pickStore({ title: 'Mulai shift', action: 'Mulai shift', current: D.lastStoreId(owner.id), note: 'Pilih toko tempat kamu bertugas hari ini. Bisa diganti selama shift.' });
    if (!storeId) return;
    D.startShift(owner.id, storeId);
    App.toast('Shift dimulai di ' + D.store(storeId).name + '.');
    render();
  });
  $('switchStore').addEventListener('click', async () => {
    const sh = D.getShift(owner.id, date);
    const storeId = await App.pickStore({ title: 'Ganti toko', action: 'Ganti', current: sh && sh.storeId, note: 'Penjualan berikutnya dicatat di toko ini.' });
    if (!storeId || (sh && storeId === sh.storeId)) return;
    D.switchStore(owner.id, storeId);
    App.toast('Sekarang di ' + D.store(storeId).name + '.');
    render();
  });
  // Ending a shift needs a photo of the SPG's handwritten sales notes (1–4 pages)
  const MAX_PHOTOS = 4;
  const endDlg = App.modal($('endDlg'));
  let photos = [];
  function renderPhotos() {
    $('endPhotos').innerHTML = photos.map((p, i) =>
      `<div class="note-photo"><img src="${p}" alt="Foto catatan ${i + 1}">${App.iconBtn('x', 'Hapus foto', `data-rm="${i}"`)}</div>`).join('');
    $('endPhotos').hidden = !photos.length;
    $('addPhoto').hidden = photos.length >= MAX_PHOTOS;
    $('addPhotoLabel').textContent = photos.length ? 'Tambah halaman' : 'Ambil foto catatan';
    $('endSubmit').disabled = !photos.length;
  }
  $('endShift').addEventListener('click', () => { photos = []; renderPhotos(); endDlg.open(); });
  $('addPhoto').addEventListener('click', async () => {
    const p = await App.pickPhoto();
    if (p) { photos.push(p); renderPhotos(); }
  });
  $('endPhotos').addEventListener('click', e => {
    const b = e.target.closest('[data-rm]');
    if (b) { photos.splice(+b.dataset.rm, 1); renderPhotos(); }
  });
  $('endForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!photos.length) { App.toast('Foto catatan penjualan dulu.'); return; }
    D.endShift(owner.id, user.id, photos);
    endDlg.close();
    App.toast('Shift selesai. Foto catatan tersimpan.');
    render();
  });

  $('list').addEventListener('click', e => {
    const b = e.target.closest('[data-del]');
    if (!b || !confirm('Hapus transaksi ini?')) return;
    D.removeSale(owner.id, date, b.dataset.del, user.id);
    render();
  });

  /* ----- Render ----- */
  function render() {
    const shift = D.getShift(owner.id, date);
    const report = D.getReport(owner.id, date);
    const tx = D.getTransactions(report).slice().reverse(); // newest first
    const manyStores = new Set(tx.map(t => t.storeId)).size > 1; // show the store per sale only when the day had several
    const canEdit = D.canEdit(user, owner.id, date);
    const needsShift = isSpg && isToday && !shift;
    const canAdd = canEdit && !needsShift;

    $('startWrap').hidden = !needsShift;
    const shiftText = shift ? (shift.end ? `Shift ${shift.start}–${shift.end}` : `Shift berjalan sejak ${shift.start}`) : '';
    $('shift').textContent = shiftText;
    $('shift').hidden = !shiftText;
    $('endShift').hidden = !(isSpg && isToday && shift && !shift.end);
    const curStore = shift && D.store(shift.storeId);
    $('storeBar').hidden = !curStore;
    if (curStore) $('storeName').textContent = curStore.name + ' · ' + curStore.city;
    $('switchStore').hidden = !(isSpg && isToday && shift && !shift.end);

    $('entry').hidden = !canAdd;
    $('locked').hidden = canEdit;
    $('locked').textContent = `Laporan ini terkunci karena sudah lebih dari ${editDays} hari.`;
    $('late').hidden = !(canAdd && (!isToday || (shift && shift.end)));

    const shiftPhotos = (shift && shift.photos) || [];
    $('notes').hidden = !shiftPhotos.length;
    $('notePhotos').innerHTML = shiftPhotos.length ? App.notePhotos(shiftPhotos) : '';

    $('total').textContent = App.rp(report ? report.total : 0);
    $('count').textContent = report && report.noSales ? 'Tidak ada penjualan' : `${tx.length} transaksi`;
    $('list').innerHTML = tx.map(t => `
      <div>
        ${App.productImg(D.product(t.productId))}
        <div class="grow"><b>${App.esc(D.product(t.productId).name)}</b><span>${t.time ? t.time + ' · ' : ''}${t.qty} × ${App.rp(t.price)}${manyStores && D.store(t.storeId) ? ' · ' + App.esc(D.store(t.storeId).name) : ''}</span></div>
        <div class="val">${App.rp(t.qty * t.price)}</div>${canEdit && report.transactions ? App.iconBtn('trash', 'Hapus transaksi', `data-del="${t.id}"`, 'danger') : ''}
      </div>`).join('') || (needsShift ? '' : '<p class="empty">Belum ada penjualan.</p>');
  }

  updateSubtotal();
  render();
});
