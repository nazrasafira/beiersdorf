/* Penjualan: record each sale as it happens during a shift. The day's report is built from these. */
Data.ready(function () {
  'use strict';
  const user = App.init({ roles: ['spg', 'leader', 'manager'] });
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

  $('sub').textContent = (isSpg ? '' : owner.name + ' · ') + App.dateLong(date);
  if (!isToday && isSpg) $('back').hidden = false;
  if (isSpg) {
    $('otherDate').hidden = false;
    $('otherDate').addEventListener('click', () => App.pickOtherDate(isToday ? null : date));
  }

  /* ----- Product entry ----- */
  const products = D.products();
  $('product').innerHTML = '<option value=""></option>' +
    products.map(p => `<option value="${p.id}" data-img="${App.esc(App.productSrc(p))}">${App.esc(p.name)}</option>`).join('');
  App.combobox($('product'));

  // A day without a shift has no store of its own, so the sale says where it was made. The SPG's own stores come first.
  const mine = D.heldStores(owner.id, D.monthKey(date)).map(t => t.storeId);
  const lastStore = D.lastStoreId(owner.id);
  $('saleStore').innerHTML = '<option value=""></option>' + D.stores().slice()
    .sort((a, b) => (mine.includes(b.id) - mine.includes(a.id)) || a.name.localeCompare(b.name))
    .map(st => `<option value="${st.id}" ${st.id === lastStore ? 'selected' : ''} ${mine.includes(st.id) ? 'data-tag="Toko kamu"' : ''}>${App.esc([st.name, st.city].filter(Boolean).join(' · '))}</option>`).join('');
  App.combobox($('saleStore'));

  const MAX_QTY = 10000; // same limit as the server
  const qty = () => Math.max(1, Math.floor(+$('qty').value || 1));
  const qtyOk = () => { const q = Number($('qty').value); return Number.isInteger(q) && q >= 1 && q <= MAX_QTY; };
  const updateSubtotal = () => {
    $('qty').classList.toggle('attention', !qtyOk());
    $('subtotal').textContent = qtyOk() ? App.rp(qty() * App.parseNum($('price').value)) : '–';
  };
  $('product').addEventListener('change', () => {
    const p = D.product($('product').value);
    App.setMoney($('price'), p ? p.price : 0);
    $('preview').innerHTML = p ? App.productImg(p, 'lg') : '';
    $('preview').hidden = !p;
    updateSubtotal();
  });
  $('minus').addEventListener('click', () => { $('qty').value = Math.max(1, qty() - 1); updateSubtotal(); });
  $('plus').addEventListener('click', () => { $('qty').value = qty() + 1; updateSubtotal(); });
  App.moneyInput($('price')); // "Rp 22.275" while typing
  ['qty', 'price'].forEach(id => $(id).addEventListener('input', updateSubtotal));

  $('entry').addEventListener('submit', e => {
    e.preventDefault();
    const productId = $('product').value;
    if (!productId) { App.toast('Pilih produk dulu.'); $('product')._combo.flash(); return; }
    const rawQty = Number($('qty').value);
    if (!Number.isInteger(rawQty) || rawQty < 1 || rawQty > MAX_QTY) { App.toast(`Jumlah harus 1–${App.num(MAX_QTY)}.`); $('qty').focus(); return; }
    const price = App.parseNum($('price').value);
    if (!(price > 0) || price > 1e9) { App.toast('Isi harga yang benar.'); $('price').focus(); return; }
    const noShift = !D.getShift(owner.id, date);
    if (noShift && !$('saleStore').value) { App.toast('Pilih toko dulu.'); $('saleStore')._combo.flash(); return; }

    const before = isSpg && isToday ? D.level(D.progress(owner.id, 'day', date).pct) : null;
    const q = qty();
    D.addSale(owner.id, date, Object.assign({ productId, qty: q, price }, noShift ? { storeId: $('saleStore').value } : {}), user.id);
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
    pagedTx.reset(); // the new sale is on top of the first page
    render();
  });

  /* ----- Shift controls ----- */
  $('startShift').addEventListener('click', async () => {
    const storeId = await App.pickStore({ userId: owner.id, title: 'Mulai shift', action: 'Mulai shift', current: D.lastStoreId(owner.id), note: 'Pilih toko tempat kamu bertugas hari ini. Bisa diganti selama shift.' });
    if (!storeId) return;
    D.startShift(owner.id, storeId);
    App.toast('Shift dimulai di ' + D.store(storeId).name + '.');
    render();
  });
  $('switchStore').addEventListener('click', async () => {
    const sh = D.getShift(owner.id, date);
    const storeId = await App.pickStore({ userId: owner.id, title: 'Ganti toko', action: 'Ganti', current: sh && sh.storeId, note: 'Penjualan berikutnya dicatat di toko ini.' });
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
    location.href = App.page('terima-kasih.html');
  });

  /* ----- Change a sale: Ubah opens it; delete lives in there. A change is saved as the corrected sale plus removing the old one. ----- */
  const txDlg = App.modal($('txDlg'));
  let editing = null;
  $('txProduct').innerHTML = $('product').innerHTML;
  App.combobox($('txProduct'));
  App.moneyInput($('txPrice'));
  const txSubtotal = () => { $('txSubtotal').textContent = App.rp(Math.max(1, Math.floor(+$('txQty').value || 1)) * App.parseNum($('txPrice').value)); };
  ['txQty', 'txPrice'].forEach(id => $(id).addEventListener('input', txSubtotal));
  $('txProduct').addEventListener('change', () => { const p = D.product($('txProduct').value); if (p && editing && p.id !== editing.productId) App.setMoney($('txPrice'), p.price); txSubtotal(); });
  $('list').addEventListener('click', e => {
    const b = e.target.closest('[data-edit]');
    if (!b) return;
    editing = D.getTransactions(D.getReport(owner.id, date)).find(x => x.id === b.dataset.edit);
    if (!editing) return;
    const st = D.store(editing.storeId);
    $('txWhen').textContent = [editing.time, st && st.name].filter(Boolean).join(' · ');
    $('txProduct').value = editing.productId;
    $('txProduct')._combo.sync();
    $('txQty').value = editing.qty;
    App.setMoney($('txPrice'), editing.price);
    txSubtotal();
    txDlg.open();
  });
  $('txForm').addEventListener('submit', e => {
    e.preventDefault();
    const productId = $('txProduct').value, q = Number($('txQty').value), price = App.parseNum($('txPrice').value);
    if (!productId) { App.toast('Pilih produk dulu.'); return; }
    if (!Number.isInteger(q) || q < 1 || q > MAX_QTY) { App.toast(`Jumlah harus 1–${App.num(MAX_QTY)}.`); return; }
    if (!(price > 0) || price > 1e9) { App.toast('Isi harga yang benar.'); return; }
    if (productId !== editing.productId || q !== editing.qty || price !== editing.price) {
      // The corrected sale goes first: if anything fails on the way, the sale is never lost
      D.addSale(owner.id, date, { productId, qty: q, price, storeId: editing.storeId, time: editing.time }, user.id);
      D.removeSale(owner.id, date, editing.id, user.id);
      App.toast('Transaksi diubah.');
    }
    txDlg.close();
    render();
  });
  $('txDelete').addEventListener('click', async () => {
    const what = `${editing.qty} × ${D.product(editing.productId).name} (${App.rp(editing.qty * editing.price)})`;
    if (!await App.confirm(`${what} dihapus dari laporan.`, { title: 'Hapus transaksi?', ok: 'Hapus', danger: true })) return;
    D.removeSale(owner.id, date, editing.id, user.id);
    txDlg.close();
    App.toast('Transaksi dihapus.');
    render();
  });

  /* ----- Sell out: a reminder for last month's store reports; they are entered on Sell out bulanan (sellout.html) ----- */
  const soMonth = D.addMonths(D.monthKey(D.TODAY), -1);
  // The bar follows the store of the shift: switching store shows (and opens) that store's sell out, and hides it at a store the
  // SPG doesn't hold. Without a shift: all their stores together.
  let soRows = null;
  const linesOf = r => (Array.isArray(r.items) ? r.items : []);
  function renderSellOut(shiftStore) {
    if (!soRows || !soRows.length) return;
    const one = soRows.find(r => r.storeId === shiftStore);
    // A shift at a store that isn't theirs: no sell out to fill in there
    $('soBanner').hidden = !!shiftStore && !one;
    if (shiftStore && !one) return;
    const list = one ? [one] : soRows;
    const done = list.filter(r => linesOf(r).length), all = done.length === list.length;
    const lines = done.flatMap(linesOf);
    $('soBanner').hidden = false;
    $('soBanner').href = `sellout.html?bulan=${soMonth}${one ? '&toko=' + encodeURIComponent(one.storeId) : ''}`;
    $('soBanner').classList.toggle('done', all);
    $('soTitle').textContent = `Sell out ${App.monthName(soMonth)}${one ? ' · ' + one.name : ''}`;
    $('soText').textContent = all
      ? `Sudah diisi · ${new Set(lines.map(l => l.productId)).size} produk · ${App.num(lines.reduce((a, l) => a + l.qty, 0))} unit`
      : one ? 'Belum diisi untuk toko ini' : `Belum diisi untuk ${list.length - done.length} dari ${list.length} toko`;
    $('soAction').textContent = all ? 'Lihat' : 'Isi';
  }
  async function loadSellOut() {
    const res = await D.myActuals({ month: soMonth });
    if (res.error) return;
    soRows = res.rows;
    const sh = D.getShift(owner.id, date);
    renderSellOut(sh && sh.storeId);
  }
  if (isSpg) loadSellOut();

  /* ----- Render ----- */
  const openStores = new Set(), seenStores = new Set();
  $('list').addEventListener('click', e => {
    const head = e.target.closest('.tx-store-head');
    if (!head) return;
    const rows = head.nextElementSibling, show = rows.hidden;
    rows.hidden = !show;
    head.setAttribute('aria-expanded', show);
    if (show) openStores.add(head.dataset.store); else openStores.delete(head.dataset.store);
  });
  // A store whose sales are all on other pages is hidden too
  const pagedTx = App.pagedList($('list'), { label: 'transaksi', rows: '.tx-row',
    after: () => $('list').querySelectorAll('.tx-store').forEach(g => { g.hidden = !g.querySelector('.tx-row:not([hidden])'); }) });
  function render() {
    const shift = D.getShift(owner.id, date);
    const report = D.getReport(owner.id, date);
    // Newest first by time; sales without a time (added afterwards) keep their order at the end
    const tx = D.getTransactions(report).map((t, i) => [t, i]).sort((a, b) => (b[0].time || '').localeCompare(a[0].time || '') || b[1] - a[1]).map(x => x[0]);
    const canEdit = D.canEdit(user, owner.id, date);
    const needsShift = isSpg && isToday && !shift;
    const canAdd = canEdit && !needsShift;

    $('startWrap').hidden = !needsShift;
    $('shift').textContent = shift ? (shift.end ? `Shift ${shift.start}–${shift.end} selesai` : `Shift berjalan sejak ${shift.start}`) : '';
    $('endShift').hidden = !(isSpg && isToday && shift && !shift.end);
    const curStore = shift && D.store(shift.storeId);
    $('shiftCard').hidden = !shift;
    $('storeName').textContent = curStore ? curStore.name : 'Toko tidak diketahui';
    $('storeCity').textContent = curStore ? [curStore.chain, curStore.city].filter(Boolean).join(' · ') : '';
    $('storePhoto').src = App.storeSrc(curStore);
    renderSellOut(shift && shift.storeId);
    $('switchStore').hidden = !(isSpg && isToday && shift && !shift.end);

    $('entry').hidden = !canAdd;
    $('saleStoreField').hidden = !!shift;
    $('late').hidden = !(canAdd && (!isToday || (shift && shift.end)));
    // The page only loads data from DATA_START on, so sales already recorded for an older day aren't listed
    $('late').textContent = date < D.DATA_START ? 'Tambah penjualan yang terlewat. Penjualan lama di tanggal ini tidak ditampilkan di sini.' : 'Tambah penjualan yang terlewat.';

    const shiftPhotos = (shift && shift.photos) || [];
    $('notes').hidden = !shiftPhotos.length;
    $('notePhotos').innerHTML = shiftPhotos.length ? App.notePhotos(shiftPhotos) : '';

    $('dayTitle').textContent = isToday ? 'Hari ini' : App.dateShort(date);
    const total = report ? report.total : 0;
    $('total').textContent = App.rp(total);
    $('count').textContent = report && report.noSales ? 'Tidak ada penjualan' : `${tx.length} transaksi`;
    // How far the day is from the target (the targets of the stores held that month)
    const target = D.progress(owner.id, 'day', date).target;
    $('dayTarget').innerHTML = target > 0
      ? `${App.bar(total / target * 100)}<div class="day-target"><span>${App.pct(total / target * 100)} dari target <b>${App.rp(target)}</b></span><span>${total >= target ? 'Target tercapai' : `Kurang <b>${App.rp(target - total)}</b>`}</span></div>`
      : '<div class="day-target"><span>Belum ada target untuk hari ini</span></div>';

    // Sales grouped by store, the store with the most sales first; newest sale first inside each store
    const byStore = new Map();
    tx.forEach(t => { const k = t.storeId || ''; if (!byStore.has(k)) byStore.set(k, []); byStore.get(k).push(t); });
    const groups = [...byStore].map(([storeId, list]) => ({ storeId, list, sum: list.reduce((a, t) => a + t.qty * t.price, 0) })).sort((a, b) => b.sum - a.sum);
    // Each store folds open and shut. At first only the store of the running shift is open, or the only store of the day.
    groups.forEach(g => {
      if (seenStores.has(g.storeId)) return;
      seenStores.add(g.storeId);
      if (groups.length === 1 || (shift && g.storeId === shift.storeId)) openStores.add(g.storeId);
    });
    $('list').innerHTML = groups.map(g => {
      const st = D.store(g.storeId), open = openStores.has(g.storeId);
      return `<div class="tx-store">
        <button type="button" class="tx-store-head" data-store="${App.esc(g.storeId)}" aria-expanded="${open}"><b>${App.icon('store')}${App.esc(st ? st.name : 'Toko tidak diketahui')}</b><span><b>${App.rp(g.sum)}</b><small>${g.list.length} transaksi</small></span>${App.icon('chevDown')}</button>
        <div class="rows wrap" ${open ? '' : 'hidden'}>${g.list.map(t => `
          <div class="tx-row">
            ${App.productImg(D.product(t.productId))}
            <div class="grow"><b>${App.esc(D.product(t.productId).name)}</b><span>${t.time ? t.time + ' · ' : ''}${t.qty} × ${App.rp(t.price)}</span></div>
            <div class="val">${App.rp(t.qty * t.price)}</div>${canEdit && report.transactions ? App.iconBtn('pencil', 'Ubah transaksi', `data-edit="${t.id}"`) : ''}
          </div>`).join('')}</div>
      </div>`;
    }).join('') || (needsShift ? '' : '<p class="empty">Belum ada penjualan.</p>');
    pagedTx.apply();
  }

  updateSubtotal();
  render();
});
