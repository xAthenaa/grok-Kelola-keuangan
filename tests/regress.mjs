// Regresi BUG-01..05 + test-plan v1.4 UT-80..99 (deterministik: semua tanggal eksplisit)
import * as B from '../js/budget.js';
import { recap, pct } from '../js/recap.js';
import { parseMoney, maskMoney } from '../js/format.js';
let fail = 0; const eq = (n, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); };
const D = () => ({ accounts: [{ id: 'c', type: 'cash', initialBalance: 5000000, createdAt: '2026-09-01T00:00' }], categories: [], savingGoals: [], budgetPlans: [], transactions: [] });
const ex = (d, date, amount) => d.transactions.push({ id: date + amount, type: 'expense', amount, accountId: 'c', categoryId: 'e', date });
const inc = (d, date, amount) => d.transactions.push({ id: 'i' + date + amount, type: 'income', amount, accountId: 'c', categoryId: 'i', date });
const save = (d, t, period, amount, saving) => B.savePlan(d, { period, amount, saving }, t, t + 'T09:00:00Z');
const active = (d, t) => B.activePlan(d, t);
function ut60() { const d = D(); save(d, '2026-10-19', 'weekly', 1000000, 300000); ex(d, '2026-10-19', 120000); ex(d, '2026-10-20', 80000); const r = save(d, '2026-10-21', 'weekly', 1200000, 300000); return { d, r }; }
{ const { d, r } = ut60(); eq('UT-60 140.000, prior 200.000, old ends 20 Okt', [r.plan.dailyAllowance, r.prior, d.budgetPlans[0].endDate, d.budgetPlans[0].dailyAllowance], [140000, 200000, '2026-10-20', 100000]); }
{ const { d } = ut60(); inc(d, '2026-10-19', 100000); const d2 = D(); save(d2, '2026-10-19', 'weekly', 1000000, 300000); inc(d2, '2026-10-19', 100000); ex(d2, '2026-10-19', 120000); ex(d2, '2026-10-20', 80000);
  eq('UT-78 income not added → 140.000', save(d2, '2026-10-21', 'weekly', 1200000, 300000).plan.dailyAllowance, 140000); }
{ const { d } = ut60(); const r = save(d, '2026-10-21', 'weekly', 1200000, 300000);
  eq('UT-88/BUG-01 re-edit same day keeps 140.000 & priorSpent 200.000', [r.plan.dailyAllowance, r.plan.priorSpent, d.budgetPlans.length], [140000, 200000, 2]); }
function ut86() { const { d } = ut60(); ex(d, '2026-10-21', 50000); const r = save(d, '2026-10-22', 'weekly', 1200000, 300000); return { d, r }; }
{ const { d, r } = ut86(); eq('UT-86 Thu re-edit 162.500 (not 212.500)', r.plan.dailyAllowance, 162500);
  eq('UT-86 history 19–20, 21–21, active 22–25', d.budgetPlans.map((p) => [p.startDate, p.endDate]), [['2026-10-19', '2026-10-20'], ['2026-10-21', '2026-10-21'], ['2026-10-22', '2026-10-25']]); }
{ const { d } = ut86(); ex(d, '2026-10-22', 40000); const r = save(d, '2026-10-23', 'weekly', 1200000, 300000);
  eq('UT-87 third edit 203.333, Sun 203.334', [r.plan.dailyAllowance, B.fixedAllowanceOn(r.plan, '2026-10-25')], [203333, 203334]); }
for (const [amt, ok] of [[550000, false], [549999, false], [550001, true]]) {
  const { d } = ut60(); ex(d, '2026-10-21', 50000); const r = save(d, '2026-10-22', 'weekly', amt, 300000);
  eq(`UT-89 ${amt} ${ok ? 'accepted' : 'rejected'}`, ok ? [r.plan?.dailyAllowance, B.fixedAllowanceOn(r.plan, '2026-10-25')] : !!r.error && d.budgetPlans.length === 2, ok ? [0, 1] : true); }
function ut80(extra) { const d = D(); if (extra) ex(d, '2026-10-15', 90000); save(d, '2026-10-19', 'weekly', 1000000, 300000); ex(d, '2026-10-19', 120000); ex(d, '2026-10-20', 80000); return save(d, '2026-10-21', 'monthly', 3000000, 520000); }
{ const r = ut80(false); eq('UT-80 weekly→monthly 207.272 / 31 Okt 207.280 / 11 hari', [r.plan.dailyAllowance, B.fixedAllowanceOn(r.plan, '2026-10-31'), B.planDays(r.plan)], [207272, 207280, 11]); }
{ const r = ut80(true); eq('UT-80a incl. 15 Okt → 199.090 / 31 Okt 199.100', [r.plan.dailyAllowance, B.fixedAllowanceOn(r.plan, '2026-10-31')], [199090, 199100]); }
{ const d = D(); save(d, '2026-10-01', 'monthly', 3000000, 520000); ex(d, '2026-10-15', 90000); ex(d, '2026-10-19', 120000); ex(d, '2026-10-20', 80000);
  eq('UT-81 monthly→weekly 100.000', save(d, '2026-10-21', 'weekly', 1000000, 300000).plan.dailyAllowance, 100000); }
eq('UT-82 pct .x5', [pct(15, 10000), pct(1005, 100000)], [0.2, 1]);
eq('UT-83 −12,25% → −12,3%', pct(35100 - 40000, 40000), -12.3);
eq('UT-90 small ±0,1%', [pct(9995 - 10000, 10000), pct(10005 - 10000, 10000)], [-0.1, 0.1]);
{ const d = D(); save(d, '2026-10-12', 'weekly', 1000000, 300000); ex(d, '2026-10-12', 10000); ex(d, '2026-10-19', 9995); eq('UT-90 recap changePct −0,1', recap(d, 'weekly', '2026-10-19').changePct, -0.1); }
{ const { d } = ut86(); const R = recap(d, 'weekly', '2026-10-22').planInfo;
  eq('UT-93 jatah minggu ini 900.000', R.portion, 900000); eq('UT-94 sisa 650.000, sesuai rencana', [R.remaining, R.achieved], [650000, true]);
  eq('UT-95 daily allowances per plan, sum 990.000', [R.rows.map((r) => r.fixed), R.dailyPortion], [[100000, 100000, 140000, 162500, 162500, 162500, 162500], 990000]);
  eq('UT-96 replaced 2 times', R.replacedCount, 2); eq('UT-99 status uses 900.000 not 990.000', R.remaining, 900000 - R.used); }
{ const d = D(); save(d, '2026-10-19', 'weekly', 1000000, 300000); const R = recap(d, 'weekly', '2026-10-19').planInfo; eq('UT-97 single plan: 700.000, no note', [R.portion, R.replacedCount], [700000, 0]); }
{ const d = D(); save(d, '2026-10-01', 'monthly', 3000000, 520000); ex(d, '2026-10-10', 1500000); const r = save(d, '2026-10-19', 'monthly', 3200000, 520000); const R = recap(d, 'monthly', '2026-10-19').planInfo;
  eq('UT-98 90.769 / 31 Okt 90.772 / jatah bulan 2.680.000 / diganti 1', [r.plan.dailyAllowance, B.fixedAllowanceOn(r.plan, '2026-10-31'), R.portion, R.replacedCount], [90769, 90772, 2680000, 1]); }
eq('BUG-02 "12,5" rejected', parseMoney('12,5').error, 'Nominal harus bilangan bulat (tanpa desimal)');
eq('BUG-02 "12.5" rejected', parseMoney('12.5').error, 'Nominal harus bilangan bulat (tanpa desimal)');
eq('BUG-02 mask leaves raw input unchanged', maskMoney('12,5', true), '12,5');
eq('BUG-05 13 digits rejected', parseMoney(maskMoney('1000000000000')).error, 'Nominal maksimum Rp999.999.999.999');
eq('BUG-05 max accepted', parseMoney('999.999.999.999').value, 999999999999);
eq('UT-91/G-04 "-5000" rejected', parseMoney('-5000').error, 'Nominal harus lebih dari 0');
eq('UT-91 "-1" rejected', parseMoney('-1').error, 'Nominal harus lebih dari 0');
eq('UT-92/N-02 adjustment may be negative', parseMoney('-50.000', { allowNeg: true, allowZero: true }).value, -50000);
eq('grouped ok', parseMoney('1.000.000').value, 1000000);
{ const p = { startDate: '2026-10-19', endDate: '2026-10-25', amountToAllocate: 1000000, savingAmount: 0 }; eq('BUG-04 last day 142.858', [B.fixedAllowanceOn(p, '2026-10-24'), B.fixedAllowanceOn(p, '2026-10-25')], [142857, 142858]); }
eq('BUG-03 114% → over', B.status(800000, 700000), 'over');
process.exit(fail ? 1 : 0);
