/*
 * Daily recap per SPG as an Excel file, in the team's recap layout: day names over the dates, each day's sales per
 * SPG (OFF in yellow on days off, red when a working day has no report), then Total Achievement, TOTAL TARGET and Ach.
 * The numbers come from the server (action report.dailyRecap, apps-script/Export.gs); ExcelJS is loaded from the CDN
 * on first use. RecapExport.download(recap) saves the .xlsx.
 */
(function () {
  'use strict';

  const EXCELJS = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
  const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const dow = d => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))).getUTCDay();
  const dmy = d => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);

  let loading = null;
  function loadExcelJs() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (!loading) {
      loading = new Promise((resolve, reject) => {
        const s = Object.assign(document.createElement('script'), { src: EXCELJS, onload: () => resolve(window.ExcelJS), onerror: () => { loading = null; reject(new Error('ExcelJS')); } });
        document.head.append(s);
      });
    }
    return loading;
  }

  async function build(r) {
    const ExcelJS = await loadExcelJs();
    const multi = r.teams.length > 1;
    const lead = multi ? 2 : 1;                  // Nama NMA (+ Tim)
    const first = lead + 1, n = r.days.length;   // first day column, number of days
    const totalCol = first + n, cols = totalCol + 2;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Rekap harian', { views: [{ state: 'frozen', xSplit: lead, ySplit: 2 }] });
    const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + argb } });
    const thin = { style: 'thin', color: { argb: 'FF000000' } };
    const set = (row, col, value, style) => { const c = ws.getCell(row, col); c.value = value; if (style) Object.assign(c, style); return c; };

    ws.getColumn(1).width = 24;
    if (multi) ws.getColumn(2).width = 18;
    for (let c = first; c < totalCol; c++) ws.getColumn(c).width = 13;
    ws.getColumn(totalCol).width = 17;
    ws.getColumn(totalCol + 1).width = 17;
    ws.getColumn(totalCol + 2).width = 8;

    // Row 1: day names (orange on days off); row 2: headers
    r.days.forEach((d, i) => set(1, first + i, DAY_NAMES[dow(d)], Object.assign({ alignment: { horizontal: 'center' } }, r.offDays[i] ? { fill: fill('FFC000') } : {})));
    const header = ['Nama NMA'].concat(multi ? ['Tim'] : [], r.days.map(dmy), ['Total Achievement', 'TOTAL TARGET', 'Ach']);
    header.forEach((h, i) => set(2, i + 1, h, {
      font: { bold: true, color: { argb: i + 1 < totalCol ? 'FFFFFFFF' : 'FF000000' } },
      fill: fill(i + 1 < totalCol ? '4472C4' : i + 1 === totalCol ? 'FFC000' : i + 1 === totalCol + 1 ? 'F4B183' : 'FFFFFF'),
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    }));
    ws.getRow(2).height = 32;

    // One row per SPG
    r.rows.forEach((x, k) => {
      const row = 3 + k;
      set(row, 1, x.name, { font: { bold: true } });
      if (multi) set(row, 2, x.team);
      x.cells.forEach((c, j) => {
        const cell = set(row, first + j, c === 'MISSING' ? null : c === '' ? null : c, { numFmt: '#,##0' });
        if (c === 'OFF') cell.fill = fill('FFFF00');
        else if (c === 'MISSING') cell.fill = fill('FF0000');
        else cell.alignment = { horizontal: 'right' };
      });
      set(row, totalCol, x.total, { numFmt: '#,##0', font: { bold: true }, fill: fill('DDEBF7') });
      set(row, totalCol + 1, x.target || null, { numFmt: '#,##0', font: { bold: true }, fill: fill('D9D9D9') });
      set(row, totalCol + 2, x.ach === null ? null : x.ach, { numFmt: '0%' });
    });
    const last = 2 + Math.max(r.rows.length, 1);
    for (let y = 2; y <= last; y++) for (let c = 1; c <= cols; c++) ws.getCell(y, c).border = { top: thin, left: thin, bottom: thin, right: thin };
    if (r.rows.length) ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: last, column: cols } };
    return wb.xlsx.writeBuffer();
  }

  async function download(r) {
    const buf = await build(r);
    const label = r.teams.length > 1 ? 'Semua tim' : 'Tim ' + r.teams[0].name;
    const span = r.days[0].split('-').reverse().join('-') + ' sd ' + r.days[r.days.length - 1].split('-').reverse().join('-');
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `Rekap Harian SPG ${label} ${span}.xlsx` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* Ranking tables in the team's layout: blue name and % columns, green number columns with a second header line,
   * a colored dot next to the %, numbered rows and a yellow total. t: { nameHeader, numbered, cols: [{ title, sub, key }], pctHeader, rows, total };
   * each row: { name, [key], pct, dot }, dot: 'hi' | 'mid' | 'lo' | null. Returns the first free column to the right. */
  const DOTS = { hi: '5B9BD5', mid: 'F4B6A6', lo: 'FF5050' };
  function rankTable(ws, top, left, t) {
    const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + argb } });
    const thin = { style: 'thin', color: { argb: 'FF000000' } }, border = { top: thin, left: thin, bottom: thin, right: thin };
    const center = { horizontal: 'center', vertical: 'middle', wrapText: true };
    const blue = { fill: fill('001489'), font: { bold: true, color: { argb: 'FFFFFF00' } }, alignment: center, border };
    const green = { fill: fill('92D050'), font: { bold: true }, alignment: center, border };
    const numCol = t.numbered ? left : null, nameCol = left + (t.numbered ? 1 : 0), firstNum = nameCol + 1;
    const dotCol = firstNum + t.cols.length, pctCol = dotCol + 1;
    const header = (row, col, value, style) => Object.assign(ws.getCell(row, col), { value }, style);

    if (t.numbered) ws.getColumn(numCol).width = 4;
    ws.getColumn(nameCol).width = 30;
    header(top, nameCol, t.nameHeader, blue);
    ws.mergeCells(top, nameCol, top + 1, nameCol);
    t.cols.forEach((c, i) => {
      ws.getColumn(firstNum + i).width = 17;
      header(top, firstNum + i, c.title, green);
      header(top + 1, firstNum + i, c.sub, green);
    });
    ws.getColumn(dotCol).width = 3;
    ws.getColumn(pctCol).width = 8;
    header(top, dotCol, t.pctHeader, blue);
    ws.getCell(top, pctCol).border = border;
    ws.mergeCells(top, dotCol, top + 1, pctCol);
    ws.getRow(top).height = 22;
    ws.getRow(top + 1).height = 30;

    const put = (rowNo, x, total) => {
      const style = total ? { fill: fill('FFC000'), font: { bold: true } } : {};
      Object.assign(ws.getCell(rowNo, nameCol), { value: x.name, border }, style);
      t.cols.forEach((c, i) => Object.assign(ws.getCell(rowNo, firstNum + i), { value: x[c.key] === undefined ? null : x[c.key], numFmt: '#,##0', border }, style));
      Object.assign(ws.getCell(rowNo, dotCol), { value: x.dot ? '●' : null, border: { top: thin, left: thin, bottom: thin }, alignment: { horizontal: 'center' } }, style);
      if (x.dot) ws.getCell(rowNo, dotCol).font = { size: 14, color: { argb: 'FF' + DOTS[x.dot] } };
      Object.assign(ws.getCell(rowNo, pctCol), { value: x.pct === null ? null : x.pct, numFmt: '0%', border: { top: thin, bottom: thin, right: thin }, alignment: { horizontal: 'right' } }, style);
    };
    t.rows.forEach((x, i) => {
      if (t.numbered) Object.assign(ws.getCell(top + 2 + i, numCol), { value: i + 1, alignment: { horizontal: 'right' } });
      put(top + 2 + i, x);
    });
    put(top + 2 + t.rows.length, t.total, true);
    return pctCol + 2;
  }
  async function saveWorkbook(wb, name) {
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const shortDate = d => `${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]}`;
  const rangeLabel = (from, to) => (from.slice(5) === '01-01' && from.slice(0, 4) === to.slice(0, 4)
    ? 'FULL YEAR ' + from.slice(2, 4)
    : `${shortDate(from)} – ${shortDate(to)} ${to.slice(2, 4)}`);
  const achDot = ach => (ach === null ? null : ach >= 1 ? 'hi' : ach >= 0.9 ? 'mid' : 'lo');

  // Laporan, tab Pencapaian: the SPG table and, to its right, the store table (r: action report.achievement)
  async function buildAchievement(r) {
    const ExcelJS = await loadExcelJs();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Pencapaian', { views: [{ showGridLines: false }] });
    const sub = rangeLabel(r.from, r.to);
    const table = (nameHeader, numbered, rows) => {
      const target = rows.reduce((a, x) => a + x.target, 0), offtake = rows.reduce((a, x) => a + x.offtake, 0), pct = target > 0 ? offtake / target : null;
      return {
        nameHeader, numbered, pctHeader: 'Ach%',
        cols: [{ title: 'TARGET', sub, key: 'target' }, { title: 'OFFTAKE', sub, key: 'offtake' }],
        rows: rows.map(x => ({ name: x.name, target: x.target, offtake: x.offtake, pct: x.ach, dot: achDot(x.ach) })),
        total: { name: 'Total', target, offtake, pct, dot: achDot(pct) },
      };
    };
    ws.getColumn(1).width = 3;
    const next = rankTable(ws, 2, 2, table('SPG', false, r.spgs));
    rankTable(ws, 2, next, table('Store', true, r.stores));
    return wb;
  }
  async function downloadAchievement(r, teamName) {
    await saveWorkbook(await buildAchievement(r), `Pencapaian Tim ${teamName} ${r.from} sd ${r.to}.xlsx`);
  }

  // Laporan, tab Sell In & Sell Out: stores of one month, closest match between daily sales and sell out first, not yet entered last
  async function buildSellIn(rows, month) {
    const ExcelJS = await loadExcelJs();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sell In & Sell Out', { views: [{ showGridLines: false }] });
    const sub = `${MONTHS[+month.slice(5, 7) - 1]} ${month.slice(2, 4)}`;
    const pctOf = x => (x.actual ? x.sellOut / x.actual : null);
    const dotOf = p => (p === null ? null : Math.abs(p - 1) <= 0.1 ? 'hi' : 'lo');
    const sorted = rows.slice().sort((a, b) => (pctOf(b) === null ? -1 : pctOf(b)) - (pctOf(a) === null ? -1 : pctOf(a)) || String(a.name).localeCompare(String(b.name)));
    const sum = (list, k) => list.reduce((a, x) => a + (x[k] || 0), 0);
    const filled = rows.filter(x => x.actual);
    const totalPct = filled.length ? sum(filled, 'sellOut') / sum(filled, 'actual') : null;
    ws.getColumn(1).width = 3;
    rankTable(ws, 2, 2, {
      nameHeader: 'Store', numbered: true, pctHeader: 'Harian / Sell out',
      cols: [{ title: 'SELL IN', sub, key: 'sellIn' }, { title: 'SELL OUT', sub, key: 'actual' }, { title: 'PENJUALAN HARIAN', sub, key: 'sellOut' }, { title: 'SELISIH', sub, key: 'gap' }],
      rows: sorted.map(x => ({ name: x.name, sellIn: x.sellIn, actual: x.actual, sellOut: x.sellOut, gap: x.actual ? x.sellOut - x.actual : null, pct: pctOf(x), dot: dotOf(pctOf(x)) })),
      total: { name: 'Total', sellIn: sum(rows, 'sellIn'), actual: sum(filled, 'actual'), sellOut: sum(rows, 'sellOut'), gap: filled.length ? sum(filled, 'sellOut') - sum(filled, 'actual') : null, pct: totalPct, dot: dotOf(totalPct) },
    });
    return wb;
  }
  async function downloadSellIn(rows, month, teamName) {
    await saveWorkbook(await buildSellIn(rows, month), `Sell In Sell Out Tim ${teamName} ${month}.xlsx`);
  }

  /* Sell out of a month in the company's form (Form 201 SKU): one row per product, and per store a block of Qty and Val
   * (the units and rupiah the SPG entered) under the SPG's name and code and the store's name and code; then the totals
   * against the store's target and per focus brand. r: action report.sellOut (apps-script/Actuals.gs). */
  const FOCUS = [
    ['HANSAPLAST', p => /^hansaplast/i.test(p.brand)],
    ['Nivea All Purpose Cream', p => /all purpose/i.test(p.brand)],
    ['Nivea Body', p => /nivea body/i.test(p.brand)],
    ['Nivea Deo', p => /nivea deo/i.test(p.brand)],
    ['Nivea Female Face Care', p => /female face/i.test(p.brand)],
    ['Nivea Lip Care', p => /lip care/i.test(p.brand)],
    ['Nivea Men Face Care', p => /men face/i.test(p.brand)],
    ['Nivea Sun', p => /nivea sun/i.test(p.brand)],
    ['HIJAB Body & Deo', p => /hijab/i.test(p.name)],
  ];
  async function buildSellOutForm(r) {
    const ExcelJS = await loadExcelJs();
    const wb = new ExcelJS.Workbook();
    wb.calcProperties.fullCalcOnLoad = true; // Excel works out the totals when the file is opened
    const ws = wb.addWorksheet('Sell Out ' + r.month, { views: [{ state: 'frozen', xSplit: 6, ySplit: 11 }] });
    const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + argb } });
    const thin = { style: 'thin', color: { argb: 'FF000000' } }, border = { top: thin, left: thin, bottom: thin, right: thin };
    const center = { horizontal: 'center', vertical: 'middle', wrapText: true };
    const col = n => { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
    const put = (row, c, value, style) => Object.assign(ws.getCell(row, c), { value }, style || {});
    const first = 12, last = first + r.products.length - 1, sumRow = last + 1;

    const monthName = ['JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI', 'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'][+r.month.slice(5, 7) - 1];
    put(1, 1, `SELL OUT ${monthName} ${r.month.slice(0, 4)}`, { font: { bold: true, size: 14 } });
    put(2, 1, 'Tim ' + r.team);
    put(3, 1, 'Dari aplikasi Laporan SPG, diisi SPG dari laporan bulanan toko.', { font: { italic: true, color: { argb: 'FF6B7280' } } });
    [['NO', 6], ['KODE SKU', 10], ['Nama SKU di HO', 44], ['Subbrand', 26], ['PRICE', 12], ['Barcode', 16]].forEach(([h, w], i) => {
      ws.getColumn(i + 1).width = w;
      put(7, i + 1, h, { font: { bold: true }, fill: fill('D9E1F2'), alignment: center, border });
      ws.mergeCells(7, i + 1, 11, i + 1);
    });

    r.products.forEach((p, i) => {
      const row = first + i;
      [i + 1, p.sku, p.name, p.brand, p.price, p.barcode].forEach((v, k) => put(row, k + 1, v, { border, numFmt: k === 4 ? '#,##0' : undefined }));
    });

    // One block of two columns per store
    r.stores.forEach((st, k) => {
      const c = 7 + k * 2;
      [st.spg, st.spgCode, st.name, st.code].forEach((v, i) => {
        put(7 + i, c, v || '', { font: { bold: i === 0 || i === 2 }, fill: fill(i < 2 ? 'FFF2CC' : 'E2EFDA'), alignment: center, border });
        ws.mergeCells(7 + i, c, 7 + i, c + 1);
      });
      ['Qty', 'Val'].forEach((h, i) => { ws.getColumn(c + i).width = i ? 14 : 9; put(11, c + i, h, { font: { bold: true }, fill: fill('D9E1F2'), alignment: center, border }); });
      r.products.forEach((p, i) => {
        const row = first + i, x = st.items[p.id] || {};
        put(row, c, x.qty || null, { border });
        put(row, c + 1, x.value || 0, { border, numFmt: '#,##0' });
      });
    });

    // Totals: all products against the store's target, then each focus brand (its product rows can be apart)
    const runs = test => {
      const out = [];
      r.products.forEach((p, i) => { if (!test(p)) return; const row = first + i; const last = out[out.length - 1]; if (last && last[1] === row - 1) last[1] = row; else out.push([row, row]); });
      return out;
    };
    const sumOf = (c, rs) => (rs.length ? rs.map(([a, b]) => `SUM(${col(c)}${a}:${col(c)}${b})`).join('+') : '0');
    const block = (row, label, rs, target, bold) => {
      const lines = [`Total Selling Out ${label}`, label === '(NIVEA + HANSA)' ? 'Target NIVEA dan Hansaplast' : 'Target BRAND FOCUS', label === '(NIVEA + HANSA)' ? 'Achievment NIVEA dan Hansaplast' : 'Achievment BRAND FOCUS'];
      lines.forEach((t, i) => { put(row + i, 1, t, { font: { bold: bold || i === 0 }, border }); ws.mergeCells(row + i, 1, row + i, 6); });
      r.stores.forEach((st, k) => {
        const c = 7 + k * 2;
        [0, 1].forEach(i => put(row, c + i, { formula: sumOf(c + i, rs), result: 0 }, { font: { bold: true }, fill: fill('FFF2CC'), border, numFmt: '#,##0' }));
        put(row + 1, c, target ? target(st) : null, { border, numFmt: '#,##0' });
        ws.mergeCells(row + 1, c, row + 1, c + 1);
        put(row + 2, c, { formula: `IFERROR(${col(c + 1)}${row}/${col(c)}${row + 1},"")`, result: '' }, { border, numFmt: '0%' });
        ws.mergeCells(row + 2, c, row + 2, c + 1);
      });
      return row + 3;
    };
    let row = block(sumRow, '(NIVEA + HANSA)', [[first, last]], st => st.target || null, true);
    FOCUS.forEach(([label, test]) => { row = block(row, `Brand Fokus (${label})`, runs(test)); });
    return wb;
  }
  async function downloadSellOutForm(r) {
    await saveWorkbook(await buildSellOutForm(r), `Sell Out Tim ${r.team} ${r.month}.xlsx`);
  }

  window.RecapExport = { build, download, buildAchievement, downloadAchievement, buildSellIn, downloadSellIn, buildSellOutForm, downloadSellOutForm };
})();
