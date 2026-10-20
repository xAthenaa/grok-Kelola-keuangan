import { chromium, firefox, webkit } from 'playwright-core';
import fs from 'fs';
const URL = process.env.KK_URL || 'http://localhost:8931/';
// BUG-07: output tes terpisah dari site-screens/
const SHOTS = new globalThis.URL('./output/', import.meta.url).pathname; fs.mkdirSync(SHOTS, { recursive: true });
const BR = process.env.BROWSER || 'chromium';
const browser = BR === 'firefox' ? await firefox.launch() : BR === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, acceptDownloads: true, timezoneId: 'Asia/Shanghai' });
const page = await ctx.newPage();
// BUG-07: jam dipalsukan → Selasa 20 Okt 2026 12.00 (UTC+8)
await page.clock.setFixedTime(new Date('2026-10-20T12:00:00+08:00')); const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
let fail = 0, total = 0; const check = (n, ok, info = '') => { total++; if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : info); };
const text = async (sel = 'main') => (await page.locator(sel).innerText()).replace(/\s+/g, ' ');
const go = async (h) => { await page.evaluate((h) => (location.hash = h), h); await page.waitForTimeout(150); };
const save = async (sel = '#tx-save') => { await page.click(sel); await page.waitForTimeout(150); };
async function addTx(type, amt, { acc, to, cat } = {}) {
  await page.evaluate(() => document.getElementById('fab').offsetParent ? document.getElementById('fab').click() : document.getElementById('btn-add-tx').click());
  await page.click(`[data-type=${type}]`); await page.fill('#tx-amt', amt);
  if (acc) await page.$eval('#tx-acc', (el, n) => { el.value = [...el.options].find((o) => o.text.startsWith(n)).value; }, acc);
  if (to) await page.$eval('#tx-to', (el, n) => { el.value = [...el.options].find((o) => o.text.startsWith(n)).value; }, to);
  if (cat) await page.click(`.chips label:has-text("${cat}")`);
  await save();
}
await page.goto(URL); await page.evaluate(() => localStorage.clear()); await page.reload();
check('onboarding shown', (await text()).includes('Tambah akun pertama'));
await page.fill('#acc-name', 'Dompet'); await page.fill('#acc-init', '100000'); await page.click('#ob-save'); await page.waitForTimeout(150);
await go('#akun'); await page.click('#acc-add'); await page.fill('#acc-name', 'BCA'); await page.click('label:has-text("Bank")'); await page.fill('#acc-init', '900000'); await page.click('#acc-save');
await go('#dashboard'); let t = await text();
check('AC1 totals', t.includes('Rp1.000.000') && /Cash Rp100\.000/.test(t) && /Digital Rp900\.000/.test(t), t.slice(0, 200));
check('F-17 input auto titik', await (async () => { await page.click('#fab'); await page.fill('#tx-amt', ''); await page.type('#tx-amt', '25000'); const v = await page.inputValue('#tx-amt'); await page.keyboard.press('Escape'); return v === '25.000'; })());
// validation AC7
await page.click('#fab'); await save(); check('AC7 empty rejected', (await text('#dlg')).includes('Nominal wajib diisi'));
await page.fill('#tx-amt', '0'); await save(); check('AC7 zero rejected', (await text('#dlg')).includes('lebih dari Rp0'));
await page.fill('#tx-amt', ''); await page.locator('#tx-amt').pressSequentially('-5000'); await save(); check('AC7/G-04 negative rejected, not turned positive', (await text('#dlg')).includes('Nominal harus lebih dari 0') && (await page.inputValue('#tx-amt')) === '-5000');
await page.keyboard.press('Escape');
// AC2
await addTx('expense', '25000', { acc: 'Dompet', cat: 'Makan & Minum' });
const bal = async (name) => { await go('#akun'); const li = page.locator('li', { hasText: name }).first(); return (await li.locator('.amount').innerText()).trim(); };
check('AC2 cash 75.000', (await bal('Dompet')) === 'Rp75.000');
await go('#transaksi'); await page.click('[data-tx-del]'); await page.click('[data-yes]'); await page.waitForTimeout(150);
check('AC2 delete → 100.000', (await bal('Dompet')) === 'Rp100.000');
await addTx('expense', '25000', { acc: 'Dompet', cat: 'Makan & Minum' });
await go('#transaksi'); await page.click('[data-tx-edit]'); await page.fill('#tx-amt', '30000'); await save();
check('AC2 edit → 70.000', (await bal('Dompet')) === 'Rp70.000');
// AC3 transfer
await addTx('transfer', '50000', { acc: 'BCA', to: 'Dompet' });
await go('#dashboard'); t = await text(); check('AC3 total unchanged after transfer (970.000)', t.includes('Rp970.000'), t.slice(0, 120));
await addTx('income', '200000', { acc: 'BCA', cat: 'Gaji' });
await go('#rekap'); t = await text(); check('AC3/AC6 recap pemasukan 200.000 pengeluaran 30.000', t.includes('+Rp200.000') && t.includes('-Rp30.000'), t.slice(0, 300));
check('recap week Sen–Min', t.includes('Sen 19 – Min 25 Okt 2026'));
// F-08 filter
await go('#transaksi'); await page.selectOption('#f-type', 'transfer'); check('F-08 filter jenis', (await text()).includes('1 transaksi'));
await page.selectOption('#f-type', ''); await page.fill('#f-q', 'zzz'); await page.waitForTimeout(100); check('F-08 search', (await text()).includes('0 transaksi'));
await page.fill('#f-q', ''); await page.waitForTimeout(100);
// F-10 adjustment
await go('#akun'); await page.click('[data-acc-adj]'); await page.fill('#adj-val', '115000'); await page.click('#adj-save'); await page.waitForTimeout(150);
check('F-10 adjust Dompet → 115.000', (await bal('Dompet')) === 'Rp115.000');
// AC4 plan form
await go('#anggaran'); await page.fill('#plan-amt', '1000000'); await page.fill('#plan-saving', '1000000'); await page.waitForTimeout(100);
t = await text(); check('AC4 reject saving>=amount', t.includes('Jumlah tabungan harus lebih kecil dari uang yang dibagi') && await page.isDisabled('#plan-save'));
await page.fill('#plan-saving', '300000'); await page.waitForTimeout(100); t = await text();
check('F-11a preview (20–25 Okt, 6 hari) → 116.666', t.includes('Rp116.666') && t.includes('(6 hari)'), t.slice(0, 400));
check('no warning when ≤ saldo', !t.includes('melebihi total saldo'));
await page.fill('#plan-amt', '2000000'); await page.waitForTimeout(100); check('warning > saldo, still savable', (await text()).includes('melebihi total saldo') && !(await page.isDisabled('#plan-save')));
await page.fill('#plan-amt', '1000000'); await page.waitForTimeout(100);
await page.click('#plan-save'); await page.waitForTimeout(200); t = await text();
check('plan saved + table', t.includes('Rencana aktif') && t.includes('Jatah tetap'));
await page.click('#plan-edit'); await page.click('label:has-text("Bulanan")'); await page.fill('#plan-amt', '3000000'); await page.fill('#plan-saving', '520000'); await page.waitForTimeout(100);
await page.click('#plan-save'); t = await text('#dlg'); check('A-13 dialog Ganti rencana aktif?', t.includes('Ganti rencana aktif?')); await page.click('[data-yes]'); await page.waitForTimeout(200);
t = await text(); check('created today → edited in place (1 plan, monthly 12 hari)', (await page.evaluate(() => JSON.parse(localStorage.kk_data_v1).budgetPlans.length)) === 1 && t.includes('Bulanan') && t.includes('(12 hari)'));
check('AC4a monthly view toggle', await page.locator('[data-bv=m]').count() === 1); await page.click('[data-bv=m]'); await page.waitForTimeout(100);
check('monthly table = full month 31 rows (BUG-10: days outside plan marked)', (await page.locator('table.daily tbody tr').count()) === 31 && (await page.locator('table.daily tbody tr', { hasText: 'di luar rencana' }).count()) === 19);
// AC8 persistence
await page.reload(); await page.waitForTimeout(200); await go('#dashboard'); t = await text();
check('AC8 persisted after reload', t.includes('Rp1.165.000') && t.includes('Jatah Hari Ini'), t.slice(0, 200));
// AC10 category used
await go('#pengaturan'); const makan = page.locator('li', { hasText: 'Makan & Minum' }); t = await makan.innerText();
check('AC10 used category → Arsip only', t.includes('Arsip') && !t.includes('Hapus') && t.includes('Dipakai 1 transaksi'));
// AC9 export/reset/import
const before = await page.evaluate(() => localStorage.kk_data_v1);
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exp-json')]); const fpath = '/tmp/kk-export.json'; await dl.saveAs(fpath);
await page.click('#reset'); await page.click('[data-yes]'); await page.waitForTimeout(100); check('reset button disabled until HAPUS', await page.isDisabled('#reset-go'));
await page.fill('#reset-txt', 'HAPUS'); await page.click('#reset-go'); await page.waitForTimeout(150);
check('reset → onboarding', (await text()).includes('Tambah akun pertama'));
await go('#pengaturan'); await page.setInputFiles('#imp-file', fpath); await page.waitForTimeout(200); check('import confirm', (await text('#dlg')).includes('Data saat ini akan diganti')); await page.click('[data-yes]'); await page.waitForTimeout(200);
const after = await page.evaluate(() => localStorage.kk_data_v1);
const strip = (s) => { const o = JSON.parse(s); delete o.settings.lastExport; return JSON.stringify(o); };
check('AC9 data identical after import', strip(before) === strip(after));
// CSV
await go('#transaksi'); const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#csv')]); await csv.saveAs('/tmp/kk.csv');
check('F-15 CSV header', fs.readFileSync('/tmp/kk.csv', 'utf8').includes('tanggal,jenis,nominal,akun,akun_tujuan,kategori,catatan'));
// keyboard: dialog focus + Escape
await page.keyboard.press('Escape'); await page.focus('#fab'); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
check('keyboard opens dialog, focus inside', await page.evaluate(() => document.getElementById('dlg').open && document.getElementById('dlg').contains(document.activeElement)));
await page.keyboard.press('Escape');
// no h-scroll at 360 + screenshots
const pages = ['dashboard', 'transaksi', 'akun', 'anggaran', 'rekap', 'pengaturan'];
for (const w of [360, 375, 1280]) { await page.setViewportSize({ width: w, height: 900 });
  for (const p of pages) { await go('#' + p); if (p === 'rekap') { await page.click('[data-rm=monthly]'); }
    const sw = await page.evaluate(() => document.documentElement.scrollWidth); check(`no h-scroll ${w}px #${p}`, sw <= w, `scrollWidth=${sw}`);
    if (w !== 360) await page.screenshot({ path: `${SHOTS}/${BR}-${p}-${w}.png`, fullPage: true }); } }
await page.setViewportSize({ width: 375, height: 900 }); await go('#dashboard'); await page.click('#fab'); await page.waitForTimeout(150); await page.screenshot({ path: `${SHOTS}/form-transaksi-375.png` });
await page.keyboard.press('Escape');
check('no JS errors', errors.length === 0, errors.join('\n'));
console.log(`e2e [${BR}]: ${total - fail}/${total} checks passed`);
await browser.close(); process.exit(fail ? 1 : 0);
