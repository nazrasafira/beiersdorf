# Setting up Laporan SPG on Google Sheets

One-time setup by the owner of the Google account that will hold the data (about 20 minutes).
Users never get access to the Sheet: they only use the app; the script checks every permission.
Plan and design: [`IMPLEMENTATION-GOOGLE-SHEETS.md`](IMPLEMENTATION-GOOGLE-SHEETS.md). Code: [`apps-script/`](apps-script/).

## 1. Create the Sheet and the script

1. In Google Drive create a new Google Sheet, e.g. **Laporan SPG**.
2. **Extensions → Apps Script**. Name the project **Laporan SPG**.
3. Copy the files from `apps-script/` into the project. For each `.gs` file: **+ → Script**, use the same name (without `.gs`), paste the contents. Replace the content of `Code.gs` with ours.
   - Show the manifest: **Project Settings (gear) → Show "appsscript.json"**, then paste ours into `appsscript.json`.
   - Faster for developers: `npm i -g @google/clasp`, `clasp login`, `clasp clone <script id> --rootDir apps-script`, `clasp push`.
4. **Project Settings → Time zone**: (GMT+07:00) Jakarta (already set by `appsscript.json`).

## 2. Prepare the tabs and the first Admin

1. Reload the Sheet. A menu **Laporan SPG** appears (first time: Google asks you to authorise the script — choose your account, **Advanced → Go to Laporan SPG**, **Allow**).
2. **Laporan SPG → 1. Siapkan tab**: creates the tabs (Users, Teams, Products, Stores, Sales, …) with their columns, all as plain text.
3. **Laporan SPG → 2. Buat akun Admin**: phone number, name and a temporary password (min. 8 characters). The Admin chooses a new password at the first login.

Optional, to try the app with the demo data (on an **empty** Sheet only): **Laporan SPG → Isi data demo…** and leave the address empty (or, if the GitHub repository is private, upload `apps-script/demo-data.json` to Drive and give its file id). Demo logins: SPG `0813 0000 0001` / `spg123`, Team Leader `0812 0000 0001` / `leader123`, Supervisor `0811 0000 0002` / `super123`, Admin `0811 0000 0001` / `admin123`.

## 3. Publish the web app

1. In the script editor: **Deploy → New deployment → type: Web app**.
   - Description: `Laporan SPG`
   - Execute as: **Me**
   - Who has access: **Anyone**
2. **Deploy**, then copy the **Web app URL** (`https://script.google.com/macros/s/…/exec`).
3. Check it: open the URL in a browser; it shows `{"ok":true,"data":{"app":"Laporan SPG",…}}`.

After changing the code later: paste the new files, run **Laporan SPG → 1. Siapkan tab** again (adds new tabs such as `ShiftPhotos`; existing data stays), then **Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy**. The URL stays the same.

## 4. Point the app to it

In `assets/js/config.js`:

```js
window.APP_CONFIG = { backend: 'sheets', url: 'https://script.google.com/macros/s/…/exec' };
```

Then `python3 tools/bump-version.py`, commit and push; GitHub Pages serves the app on real data.
(Keep the demo on another branch or site if you still want it: `backend: 'demo'`.)

## 5. Start using it

1. The Admin logs in, chooses a new password, adds **Supervisors** and **Team Leaders** (Pengguna), products and stores (Katalog).
2. Team Leaders add their **SPGs** (Tim) and set **targets** (Target). Every new account logs in with the role's starting password (`spg123`, `leader123`, `super123`) and must choose its own.
3. SPGs start a shift at a store and record each sale.

## Good to know

- **Products in the Sheet**: the Admin may add or change products directly in the **Products** tab (name, sku, price, active). New rows get an id automatically; rows without a name or with a wrong price turn red with a note. Product photos: upload them in the app (Katalog). All other tabs are changed through the app only (they show a warning when edited by hand).
- **Photos** (profiles, products, and the photos of the SPGs' handwritten sales notes taken when they end a shift — listed in the `ShiftPhotos` tab) are saved in the Drive folder **Laporan SPG – Foto** (made automatically) and shared "anyone with the link".
- **Speed**: each request to Apps Script takes about 1–2 seconds. Pages open at once from the data kept on the phone and refresh in the background; sales are saved on the phone first and sent in the background (also when the signal comes back after being offline).
- **Signing everyone out**: Script Properties → change `SECRET` (all users must log in again).
- **Backup**: File → Make a copy, or a time-driven trigger; keep the Sheet's version history on.
- **Fixed date for demos**: Script Properties → `DEMO_TODAY` = `2026-10-22` makes "today" that date (remove it for real use).

## Developing without Google

`node tools/sheets-dev-server.js` runs the same `apps-script/*.gs` code against an in-memory Sheet with the demo data and serves the pages on http://localhost:8790/. Tests: `node tools/test-apps-script.js` (backend) and `node tools/test-sheets-browser.js` (pages, needs Playwright and the dev server).
