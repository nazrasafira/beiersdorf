/*
 * Minimal stand-in for the Google Apps Script services the backend uses (SpreadsheetApp, Utilities,
 * CacheService, LockService, PropertiesService, DriveApp, ContentService, UrlFetchApp), so the real
 * apps-script/*.gs files can run in Node for tests and local development.
 *
 * Like Google Sheets, a cell that is not formatted as plain text ("@") turns "2026-10-22" into a Date,
 * "0812…" into a number and "TRUE" into a boolean; this catches code that forgets the text format.
 *
 * Usage: const gas = require('./gas-mock').load({ DEMO_TODAY: '2026-10-22' }); gas.ctx.setupSheet();
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const signed = buf => Array.from(buf, b => (b > 127 ? b - 256 : b));
const toBuf = (v, charset) => (Array.isArray(v) ? Buffer.from(v.map(b => b & 255)) : Buffer.from(String(v), 'utf8'));

class Range {
  constructor(sheet, row, col, nr, nc) { Object.assign(this, { sheet, row, col, nr, nc }); }
  each(fn) { for (let r = 0; r < this.nr; r++) for (let c = 0; c < this.nc; c++) fn(this.row + r, this.col + c, r, c); }
  getValues() {
    const out = [];
    for (let r = 0; r < this.nr; r++) {
      const line = [];
      for (let c = 0; c < this.nc; c++) {
        const v = (this.sheet.data[this.row - 1 + r] || [])[this.col - 1 + c];
        line.push(v === undefined ? '' : v);
      }
      out.push(line);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(values) {
    if (values.length !== this.nr || values.some(l => l.length !== this.nc)) {
      throw new Error(`The number of rows or columns in the data does not match the range (${values.length}x${values[0] && values[0].length} vs ${this.nr}x${this.nc})`);
    }
    this.each((r, c, i, j) => this.sheet.put(r, c, values[i][j]));
    return this;
  }
  setValue(v) { this.each((r, c) => this.sheet.put(r, c, v)); return this; }
  clearContent() { this.each((r, c) => { if (this.sheet.data[r - 1]) this.sheet.data[r - 1][c - 1] = ''; }); this.sheet.trim(); return this; }
  setNumberFormat(f) { this.each((r, c) => { this.sheet.formats[c] = f; }); return this; } // per column is enough here
  getSheet() { return this.sheet; }
  getRow() { return this.row; }
  getNumRows() { return this.nr; }
  setFontWeight() { return this; }
  setDataValidation() { return this; }
  setBackground(b) { this.each((r) => { this.sheet.backgrounds[r] = b; }); return this; }
  setNote(n) { this.each((r, c) => { this.sheet.notes[r + ',' + c] = n; }); return this; }
}

class Sheet {
  constructor(name) { Object.assign(this, { name, data: [], formats: {}, notes: {}, backgrounds: {}, protections: [] }); }
  getName() { return this.name; }
  getLastRow() { return this.data.length; }
  getMaxRows() { return Math.max(1000, this.data.length); }
  getRange(row, col, nr = 1, nc = 1) {
    if (row < 1 || col < 1 || nr < 1 || nc < 1) throw new Error('Range out of bounds');
    return new Range(this, row, col, nr, nc);
  }
  put(r, c, v) {
    if (this.formats[c] !== '@' && typeof v === 'string') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) v = new Date(v + 'T00:00:00+07:00');
      else if (/^\d+$/.test(v) && v.length < 16) v = Number(v);
      else if (/^(TRUE|FALSE)$/i.test(v)) v = v.toUpperCase() === 'TRUE';
    }
    while (this.data.length < r) this.data.push([]);
    this.data[r - 1][c - 1] = v;
  }
  trim() { while (this.data.length && this.data[this.data.length - 1].every(v => v === '' || v === undefined)) this.data.pop(); }
  setFrozenRows() {}
  protect() { const p = { setDescription: () => p, setWarningOnly: () => p }; this.protections.push(p); return p; }
  getProtections() { return this.protections; }
}

class Spreadsheet {
  constructor() { this.sheets = [new Sheet('Sheet1')]; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
  deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); }
  getSheets() { return this.sheets.slice(); }
  getId() { return 'mock-sheet'; }
}

function chain() { const p = new Proxy({}, { get: (t, k) => (k === 'build' ? () => ({}) : () => p) }); return p; }

function formatDate(date, tz, fmt) {
  const parts = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(date).forEach(p => { parts[p.type] = p.value; });
  return fmt.replace('yyyy', parts.year).replace('MM', parts.month).replace('dd', parts.day).replace('HH', parts.hour).replace('mm', parts.minute).replace('ss', parts.second);
}

function blob(bytes, type, name) {
  const buf = toBuf(bytes);
  return { getBytes: () => signed(buf), getDataAsString: () => buf.toString('utf8'), getContentType: () => type, getName: () => name, _buf: buf };
}

function load(props = {}, opts = {}) {
  const ss = new Spreadsheet();
  const properties = Object.assign({}, props);
  const cache = new Map();
  const files = new Map();
  const ctx = {
    console: opts.quiet ? { log() {}, error() {}, warn() {} } : console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss, openById: () => ss, newDataValidation: chain,
      ProtectionType: { SHEET: 'SHEET', RANGE: 'RANGE' },
      getUi: () => { throw new Error('No UI in tests'); },
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, v) => signed(crypto.createHash(alg).update(toBuf(v)).digest()),
      computeHmacSha256Signature: (v, key) => signed(crypto.createHmac('sha256', toBuf(key)).update(toBuf(v)).digest()),
      base64Encode: v => toBuf(v).toString('base64'),
      base64EncodeWebSafe: v => toBuf(v).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      base64Decode: s => signed(Buffer.from(s, 'base64')),
      base64DecodeWebSafe: s => signed(Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
      newBlob: blob, getUuid: () => crypto.randomUUID(), formatDate, sleep: () => {},
    },
    CacheService: {
      getScriptCache: () => ({
        get: k => { const e = cache.get(k); return e && e.until > Date.now() ? e.v : null; },
        put: (k, v, s = 600) => cache.set(k, { v: String(v), until: Date.now() + s * 1000 }),
        remove: k => cache.delete(k),
      }),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: k => (k in properties ? properties[k] : null), setProperty: (k, v) => { properties[k] = String(v); } }),
    },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' }, Permission: { VIEW: 'VIEW' },
      createFolder: name => folder('folder-1', name),
      getFolderById: id => folder(id),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: s => ({ content: s, setMimeType() { return this; }, getContent() { return this.content; } }),
    },
    UrlFetchApp: { fetch: url => ({ getContentText: () => fs.readFileSync(url.replace(/^file:\/\//, ''), 'utf8') }) },
  };
  function folder(id, name) {
    return {
      getId: () => id, getName: () => name,
      createFile: b => {
        const fid = 'file' + (files.size + 1);
        files.set(fid, b);
        return { getId: () => fid, setSharing: () => {} };
      },
    };
  }
  vm.createContext(ctx);
  const dir = path.join(__dirname, '..', 'apps-script');
  fs.readdirSync(dir).filter(f => f.endsWith('.gs')).sort().forEach(f => vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }));
  // POST body (string) → parsed JSON reply, as the web app would answer
  const call = body => JSON.parse(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).getContent());
  return { ctx, ss, properties, files, call };
}

module.exports = { load };
