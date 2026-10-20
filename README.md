# grok-Kelola-keuangan
website yang dapat digunakan untuk mengelola keuangan. website ini dibuat 100% oleh Ai Grokbot

## Kelola Keuangan v1
Aplikasi web statis (HTML/CSS/JS vanilla, modul ES) untuk mencatat saldo cash & digital per akun, pemasukan/pengeluaran/transfer/penyesuaian per kategori, rencana jatah harian (mingguan/bulanan), serta rekap mingguan & bulanan. Tanpa backend dan tanpa login: data disimpan di `localStorage` (kunci `kk_data_v1`) di perangkat; backup lewat Ekspor/Impor JSON. Tidak ada request ke pihak ketiga (grafik SVG buatan sendiri, font sistem).

- Hosting: GitHub Pages, branch `main`, folder root (`/`). File `.nojekyll` disertakan.
- Jalankan lokal: `python3 -m http.server` lalu buka `http://localhost:8000` (modul ES butuh server HTTP).
- Struktur: `index.html`, `css/style.css`, `js/app.js` (router + UI), `js/storage.js`, `js/balance.js`, `js/budget.js`, `js/recap.js`, `js/format.js`.
- Tes: `tests/unit.mjs` (node), `tests/e2e.mjs` & `tests/split.mjs` (playwright-core + Chrome headless).
