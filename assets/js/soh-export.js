/*
 * Excel export in the client's monthly "SOH OFFTAKE" layout (one row per SKU, a block of Qty / Val / SOH / Val SOH
 * per store, totals per focus brand at the bottom). SOH is not recorded in the app: those columns stay empty for
 * the team to fill in; Val SOH is a formula, so it fills itself in when they do.
 *
 * SohExport.collect(teamId, mk) gathers the month's numbers (no browser needed: used by tools/test-soh-export.js);
 * SohExport.download(teamId, mk) loads ExcelJS from the CDN on first use and saves the .xlsx.
 */
(function () {
  'use strict';

  const EXCELJS = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGUST', 'SEP', 'OKT', 'NOV', 'DES'];
  // Bottom rows: [label, colour, rows counted]. Subbrand values are the catalog's (from the client's file).
  const FOCUS = [
    ['Total Selling Out Brand Fokus (HANSAPLAST)', '00B0F0', { brand: 'Hansaplast*' }],
    ['Total Selling Out Brand Fokus (Nivea All Purpose Cream)', '002060', { brand: 'NIVEA ALL PURPOSE CREAMS' }],
    ['Total Selling Out Brand Fokus (Nivea Body)', '002060', { brand: 'NIVEA BODY' }],
    ['Total Selling Out Brand Fokus (Nivea Deo)', '002060', { brand: 'NIVEA DEO' }],
    ['Total Selling Out Brand Fokus (Nivea Female Face Care)', '002060', { brand: 'NIVEA FEMALE FACE CARE' }],
    ['Total Selling Out Brand Fokus (Nivea Lip Care)', '002060', { brand: 'NIVEA LIP CARE' }],
    ['Total Selling Out Brand Fokus (Nivea Men Face Care)', '002060', { brand: 'NIVEA MEN FACE CARE' }],
    ['Total Selling Out Brand Fokus (Nivea Sun)', '002060', { brand: 'NIVEA SUN' }],
    ['Total Selling Out Brand Fokus (HIJAB Body & Deo)', '60CBF3', { name: '*HIJAB*' }],
  ];
  const monthLabel = mk => MONTHS[+mk.slice(5, 7) - 1] + "'" + mk.slice(2, 4);
  // Same matching as Excel's SUMIFS criteria used in the file ("*" = anything, case-insensitive)
  const like = (value, pattern) => new RegExp('^' + pattern.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i').test(value || '');

  /**
   * The month's data for a team: products in catalog order (active ones, plus inactive ones sold that month) and
   * one block per store the team's SPGs sold at, with qty per product, the SPGs and their monthly targets.
   * An SPG's target goes to the store where she sold the most that month (so it is counted once).
   */
  function collect(teamId, mk) {
    const D = window.Data;
    const from = mk + '-01', to = D.monthEnd(from);
    const spgs = D.spgsOf(teamId, true);
    const blocks = {}, byUser = {};
    D.listReports({ userIds: spgs.map(u => u.id), from, to }).forEach(r => D.getTransactions(r).forEach(t => {
      const b = blocks[t.storeId] || (blocks[t.storeId] = { store: D.store(t.storeId) || { id: t.storeId, name: t.storeId }, qty: {}, spgs: new Set(), target: 0 });
      b.qty[t.productId] = (b.qty[t.productId] || 0) + t.qty;
      b.spgs.add(r.userId);
      const u = byUser[r.userId] || (byUser[r.userId] = {});
      u[t.storeId] = (u[t.storeId] || 0) + t.qty * t.price;
    }));
    Object.keys(byUser).forEach(uid => {
      const main = Object.keys(byUser[uid]).sort((a, b) => byUser[uid][b] - byUser[uid][a])[0];
      const t = D.targetRow(uid, mk);
      if (t && t.monthly) blocks[main].target += t.monthly;
    });
    const order = D.stores(true).map(s => s.id);
    const list = Object.values(blocks)
      .sort((a, b) => (order.indexOf(a.store.id) + 1 || 1e9) - (order.indexOf(b.store.id) + 1 || 1e9))
      .map(b => ({ store: b.store, qty: b.qty, target: b.target, spgs: [...b.spgs].map(id => D.user(id).name) }));
    const sold = id => list.some(b => b.qty[id]);
    const products = D.products(true).filter(p => p.active || sold(p.id));
    return { mk, label: monthLabel(mk), team: D.team(teamId), products, blocks: list.length ? list : [{ store: null, qty: {}, target: 0, spgs: [] }] };
  }

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

  async function build(data) {
    const ExcelJS = await loadExcelJs();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('SOH OFFTAKE ' + data.label, { views: [{ state: 'frozen', xSplit: 6, ySplit: 11 }] });
    const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + argb } });
    const thin = { style: 'thin', color: { argb: 'FF000000' } };
    const box = { top: thin, left: thin, bottom: thin, right: thin };
    const white = { bold: true, color: { argb: 'FFFFFFFF' } };
    const col = n => { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
    const merge = (r1, c1, r2, c2) => { if (r2 > r1 || c2 > c1) ws.mergeCells(r1, c1, r2, c2); };
    const FIRST = 12, last = FIRST + data.products.length - 1;
    const blockCol = i => 7 + i * 4; // G, K, O, ...
    const remarkCol = blockCol(data.blocks.length);

    [6.8, 13.2, 64.3, 32, 19.7, 18.2].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    for (let c = 7; c < remarkCol; c++) ws.getColumn(c).width = 14.2;
    ws.getColumn(remarkCol).width = 15.3;

    // Legend (as in the client's file)
    ws.getCell('D1').value = 'Legend';
    [['Change Price', null], ['Change Description', '92D050'], ['NPD (New Product)', 'FFFF00'], ['Delisted/Deleted', 'FF0000']].forEach(([label, c], i) => {
      if (c) ws.getCell(2 + i, 4).fill = fill(c);
      ws.getCell(2 + i, 5).value = label;
    });
    [['002060', 'DIISI NAMA NMA'], [null, 'DIISI KODE USERNAME NMA'], ['00B0F0', 'DIISI NAMA OLAPS STORE NMA'], ['FFFF00', 'DIISI KODE STORE NMA']].forEach(([c, label], i) => {
      if (c) ws.getCell(2 + i, 7).fill = fill(c);
      ws.getCell(2 + i, 8).value = label;
    });

    // Header: product columns (rows 7–11), then one block per store, then REMARK
    ['NO', 'KODE SKU', 'Nama SKU di HO', 'Subbrand', 'UPDATE PRICE', 'Barcode'].forEach((h, i) => {
      merge(7, i + 1, 11, i + 1);
      Object.assign(ws.getCell(7, i + 1), { value: h, font: { bold: true }, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true } });
    });
    data.blocks.forEach((b, i) => {
      const c = blockCol(i);
      [[7, b.spgs.join(', '), '002060', white], [8, '', null, null], [9, b.store ? b.store.name : '', '00B0F0', { bold: true }], [10, '', 'FFFF00', null]].forEach(([r, v, f, font]) => {
        merge(r, c, r, c + 3);
        const cell = ws.getCell(r, c);
        cell.value = v;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        if (f) cell.fill = fill(f);
        if (font) cell.font = font;
      });
      [['Qty', 'FF00FF'], ['Val', '83CAEB'], ['SOH', null], ['Val SOH', null]].forEach(([h, f], j) => {
        const cell = ws.getCell(11, c + j);
        Object.assign(cell, { value: h, font: { bold: true }, alignment: { horizontal: 'center' } });
        if (f) cell.fill = fill(f);
      });
    });
    merge(7, remarkCol, 11, remarkCol);
    Object.assign(ws.getCell(7, remarkCol), { value: 'REMARK', font: { bold: true }, alignment: { horizontal: 'center', vertical: 'middle' } });

    // One row per product. Val = Qty × price; Val SOH = SOH × price (SOH typed in later)
    data.products.forEach((p, n) => {
      const r = FIRST + n;
      [n + 1, p.sku, p.name, p.brand || '', p.price, p.barcode || ''].forEach((v, i) => { ws.getCell(r, i + 1).value = v; });
      ws.getCell(r, 5).numFmt = '#,##0';
      data.blocks.forEach((b, i) => {
        const c = blockCol(i), q = b.qty[p.id] || 0;
        if (q) ws.getCell(r, c).value = q;
        ws.getCell(r, c + 1).value = { formula: `IF(${col(c)}${r}="","",${col(c)}${r}*$E${r})`, result: q ? q * p.price : '' };
        ws.getCell(r, c + 3).value = { formula: `IF(${col(c + 2)}${r}="","",${col(c + 2)}${r}*$E${r})`, result: '' };
        [c + 1, c + 3].forEach(x => { ws.getCell(r, x).numFmt = '#,##0'; });
      });
    });

    // Totals: everything, then per focus brand; each with a target and achievement row
    let r = last + 1;
    const sumCol = (c, crit) => {
      const range = `${col(c)}$${FIRST}:${col(c)}$${last}`;
      if (!crit) return `SUM(${range})`;
      return crit.brand ? `SUMIFS(${range},$D$${FIRST}:$D$${last},"${crit.brand}")` : `SUMIFS(${range},$C$${FIRST}:$C$${last},"${crit.name}")`;
    };
    const value = (b, crit, val) => data.products.filter(p => !crit || (crit.brand ? like(p.brand, crit.brand) : like(p.name, crit.name)))
      .reduce((a, p) => a + (b.qty[p.id] || 0) * (val ? p.price : 1), 0);
    const group = (label, colour, crit, target) => {
      const font = colour === '002060' ? white : { bold: true };
      const rows = [r, r + 1, r + 2];
      [label, crit ? 'Target BRAND FOCUS' : 'Target NIVEA dan Hansaplast', crit ? 'Achievment BRAND FOCUS' : 'Achievment NIVEA dan Hansaplast'].forEach((l, k) => {
        merge(rows[k], 1, rows[k], 6);
        Object.assign(ws.getCell(rows[k], 1), { value: l, font });
        for (let c = 1; c < remarkCol; c++) ws.getCell(rows[k], c).fill = fill(colour);
      });
      data.blocks.forEach((b, i) => {
        const c = blockCol(i);
        [0, 1, 2, 3].forEach(j => {
          const cell = ws.getCell(r, c + j);
          cell.value = { formula: sumCol(c + j, crit), result: j === 0 ? value(b, crit, false) : j === 1 ? value(b, crit, true) : 0 };
          cell.numFmt = '#,##0';
          cell.font = font;
        });
        merge(r + 1, c, r + 1, c + 1);
        merge(r + 2, c, r + 2, c + 1);
        const t = target(b);
        if (t) Object.assign(ws.getCell(r + 1, c), { value: t, numFmt: '#,##0', font });
        Object.assign(ws.getCell(r + 2, c), {
          value: { formula: `IF(N(${col(c)}${r + 1})=0,"",${col(c + 1)}${r}/${col(c)}${r + 1})`, result: t ? value(b, crit, true) / t : '' },
          numFmt: '0%', font,
        });
      });
      r += 3;
    };
    group('Total Selling Out (NIVEA + HANSA)', 'FFC000', null, b => b.target);
    FOCUS.forEach(([label, colour, crit]) => group(label, colour, crit, () => 0));

    for (let y = 7; y < r; y++) for (let c = 1; c <= remarkCol; c++) ws.getCell(y, c).border = box;
    return wb.xlsx.writeBuffer();
  }

  async function download(teamId, mk) {
    const data = collect(teamId, mk);
    const buf = await build(data);
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `SOH OFFTAKE ${data.team.name} ${data.label}.xlsx` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.SohExport = { collect, build, download, monthLabel };
})();
