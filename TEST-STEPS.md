# Test steps: Sell In, Offtake and Pencapaian

These steps use the local server and its dummy data. Nothing here touches the real Google Sheet. Test dates are fixed: the local server treats **22 Oktober 2026** as today.

## Setup

1. Stop the server running on port 8000 (`Ctrl+C` in its terminal).
2. From the `beiersdorf` folder, start it again. This loads the dummy data, and any restart resets it to the same starting point.

   ```bash
   node tools/sheets-dev-server.js --port 8000
   ```

   The terminal should print a line starting with `Data dummy:`.
3. Open `http://localhost:8000`. The login page has **Akun lokal** buttons that fill in each test account. Tap one, then **Masuk**.
4. For phone checks, use a real phone on the same Wi-Fi, or use the browser's phone view. In Safari, that's Develop › Enter Responsive Design Mode. In Chrome, it's the device icon in DevTools.

| Button | Who | Use it for |
|---|---|---|
| Team Leader | Rina Agustina, Tim Jakarta Selatan | Sell in and reports |
| SPG | Sari Wulandari, holds Toko Kemang | Monthly sell out |
| Manager | Budi Santoso | Choosing a team |
| Admin | Admin | Checking there's no access |

To switch accounts, tap the logout icon at the top right.

## 1. Team leader: see what's filled in

Log in as **Team Leader**, then open **Laporan › Sell In & Offtake**.

- [ ] Month shows **Oktober 2026**, and the progress bars show counts out of 8 stores.
- [ ] Status buttons show counts: Semua, Belum isi sell in, Menunggu SPG, Lengkap.
- [ ] Stores that need work come first, and **Lengkap** stores come last.
- [ ] Each store shows one status: Belum ada data, Belum isi sell in, Menunggu SPG or Lengkap.
- [ ] Tapping a status button shows only those stores. Tap **Semua** to go back.
- [ ] Tap **‹** for September. All 8 stores should be **Lengkap**. Tap **›** to return.
- [ ] Tap **Semua area**. The list grows and page buttons appear at the bottom. Switch back to **Toko tim**.

## 2. Team leader: enter sell in

- [ ] Type `20000000` in an empty **Isi sell in** box. It shows as `Rp 20.000.000`, the row is highlighted, and a **Simpan** bar appears.
- [ ] Tap **‹** before saving. It warns about unsaved numbers. Tap **Batal**.
- [ ] Tap **Simpan**. The Sell in count goes up, and the status changes to **Menunggu SPG** or **Lengkap**.
- [ ] A saved store shows the amount with **Ubah**. Tap **Ubah**, change the number and save.
- [ ] Offtake can't be typed here. It only shows the SPG's number or "Belum diisi SPG".

## 3. SPG: enter monthly sell out

Log out, log in as **SPG**, then open **Riwayat**.

- [ ] A **Sell out bulan ini** section shows "0 dari 1 toko sudah diisi", and Toko Kemang is **Belum diisi**.
- [ ] It says the daily sales recorded for that store.
- [ ] Type `25000000` and a note, then tap **Simpan sell out**.
- [ ] The store changes to **Sudah diisi**, and the count becomes "1 dari 1".
- [ ] Tap **Ubah**. The saved amount and note are there to edit. Leave without saving and it warns you.
- [ ] Tap **‹** for September. It already has a number from the dummy data.

Log back in as **Team Leader**, then open **Sell In & Offtake**.

- [ ] Toko Kemang shows offtake **Rp 25.000.000**, your note, and the Selisih.
- [ ] If the gap is over 10%, it says **Perlu dicek**.

## 4. Team leader: Excel from Sell In & Offtake

- [ ] Tap **Unduh Excel** and open the file in Excel.
- [ ] Headers are blue with yellow text for Store and the % column, and green for the numbers with **Okt 26** on the second line.
- [ ] Each row has a number on the left, and rows run from highest % to lowest. Stores with no offtake come last.
- [ ] Each row with an offtake has a colored dot: blue when daily sales are within 10% of offtake, red when they aren't.
- [ ] The last row is a yellow **Total**.

## 5. Team leader: Pencapaian

Open **Laporan › Pencapaian**.

- [ ] It opens on 1 Januari to 22 Oktober, with Target, Offtake and Pencapaian totals.
- [ ] Rows run from highest Ach% to lowest, with blue, pink or red dots.
- [ ] Each row says its source: Laporan toko, Penjualan harian, or both.
- [ ] Tap **Bulan ini**. Numbers and dates change. Try **3 bulan**, then pick your own dates.
- [ ] Switch between **Per SPG** and **Per toko**.
- [ ] Set **Dari** to 1 Januari and tap **Unduh Excel**. The file has the SPG table with the numbered Store table to its right, like the client's screenshots, with **FULL YEAR 26** in the green headers.
- [ ] Use a shorter range and download again. The green header shows those dates instead.

## 6. Profile photo from the gallery

Do this on a real phone, because a computer only offers files.

- [ ] Log in as **Team Leader** and tap your photo at the top. The phone offers the gallery or photo library, not only the camera. Pick a photo, and it updates.
- [ ] Log in as **SPG**, open **Beranda** and tap your photo. It also offers the gallery.
- [ ] As **Team Leader**, open **Tim** and tap **Foto** on an SPG if that button is shown.

The local server's photo storage is simulated, so a changed photo goes back to the default after reloading the page. That only happens locally. Check real saving after deployment.

**Expected difference:** the handwritten notes photo when ending a shift still opens the camera directly, because it has to be a fresh photo.

## 7. Phone layout

In phone view, go through each of these and check that nothing scrolls sideways or overlaps:

- [ ] **Team Leader:** Laporan's three tabs, Dashboard, Target, Tim, Pengaturan and Katalog.
- [ ] **SPG:** Beranda, Penjualan, Peringkat and Riwayat.
- [ ] Laporan's tabs fit on one line.
- [ ] On store cards, the name and status sit at the top, the sell in box is easy to tap, and the three numbers fit in one row.

## 8. Access

- [ ] **SPG:** opening `http://localhost:8000/leader/laporan.html` sends you back to Beranda.
- [ ] **Admin:** the menu has no Laporan.
- [ ] **Manager:** Laporan has a **Lihat tim** picker. Changing team stays on the same tab and shows that team's stores.

## 9. Team leader: Penjualan

Log in as **Team Leader**, then open **Laporan › Penjualan**. The dummy month has 8 SPGs and 147 daily reports.

- [ ] The totals show Total penjualan, Transaksi, SPG lapor and Rata-rata per hari, with "147 laporan harian" under the total.
- [ ] **Per hari** lists days, newest first. 22 Oktober says "6 dari 8 SPG lapor" and "2 belum lapor".
- [ ] Tap 22 Oktober. It lists the SPGs with their amounts, and names who hasn't reported.
- [ ] Tap an SPG. It shows the shift, each transaction and an **Ubah laporan** button.
- [ ] Tap **Per SPG**. It lists 8 SPGs, highest sales first, with days reported, transactions and a daily average.
- [ ] Tap an SPG, then one of their days.
- [ ] Tap **Hari ini**, **Minggu ini** and **Bulan ini**. Dates and numbers change.
- [ ] Tap a bar in the chart. That day opens in **Per hari**.
- [ ] Pick a store in **Toko**. Amounts only count that store, and "belum lapor" disappears.
- [ ] Amounts are full numbers, such as `Rp 1.960.000`, not "Rp 2 jt".

## If something looks wrong

Note the account, the page, what you did and what you expected. A screenshot helps.

If a page shows **Aksi tidak dikenal**, the server is out of date. Restart it as in Setup.
