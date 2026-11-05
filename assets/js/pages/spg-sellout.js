/* Sell out bulanan: the SPG copies each store's monthly report, line by line like daily sales (product, units, price).
 * Last month by default; any month can be changed later. Each change is saved at once (apps-script/Actuals.gs, called actual there). */
Data.ready(function () {
  'use strict';
  const user = App.init({ roles: ['spg'] });
  if (!user) return;
  const D = Data, $ = id => document.getElementById(id);
  const thisMonth = D.monthKey(D.TODAY);
  let month = /^\d{4}-\d{2}$/.test(App.param('bulan') || '') && App.param('bulan') <= thisMonth ? App.param('bulan') : D.addMonths(thisMonth, -1);
  let rows = [], storeId = App.param('toko') || null, seq = 0;
  const MAX_QTY = 1000000;
  const linesOf = r => (r && Array.isArray(r.items) ? r.items : []);
  const lines = () => linesOf(rows.find(r => r.storeId === storeId));
  const newId = () => 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* ----- Product entry (as on Penjualan) ----- */
  const options = '<option value=""></option>' + D.products().map(p => `<option value="${p.id}" data-img="${App.esc(App.productSrc(p))}">${App.esc(p.name)}</option>`).join('');
  $('product').innerHTML = options;
  App.combobox($('product'));
  const qty = () => Math.max(1, Math.floor(+$('qty').value || 1));
  const updateSubtotal = () => { $('subtotal').textContent = App.rp(qty() * App.parseNum($('price').value)); };
  $('product').addEventListener('change', () => {
    const p = D.product($('product').value);
    App.setMoney($('price'), p ? p.price : 0);
    $('preview').innerHTML = p ? App.productImg(p, 'lg') : '';
    $('preview').hidden = !p;
    updateSubtotal();
  });
  $('minus').addEventListener('click', () => { $('qty').value = Math.max(1, qty() - 1); updateSubtotal(); });
  $('plus').addEventListener('click', () => { $('qty').value = qty() + 1; updateSubtotal(); });
  App.moneyInput($('price'));
  ['qty', 'price'].forEach(id => $(id).addEventListener('input', updateSubtotal));

  // Every change sends the store's whole list for the month
  async function save(next, message) {
    const row = rows.find(r => r.storeId === storeId);
    const res = await App.busy($('entry'), () => D.saveActuals({ month, rows: [{ storeId, items: next, note: row.note || '' }] }));
    if (res.error) { App.toast(res.error); return false; }
    rows = res.rows;
    App.toast(message);
    render();
    return true;
  }
  $('entry').addEventListener('submit', async e => {
    e.preventDefault();
    const productId = $('product').value;
    if (!productId) { App.toast('Pilih produk dulu.'); $('product')._combo.flash(); return; }
    const q = Number($('qty').value);
    if (!Number.isInteger(q) || q < 1 || q > MAX_QTY) { App.toast(`Jumlah harus 1–${App.num(MAX_QTY)}.`); $('qty').focus(); return; }
    const price = App.parseNum($('price').value);
    if (!(price > 0) || price > 1e9) { App.toast('Isi harga yang benar.'); $('price').focus(); return; }
    if (await save([{ id: newId(), productId, qty: q, price }, ...lines()], `Tersimpan: ${q} × ${D.product(productId).name}`)) {
      $('product').value = '';
      $('product').dispatchEvent(new Event('change'));
      $('qty').value = 1;
      updateSubtotal();
    }
  });

  /* ----- Change or delete a line ----- */
  const txDlg = App.modal($('txDlg'));
  let editing = null;
  $('txProduct').innerHTML = options;
  App.combobox($('txProduct'));
  App.moneyInput($('txPrice'));
  const txSubtotal = () => { $('txSubtotal').textContent = App.rp(Math.max(1, Math.floor(+$('txQty').value || 1)) * App.parseNum($('txPrice').value)); };
  ['txQty', 'txPrice'].forEach(id => $(id).addEventListener('input', txSubtotal));
  $('txProduct').addEventListener('change', () => { const p = D.product($('txProduct').value); if (p && editing && p.id !== editing.productId) App.setMoney($('txPrice'), p.price); txSubtotal(); });
  $('list').addEventListener('click', e => {
    const b = e.target.closest('[data-edit]');
    if (!b) return;
    editing = lines().find(l => l.id === b.dataset.edit);
    if (!editing) return;
    $('txProduct').value = editing.productId;
    $('txProduct')._combo.sync();
    $('txQty').value = editing.qty;
    App.setMoney($('txPrice'), editing.price);
    txSubtotal();
    txDlg.open();
  });
  $('txForm').addEventListener('submit', async e => {
    e.preventDefault();
    const productId = $('txProduct').value, q = Number($('txQty').value), price = App.parseNum($('txPrice').value);
    if (!productId) { App.toast('Pilih produk dulu.'); return; }
    if (!Number.isInteger(q) || q < 1 || q > MAX_QTY) { App.toast(`Jumlah harus 1–${App.num(MAX_QTY)}.`); return; }
    if (!(price > 0) || price > 1e9) { App.toast('Isi harga yang benar.'); return; }
    if (productId === editing.productId && q === editing.qty && price === editing.price) { txDlg.close(); return; }
    if (await save(lines().map(l => (l.id === editing.id ? { id: l.id, productId, qty: q, price } : l)), 'Sell out diubah.')) txDlg.close();
  });
  $('txDelete').addEventListener('click', async () => {
    const what = `${editing.qty} × ${D.product(editing.productId).name} (${App.rp(editing.qty * editing.price)})`;
    if (!await App.confirm(`${what} dihapus dari sell out.`, { title: 'Hapus baris ini?', ok: 'Hapus', danger: true })) return;
    if (await save(lines().filter(l => l.id !== editing.id), 'Baris dihapus.')) txDlg.close();
  });

  /* ----- Month and store ----- */
  async function load() {
    const mine = ++seq;
    $('month').textContent = App.monthName(month);
    $('next').disabled = month >= thisMonth;
    $('page').hidden = true;
    $('status').hidden = false;
    $('status').innerHTML = App.loadingText;
    const res = await D.myActuals({ month });
    if (mine !== seq) return;
    if (res.error) { $('status').textContent = res.error; return; }
    rows = res.rows;
    if (!rows.some(r => r.storeId === storeId)) storeId = rows.length ? rows[0].storeId : null;
    $('status').hidden = !!rows.length;
    $('status').textContent = 'Kamu tidak memegang toko di bulan ini.';
    $('page').hidden = !rows.length;
    render();
  }
  function render() {
    $('stores').hidden = rows.length < 2;
    $('stores').innerHTML = rows.map(r => `<button type="button" data-k="${App.esc(r.storeId)}" class="${r.storeId === storeId ? 'on' : ''}">${App.esc(r.name)}${linesOf(r).length ? ' ✓' : ''}</button>`).join('');
    const row = rows.find(r => r.storeId === storeId);
    if (!row) return;
    const list = lines(), total = list.reduce((a, l) => a + l.qty * l.price, 0), units = list.reduce((a, l) => a + l.qty, 0);
    $('listTitle').textContent = `${row.name} · ${App.monthName(month)}`;
    $('total').textContent = App.rp(total);
    $('count').textContent = `${list.length} baris`;
    $('units').textContent = `${App.num(units)} unit · ${new Set(list.map(l => l.productId)).size} produk · penjualan harian kamu ${App.rp(row.sellOut)}`;
    $('list').innerHTML = list.map(l => {
      const p = D.product(l.productId) || { name: 'Produk tidak ditemukan' };
      return `<div class="tx-row">
        ${App.productImg(p)}
        <div class="grow"><b>${App.esc(p.name)}</b><span>${App.num(l.qty)} × ${App.rp(l.price)}</span></div>
        <div class="val">${App.rp(l.qty * l.price)}</div>${App.iconBtn('pencil', 'Ubah', `data-edit="${App.esc(l.id)}"`)}
      </div>`;
    }).join('') || '<p class="empty">Belum ada sell out untuk toko ini di bulan ini.</p>';
    history.replaceState(null, '', `${location.pathname}?bulan=${month}${storeId ? '&toko=' + encodeURIComponent(storeId) : ''}`);
  }
  $('stores').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) { storeId = b.dataset.k; render(); } });
  $('prev').addEventListener('click', () => { month = D.addMonths(month, -1); load(); });
  $('next').addEventListener('click', () => { if (month < thisMonth) { month = D.addMonths(month, 1); load(); } });

  updateSubtotal();
  load();
});
