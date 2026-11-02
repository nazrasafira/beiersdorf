Data.ready(function () {
  'use strict';
  const user = App.init({ roles: ['spg'] });
  if (!user) return;
  const D = Data, $ = id => document.getElementById(id);
  const firstMonth = D.monthKey(D.DATA_START), lastMonth = D.monthKey(D.TODAY);
  let mk = App.param('bulan') || lastMonth;
  if (mk < firstMonth || mk > lastMonth) mk = lastMonth;

  const paged = App.pagedList($('list'), { label: 'hari', size: 15 });

  /* ----- Sell out: the store's own monthly figure, typed in by the SPG (actual in the code and Sheet, apps-script/Actuals.gs) ----- */
  let actualSeq = 0, actualDirty = false, actualRows = [];
  const hasActual = r => r.actual !== null && r.actual !== undefined;
  function setActualDirty(v) { actualDirty = v; $('actualSave').hidden = !v; }
  const actualInputs = (r, i) => `
    <div class="field"><label for="act-${i}">Sell out dari laporan toko</label><input class="input" id="act-${i}" data-f="actual" type="text" placeholder="Isi sell out"></div>
    <div class="field"><label for="actn-${i}">Catatan (opsional)</label><input class="input" id="actn-${i}" data-f="note" type="text" maxlength="200" placeholder="Mis. setelah diskon" value="${App.esc(r.note || '')}"></div>`;
  function showActuals(res) {
    actualRows = res.rows;
    setActualDirty(false);
    $('actualWrap').hidden = !res.rows.length;
    const done = res.rows.filter(hasActual).length;
    $('actualCount').textContent = `${done} dari ${res.rows.length} toko sudah diisi`;
    $('actualRows').innerHTML = res.rows.map((r, i) => `<div class="act-row" data-i="${i}">
      <div class="act-head"><b>${App.esc(r.name)}</b>${hasActual(r) ? '<span class="pill ok">Sudah diisi</span>' : '<span class="pill warn">Belum diisi</span>'}</div>
      <small class="muted">Penjualan harian kamu tercatat ${App.rp(r.sellOut)}</small>
      <div data-cell>${hasActual(r)
        ? `<div class="act-saved"><b>${App.rp(r.actual)}</b><button type="button" class="btn ghost small" data-edit>${App.icon('pencil')}Ubah</button></div>${r.note ? `<small class="muted act-note">Catatan: ${App.esc(r.note)}</small>` : ''}`
        : actualInputs(r, i)}</div>
    </div>`).join('');
    $('actualRows').querySelectorAll('[data-f=actual]').forEach(input => App.moneyInput(input));
  }
  async function loadActuals() {
    const mine = ++actualSeq;
    $('actualWrap').hidden = true;
    const res = await D.myActuals({ month: mk });
    if (mine !== actualSeq) return;
    if (res.error) { App.toast(res.error); return; }
    showActuals(res);
  }
  $('actualRows').addEventListener('click', e => {
    if (!e.target.closest('[data-edit]')) return;
    const row = e.target.closest('.act-row'), i = +row.dataset.i, input = (row.querySelector('[data-cell]').innerHTML = actualInputs(actualRows[i], i), row.querySelector('[data-f=actual]'));
    App.moneyInput(input);
    App.setMoney(input, actualRows[i].actual);
    input.focus();
  });
  $('actualRows').addEventListener('input', () => setActualDirty(true));
  $('actualForm').addEventListener('submit', async e => {
    e.preventDefault();
    // Stores still showing their saved amount are left out
    const rows = [...$('actualRows').querySelectorAll('.act-row')].filter(row => row.querySelector('[data-f=actual]')).map(row => {
      const v = row.querySelector('[data-f=actual]').value;
      return { storeId: actualRows[+row.dataset.i].storeId, actual: v ? App.parseNum(v) : null, note: row.querySelector('[data-f=note]').value };
    });
    const res = await App.busy($('actualForm'), () => D.saveActuals({ month: mk, rows }));
    if (res.error) { App.toast(res.error); return; }
    App.toast('Sell out tersimpan.');
    showActuals(res);
  });
  const leaveOk = async () => !actualDirty || App.confirm('Sell out yang belum disimpan akan hilang.', { title: 'Tinggalkan perubahan?', ok: 'Tinggalkan', danger: true });
  window.addEventListener('beforeunload', e => { if (actualDirty) e.preventDefault(); });

  function render() {
    $('month').textContent = App.monthName(mk);
    $('prev').disabled = mk <= firstMonth;
    $('next').disabled = mk >= lastMonth;

    const end = D.monthEnd(mk + '-01') < D.TODAY ? D.monthEnd(mk + '-01') : D.TODAY;
    let workDays = 0, sent = 0, total = 0;

    const since = user.since || ''; // days before the account existed don't count
    $('list').innerHTML = D.eachDay(mk + '-01', end).filter(d => !since || d >= since).reverse().map(d => {
      const working = D.isWorkingDayFor(user.id, d);
      const r = D.getReport(user.id, d);
      if (working) workDays++;
      if (r) { sent++; total += r.total; }

      let status, value = '';
      if (r) {
        const t = D.dailyTarget(user.id, d);
        status = `<span class="pill ok">${App.icon('check')} Terkirim</span>`;
        value = `<b>${App.rp(r.total)}</b>${t ? `<span>${App.pct(r.total / t * 100)} dari target</span>` : ''}`;
      } else if (!working) {
        status = '<span class="pill">Libur</span>';
      } else {
        status = d === D.TODAY ? '<span class="pill warn">Belum ada</span>' : '<span class="pill bad">Tidak lapor</span>';
      }
      const clickable = r || working;
      const tag = clickable ? 'a' : 'div';
      return `<${tag} ${clickable ? `href="${App.page('laporan.html')}?tanggal=${d}"` : ''}>
        <div class="grow"><b>${App.dateShort(d)}</b><div class="status">${status}</div></div>
        <div class="val">${value}</div>
      </${tag}>`;
    }).join('');
    paged.apply();

    App.trendChart($('trend'), D.dailySeries([user.id], [user.teamId], mk + '-01', end));
    $('summary').textContent = `${sent} dari ${workDays} hari kerja dilaporkan · Total ${App.rp(total)}`;
  }

  $('prev').addEventListener('click', async () => { if (!await leaveOk()) return; mk = D.addMonths(mk, -1); paged.reset(); render(); loadActuals(); });
  $('next').addEventListener('click', async () => { if (!await leaveOk()) return; mk = D.addMonths(mk, 1); paged.reset(); render(); loadActuals(); });
  render();
  loadActuals();
});
