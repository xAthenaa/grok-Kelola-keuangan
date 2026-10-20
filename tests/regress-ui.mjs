// Regresi UI BUG-01..06 + N-03, dengan jam dipalsukan (BUG-07)
import { chromium, firefox, webkit } from 'playwright-core';
import fs from 'fs';
const BASE = process.env.KK_URL || 'http://localhost:8931/';
const OUT = new URL('./output/', import.meta.url).pathname; fs.mkdirSync(OUT, { recursive: true });
const BR = process.env.BROWSER || 'chromium';
const browser = BR === 'firefox' ? await firefox.launch() : BR === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let fail = 0, total = 0; const errs = []; const check = (n, ok, info = '') => { total++; if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : info); };
const ctx = await browser.newContext({ viewport: { width: 360, height: 900 }, timezoneId: 'Asia/Shanghai' });
const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const at = async (day, hash) => { await p.clock.setFixedTime(new Date(`2026-10-${day}T12:00:00+08:00`)); await p.goto(BASE + hash); await p.reload(); await p.waitForTimeout(250); };
const txt = async (sel = 'main') => (await p.innerText(sel)).replace(/\s+/g, ' ');
const store = () => p.evaluate(() => JSON.parse(localStorage.kk_data_v1));
const seed = (d) => p.evaluate((d) => { localStorage.clear(); localStorage.kk_data_v1 = JSON.stringify(d); }, d);
const ex = (date, amount) => ({ id: 'x' + date + amount, date, type: 'expense', amount, accountId: 'c', categoryId: 'expense-1', note: '', createdAt: date + 'T10:00:00Z' });
const base = (tx, plans) => ({ settings: { schemaVersion: 1 }, accounts: [{ id: 'c', name: 'Dompet', type: 'cash', initialBalance: 2000000, archived: false, createdAt: '2026-10-01T08:00:00' }], transactions: tx, budgetPlans: plans });
const weekly = { id: 'p1', period: 'weekly', startDate: '2026-10-19', endDate: '2026-10-25', amountToAllocate: 1000000, savingAmount: 300000, dailyAllowance: 100000, createdAt: '2026-10-19T01:00:00Z', updatedAt: '2026-10-19T01:00:00Z' };
async function editPlan(amount, saving) { await p.click('#plan-edit'); await p.fill('#plan-amt', amount); await p.fill('#plan-saving', saving); await p.waitForTimeout(100); const preview = await txt('#plan-preview'); await p.click('#plan-save'); await p.click('[data-yes]'); await p.waitForTimeout(200); return preview; }

// BUG-01 / UT-60 / UT-88 / UT-86
await p.goto(BASE); await seed(base([ex('2026-10-19', 120000), ex('2026-10-20', 80000)], [weekly]));
await at('21', '#anggaran');
let pv = await editPlan('1200000', '300000'); check('UT-60 Wed edit → 140.000 + "Sudah terpakai Rp200.000"', pv.includes('Rp140.000') && (await txt()).includes('Rp140.000'), pv);
await p.click('#plan-edit'); await p.waitForTimeout(100); const form = await txt();
check('BUG-01 re-edit same day: form still shows Sudah terpakai Rp200.000', form.includes('Sudah terpakai Rp200.000'), form.slice(0, 500));
await p.click('#plan-cancel'); pv = await editPlan('1200000', '300000');
let plans = (await store()).budgetPlans; let act = plans.find((x) => x.startDate === '2026-10-21');
check('BUG-01/UT-88 re-edit same day keeps 140.000, priorSpent 200.000', pv.includes('Rp140.000') && act.dailyAllowance === 140000 && act.priorSpent === 200000 && plans.length === 2, JSON.stringify(act));
await p.evaluate(() => { const d = JSON.parse(localStorage.kk_data_v1); d.transactions.push({ id: 'w', date: '2026-10-21', type: 'expense', amount: 50000, accountId: 'c', categoryId: 'expense-1', note: '', createdAt: 'x' }); localStorage.kk_data_v1 = JSON.stringify(d); });
await at('22', '#anggaran'); pv = await editPlan('1200000', '300000');
act = (await store()).budgetPlans.find((x) => x.startDate === '2026-10-22');
check('UT-86 Thu re-edit → 162.500', act && act.dailyAllowance === 162500 && pv.includes('Rp162.500'), pv);
// N-03 rekap
await p.click('.bottomnav a[href="#rekap"]'); await p.waitForTimeout(200); let r = await txt();
check('UT-93/94 rekap jatah 900.000, sisa 650.000', r.includes('Jatah minggu ini Rp900.000') && r.includes('Sisa jatah Rp650.000'), r.slice(0, 900));
check('UT-96 note "Rencana diganti 2 kali, …"', r.includes('Rencana diganti 2 kali, jatah harian mengikuti rencana yang berlaku di hari itu'));
check('old "(rencana diubah …)" text gone', !r.includes('rencana diubah'));
// BUG-06: tablewrap focusable & badge tidak terpotong di 360px
const tw = await p.$$eval('.tablewrap', (els) => els.map((e) => [e.getAttribute('tabindex'), e.getAttribute('role'), !!e.getAttribute('aria-label'), e.scrollWidth <= e.clientWidth + 1]));
check('BUG-06 every .tablewrap tabindex=0 role=region aria-label', tw.length > 0 && tw.every((x) => x[0] === '0' && x[1] === 'region' && x[2]), JSON.stringify(tw));
await at('22', '#anggaran');
const fit = await p.$$eval('table.daily', (ts) => ts.map((t) => t.parentElement.scrollWidth <= t.parentElement.clientWidth + 1));
const clipped = await p.$$eval('table.daily .badge', (bs) => bs.filter((b) => b.scrollWidth > b.clientWidth + 1).length);
check('BUG-06 daily table fits 360px, no clipped badges', fit.every(Boolean) && clipped === 0, JSON.stringify(fit) + ' clipped=' + clipped);
await p.focus('.tablewrap'); check('BUG-06 table region focusable via keyboard', await p.evaluate(() => document.activeElement.classList.contains('tablewrap')));
await p.screenshot({ path: OUT + 'anggaran-360-regress.png', fullPage: true });
// UT-97 single plan: no note
await seed(base([], [weekly])); await at('20', '#rekap'); r = await txt();
check('UT-97 no replacement note, jatah 700.000', !r.includes('Rencana diganti') && r.includes('Jatah minggu ini Rp700.000'));
// BUG-03: 800.000 / 700.000 = 114% → merah
await seed(base([ex('2026-10-20', 800000)], [weekly])); await at('23', '#anggaran');
const barCls = await p.getAttribute('#plan-used + .bar', 'class'); r = await txt('#plan-used');
check('BUG-03 bar red (over) + real 114%', barCls.includes('over') && r.includes('114%') && r.includes('Lewat'), barCls + ' | ' + r);
// BUG-04: Minggu 25 Okt kartu jatah tetap = 142.858
await seed(base([], [{ ...weekly, savingAmount: 0, dailyAllowance: 142857 }])); await at('25', '#anggaran'); r = await txt();
const card = (await txt('#plan-slot section')).split('Jatah dinamis')[0]; const today = await txt('tr.today');
check('BUG-04 last-day card Rp142.858 = table today row', card.includes('Rp142.858/hari') && !card.includes('142.857') && today.includes('Rp142.858'), card + ' | ' + today);
// BUG-02 / BUG-05 / G-04 input
await at('20', '#dashboard');
const typeAmt = async (v) => { await p.click('#fab'); await p.locator('#tx-amt').pressSequentially(v); await p.click('.chips label >> nth=0'); await p.click('#tx-save'); await p.waitForTimeout(100);
  const e = await txt('#dlg'); const val = await p.inputValue('#tx-amt'); await p.keyboard.press('Escape'); return { e, val }; };
const nTx = async () => (await store()).transactions.length; const n0 = await nTx();
for (const v of ['12,5', '12.5']) { const { e, val } = await typeAmt(v); check(`BUG-02 "${v}" rejected, input not altered`, e.includes('Nominal harus bilangan bulat') && val === v, e.slice(0, 200) + ' val=' + val); }
{ const { e, val } = await typeAmt('1000000000000'); check('BUG-05 13 digits rejected, not truncated', e.includes('Nominal maksimum Rp999.999.999.999') && val === '1.000.000.000.000', val); }
{ const { e, val } = await typeAmt('-5000'); check('G-04/UT-91 "-5000" rejected', e.includes('Nominal harus lebih dari 0') && val === '-5000', val); }
check('nothing saved by rejected inputs', (await nTx()) === n0);
{ await p.click('#fab'); await p.locator('#tx-amt').pressSequentially('25000'); check('mask still groups digits', (await p.inputValue('#tx-amt')) === '25.000'); await p.keyboard.press('Escape'); }
// UT-92 penyesuaian negatif tetap boleh
await p.goto(BASE + '#akun'); await p.waitForTimeout(200); await p.click('[data-acc-adj]'); await p.fill('#adj-val', ''); await p.locator('#adj-val').pressSequentially('-50000'); await p.click('#adj-save'); await p.waitForTimeout(200);
check('UT-92 adjustment to -Rp50.000 accepted', (await txt()).includes('-Rp50.000') && (await txt()).includes('Saldo akun jadi minus'));
// IT-19 (a): data UT-100 — buat rencana Rab, Ubah angka sama → Sudah terpakai Rp0, 140.000, 1 rencana
await seed(base([ex('2026-10-19', 120000), ex('2026-10-20', 80000)], [])); await at('21', '#anggaran');
await p.fill('#plan-amt', '1000000'); await p.fill('#plan-saving', '300000'); await p.click('#plan-save'); await p.waitForTimeout(200);
await p.click('#plan-edit'); await p.waitForTimeout(100); r = await txt();
check('IT-19a edit form "Sudah terpakai Rp0"', r.includes('Sudah terpakai Rp0 '), r.slice(0, 600));
await p.click('#plan-save'); await p.click('[data-yes]'); await p.waitForTimeout(200); plans = (await store()).budgetPlans;
check('IT-19a still 140.000, 1 plan', plans.length === 1 && plans[0].dailyAllowance === 140000, JSON.stringify(plans));
// IT-19 (b): skenario UT-80a lewat dialog
await seed(base([ex('2026-10-15', 90000), ex('2026-10-19', 120000), ex('2026-10-20', 80000)], [weekly])); await at('21', '#anggaran');
await p.click('#plan-edit'); await p.click('label:has-text("Bulanan")'); await p.fill('#plan-amt', '3000000'); await p.fill('#plan-saving', '520000'); await p.waitForTimeout(100); r = await txt('#plan-preview');
check('IT-19b preview (3.000.000 − 520.000 − 200.000) / 11 hari = Rp207.272', r.includes('(3.000.000 − 520.000 − 200.000) / 11 hari') && r.includes('Rp207.272'), r);
// G-07: pesan pratinjau = pesan simpan (helper yang sama)
await p.fill('#plan-amt', '720000'); await p.waitForTimeout(100); r = await txt('#plan-msgs');
check('G-07 preview "(kurang Rp1)"', r.includes('Uang yang dibagi tidak cukup setelah dikurangi tabungan dan pengeluaran yang sudah terjadi (kurang Rp1)'), r);
await p.fill('#plan-amt', '3000000'); await p.click('#plan-save'); await p.click('[data-yes]'); await p.waitForTimeout(200);
await at('23', '#rekap'); await p.click('[data-rm=weekly]'); await p.waitForTimeout(150); r = await txt();
check('IT-19b weekly recap Jatah minggu ini Rp1.236.360, sisa Rp1.036.360', r.includes('Jatah minggu ini Rp1.236.360') && r.includes('Sisa jatah Rp1.036.360'), r.slice(0, 900));
// BUG-08: ketik tombol demi tombol di SETIAP field nominal
const typed = async (sel, v) => { await p.fill(sel, ''); await p.locator(sel).pressSequentially(v, { delay: 15 }); await p.waitForTimeout(50); return p.inputValue(sel); };
const noErr = async (id) => ((await p.textContent('#' + id + '-err')) || '') === '';
await p.evaluate(() => localStorage.clear()); await at('20', '#dashboard');
check('BUG-08 onboarding saldo awal 300000 → 300.000', (await typed('#acc-init', '300000')) === '300.000' && await noErr('acc-init'));
await p.fill('#acc-name', 'Dompet'); await p.click('#ob-save'); await p.waitForTimeout(150);
check('BUG-08 onboarding saved 300000', (await store()).accounts[0]?.initialBalance === 300000);
await p.goto(BASE + '#akun'); await p.waitForTimeout(150); await p.click('#acc-add'); await p.fill('#acc-name', 'BCA');
check('BUG-08 account form 1250000 → 1.250.000', (await typed('#acc-init', '1250000')) === '1.250.000'); await p.click('#acc-save'); await p.waitForTimeout(150);
check('BUG-08 account saved 1.250.000', (await store()).accounts[1]?.initialBalance === 1250000);
await p.click('[data-acc-adj]'); check('BUG-08 adjustment field 275000 → 275.000', (await typed('#adj-val', '275000')) === '275.000'); await p.click('#adj-save'); await p.waitForTimeout(150);
check('BUG-08 adjustment saved (−25.000)', (await store()).transactions.at(-1)?.amount === -25000);
for (const [type, v, want] of [['expense', '300000', '300.000'], ['income', '4500000', '4.500.000'], ['transfer', '125000', '125.000']]) {
  await p.click('#fab'); await p.click(`[data-type=${type}]`); const got = await typed('#tx-amt', v);
  if (type === 'transfer') await p.selectOption('#tx-to', { index: 2 }); else await p.click('.chips label >> nth=0');
  await p.click('#tx-save'); await p.waitForTimeout(150);
  check(`BUG-08 tx ${type} typed ${v} → ${want}, saved`, got === want && (await store()).transactions.at(-1)?.amount === +v, got); }
await p.click('#fab'); await p.click('[data-type=adjustment]'); check('BUG-08 tx adjustment field typed 280000', (await typed('#tx-amt', '280000')) === '280.000'); await p.keyboard.press('Escape');
await p.click('#fab'); await typed('#tx-amt', 'Rp 15.000'); await p.click('.chips label >> nth=0'); await p.click('#tx-save'); await p.waitForTimeout(150);
check('BUG-09 typed "Rp 15.000" saved as 15000', (await store()).transactions.at(-1)?.amount === 15000);
await p.click('#fab'); await typed('#tx-amt', 'Rp15.000'); await p.click('.chips label >> nth=0'); await p.click('#tx-save'); await p.waitForTimeout(150);
check('BUG-09 typed "Rp15.000" saved as 15000', (await store()).transactions.filter((t) => t.amount === 15000).length === 2);
await p.goto(BASE + '#anggaran'); await p.waitForTimeout(200);
const pa = await typed('#plan-amt', '1000000'), ps = await typed('#plan-saving', '300000');
const msgs = await txt('#plan-msgs');
check('BUG-08 plan form typed 1000000/300000: no error, Save enabled', pa === '1.000.000' && ps === '300.000' && !msgs.includes('bilangan bulat') && !(await p.isDisabled('#plan-save')), pa + ' ' + ps + ' ' + msgs);
check('BUG-08 plan preview Rp116.666', (await txt('#plan-preview')).includes('Rp116.666'));
await typed('#plan-amt', '12,5'); check('BUG-08 plan "12,5" still rejected', (await txt('#plan-msgs')).includes('bilangan bulat') && await p.isDisabled('#plan-save'));
await typed('#plan-amt', '1000000'); await p.click('#plan-save'); await p.waitForTimeout(200);
check('BUG-08 plan saved 1.000.000/300.000', (await store()).budgetPlans[0]?.amountToAllocate === 1000000);
await p.click('#goal-add'); await p.fill('#g-name', 'Laptop'); const gt = await typed('#g-target', '8000000'), gs = await typed('#g-saved', '2000000'); await p.click('#g-save'); await p.waitForTimeout(150);
check('BUG-08 goal fields typed 8.000.000 / 2.000.000, saved', gt === '8.000.000' && gs === '2.000.000' && (await store()).savingGoals[0]?.targetAmount === 8000000);
// BUG-10: grafik Jatah vs Aktual
const plan10 = { id: 'p10', period: 'weekly', startDate: '2026-10-20', endDate: '2026-10-25', amountToAllocate: 120000, savingAmount: 17148, dailyAllowance: 17142, createdAt: '2026-10-20T02:00:00Z', updatedAt: '2026-10-20T02:00:00Z' };
const chartInfo = () => p.evaluate(() => { const box = document.querySelector('[data-chart]'); const svg = box.querySelector('svg'); const tick = svg.querySelector('[data-tick]').getBoundingClientRect();
  return { cols: svg.querySelectorAll('[data-col]').length, svgW: +svg.getAttribute('width'), boxW: box.clientWidth, h: +svg.getAttribute('height'), par: svg.getAttribute('preserveAspectRatio'),
    actual: svg.querySelectorAll('[data-kind=actual]').length, future: svg.querySelectorAll('[data-kind=future-outline]').length, zero: svg.querySelectorAll('[data-kind=zero]').length,
    outside: svg.querySelectorAll('g[data-kind=outside]').length, status: [...svg.querySelectorAll('[data-status]')].map((e) => e.dataset.status), tickH: tick.height, ticks: [...svg.querySelectorAll('[data-tick]')].map((t) => t.textContent),
    empty: !!document.querySelector('[data-empty-msg]'), title: svg.querySelector('g[data-col] title')?.textContent, sw: document.documentElement.scrollWidth }; });
await seed(base([], [plan10])); await at('20', '#anggaran'); let ci = await chartInfo();
check('BUG-10 new plan: 7 cols Sen–Min, Mon outside, 5 future outlines, no filled bars', ci.cols === 7 && ci.outside === 1 && ci.future === 5 && ci.actual === 0, JSON.stringify(ci));
check('BUG-10 new plan: today Rp0 marker + "Belum ada pengeluaran minggu ini"', ci.zero === 1 && ci.empty && (await txt()).includes('Belum ada pengeluaran minggu ini'));
check('BUG-10 nice ticks Rp0/5rb/…/25rb', JSON.stringify(ci.ticks) === JSON.stringify(['Rp0', 'Rp5rb', 'Rp10rb', 'Rp15rb', 'Rp20rb', 'Rp25rb']), ci.ticks.join(','));
check('BUG-10 SVG at real width, no stretch, 220px on HP, label ~12px', ci.svgW === ci.boxW && !ci.par && ci.h === 220 && ci.tickH < 18 && ci.sw <= 360, JSON.stringify(ci));
await seed(base([ex('2026-10-20', 9000), ex('2026-10-21', 16000)], [plan10])); await at('23', '#anggaran'); ci = await chartInfo();
check('BUG-10 mid-week: 2 bars (Aman, Hampir habis), 2 Rp0 markers, 2 future outlines', ci.actual === 2 && ci.zero === 2 && ci.future === 2 && ci.status.join() === 'safe,warn' && !ci.empty, JSON.stringify(ci));
check('BUG-10 tooltip full amounts', (await p.evaluate(() => [...document.querySelectorAll('[data-chart] title')].map((t) => t.textContent).join('|'))).includes('aktual Rp9.000 · jatah tetap Rp17.142'));
await seed(base([ex('2026-10-20', 25000), ex('2026-10-21', 15000), ex('2026-10-23', 30000)], [plan10])); await at('23', '#anggaran'); ci = await chartInfo();
check('BUG-10 over jatah: red bars, top tick 40rb', ci.status.join() === 'over,warn,over' && ci.ticks.at(-1) === 'Rp40rb', JSON.stringify(ci));
await p.setViewportSize({ width: 1280, height: 900 }); await p.waitForTimeout(300); ci = await chartInfo();
check('BUG-10 ResizeObserver redraw at 1280: width follows container, 260px', ci.svgW === ci.boxW && ci.boxW > 600 && ci.h === 260, JSON.stringify(ci));
await p.setViewportSize({ width: 360, height: 900 }); await p.waitForTimeout(300); ci = await chartInfo();
check('BUG-10 redraw back to 360: no h-scroll', ci.svgW === ci.boxW && ci.h === 220 && ci.sw <= 360, JSON.stringify(ci));
await seed(base([ex('2026-10-20', 50000)], [{ id: 'm', period: 'monthly', startDate: '2026-10-20', endDate: '2026-10-31', amountToAllocate: 1200000, savingAmount: 0, dailyAllowance: 100000, createdAt: '2026-10-20T02:00:00Z', updatedAt: 'x' }]));
await at('21', '#anggaran'); ci = await chartInfo(); check('BUG-10 monthly "7 hari": 7 cols Sen–Min, Mon outside', ci.cols === 7 && ci.outside === 1, JSON.stringify(ci));
await p.click('[data-bv=m]'); await p.waitForTimeout(200); ci = await chartInfo();
check('BUG-10 monthly "Bulan ini": 31 cols, 19 outside, internal scroll only', ci.cols === 31 && ci.outside === 19 && ci.sw <= 360, JSON.stringify(ci));
await p.screenshot({ path: OUT + 'bug10-monthly-360.png', fullPage: true });
// Kina: label "di luar rencana" & "Mendatang" selalu tampil, ≥12px, di 375/768/1280
await seed(base([ex('2026-10-20', 9000)], [plan10])); await at('23', '#anggaran');
for (const w of [375, 768, 1280]) { await p.setViewportSize({ width: w, height: 900 }); await p.waitForTimeout(300);
  const L = await p.evaluate(() => { const q = (k) => [...document.querySelectorAll(`[data-chart] [data-kind=${k}]`)];
    const info = (els) => els.map((t) => ({ fs: parseFloat(getComputedStyle(t).fontSize || t.getAttribute('font-size')), attr: +t.getAttribute('font-size'), h: t.getBoundingClientRect().height, w: t.getBoundingClientRect().width }));
    const fut = [...document.querySelectorAll('[data-chart] g[data-kind=future]')].map((g) => !!g.querySelector('[data-kind=future-label]'));
    return { out: info(q('outside-label')), fut: info(q('future-label')), futCols: fut, all: [...document.querySelectorAll('[data-chart] text')].map((t) => +t.getAttribute('font-size')) }; });
  check(`labels ≥12px at ${w}px: "di luar rencana" + "Mendatang" on every future day (Sab, Min)`, L.out.length >= 1 && L.out.every((x) => x.attr >= 12 && x.h > 0) && L.futCols.length === 2 && L.futCols.every(Boolean) && L.fut.every((x) => x.attr >= 12 && x.h > 0), JSON.stringify(L));
  await p.locator('section.card', { hasText: 'Jatah vs Aktual' }).first().screenshot({ path: `/workspace/kelola-keuangan/site-screens/chart-labels-after-${w}.png` }); }
await p.setViewportSize({ width: 360, height: 900 }); await at('20', '#anggaran');
// Bocil: sorotan baris "hari ini" menutup SELURUH baris (semua sel), juga di 360px
for (const w of [360, 1280]) { await p.setViewportSize({ width: w, height: 900 }); await p.waitForTimeout(200);
  const hl = await p.evaluate(() => { const tr = document.querySelector('table.daily tr.today'); if (!tr) return null;
    const cells = [...tr.children]; const bgs = cells.map((c) => getComputedStyle(c).backgroundColor);
    const tw = tr.closest('table').getBoundingClientRect(); const first = cells[0].getBoundingClientRect(), last = cells.at(-1).getBoundingClientRect();
    return { n: cells.length, same: bgs.every((b) => b === bgs[0]), bg: bgs[0], spans: Math.abs(first.left - tw.left) < 1 && Math.abs(last.right - tw.right) < 1 }; });
  check(`today row fully highlighted at ${w}px`, hl && hl.n === 4 && hl.same && hl.bg !== 'rgba(0, 0, 0, 0)' && hl.spans, JSON.stringify(hl)); }
await p.setViewportSize({ width: 360, height: 900 });
check('no JS errors', errs.length === 0, errs.join('\n'));
console.log(`regress-ui [${BR}]: ${total - fail}/${total} checks passed`);
await browser.close(); process.exit(fail ? 1 : 0);
