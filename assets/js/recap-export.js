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

  window.RecapExport = { build, download };
})();
