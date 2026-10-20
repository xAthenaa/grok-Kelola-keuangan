import * as B from '../js/budget.js';
import { recap, pct } from '../js/recap.js';
import { recompute, totals } from '../js/balance.js';
import { rp } from '../js/format.js';
let fail = 0, total = 0; const eq = (n, a, b) => { total++; const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); };
const wk = { startDate: '2026-10-19', endDate: '2026-10-25', amountToAllocate: 1000000, savingAmount: 300000, createdAt: 'x' };
eq('AC4 weekly 100.000', B.fixedAllowanceOn(wk, '2026-10-19'), 100000);
const mo = { startDate: '2026-10-01', endDate: '2026-10-31', amountToAllocate: 3000000, savingAmount: 520000, createdAt: 'x' };
eq('AC4 monthly 80.000', B.fixedAllowanceOn(mo, '2026-10-05'), 80000);
eq('AC4 reject saving>=amount', B.validatePlan(1000, 1000), 'Jumlah tabungan harus lebih kecil dari uang yang dibagi');
eq('reject 0', !!B.validatePlan(0, 0), true);
const rem = { startDate: '2026-10-19', endDate: '2026-10-25', amountToAllocate: 1000, savingAmount: 0, createdAt: 'x' };
eq('rounding remainder last day', [B.fixedAllowanceOn(rem, '2026-10-19'), B.fixedAllowanceOn(rem, '2026-10-25')], [142, 148]);
eq('status 80% safe', B.status(80000, 100000), 'safe'); eq('status 80.001% warn', B.status(80001, 100000), 'warn');
eq('status 100% warn', B.status(100000, 100000), 'warn'); eq('status >100 over', B.status(100001, 100000), 'over');
eq('A-08 fixed 0', [B.status(0, 0), B.status(1, 0)], ['safe', 'over']);
eq('A-04/IT-04 140.000', B.fixedAllowanceOn({ startDate: '2026-10-21', endDate: '2026-10-25', amountToAllocate: 1200000, savingAmount: 300000, priorSpent: 200000 }, '2026-10-21'), 140000);
eq('O-09 pct', pct(1, 3), 33.3);
const data = { accounts: [{ id: 'c', type: 'cash', initialBalance: 100000, createdAt: '2026-10-01T00' }, { id: 'b', type: 'bank', initialBalance: 900000, createdAt: '2026-10-01T00' }],
  transactions: [{ type: 'expense', amount: 30000, accountId: 'c', categoryId: 'e1', date: '2026-10-19' }, { type: 'transfer', amount: 50000, accountId: 'b', toAccountId: 'c', date: '2026-10-19' },
    { type: 'income', amount: 70000, accountId: 'b', categoryId: 'i1', date: '2026-10-20' }, { type: 'adjustment', amount: -5000, accountId: 'c', date: '2026-10-20' }, { type: 'expense', amount: 10000, accountId: 'c', categoryId: 'e2', date: '2026-10-12' }],
  budgetPlans: [], categories: [], savingGoals: [] };
recompute(data);
eq('balances', data.accounts.map((a) => a.balance), [100000 - 30000 + 50000 - 5000 - 10000, 900000 - 50000 + 70000]);
const R = recap(data, 'weekly', '2026-10-21');
eq('recap week income/expense (transfer+adj excluded)', [R.start, R.end, R.totalIncome, R.totalExpense, R.adjustTotal], ['2026-10-19', '2026-10-25', 70000, 30000, -5000]);
eq('recap reconciliation', R.openBal + R.totalIncome - R.totalExpense + R.adjustTotal + R.newAccOpening, R.closeBal);
eq('vs prev week +200%', R.changePct, 200);
const M = recap(data, 'monthly', '2026-10-21'); eq('monthly recap', [M.start, M.end, M.totalExpense, M.newAccOpening, M.openBal], ['2026-10-01', '2026-10-31', 40000, 1000000, 0]);
eq('monthly recon', M.openBal + M.totalIncome - M.totalExpense + M.adjustTotal + M.newAccOpening, M.closeBal);
// dynamic info
const d2 = { ...data, transactions: [{ type: 'expense', amount: 200000, date: '2026-10-19' }] };
eq('dynamic after Mon 200k', B.dynamicAllowanceOn(d2, wk, '2026-10-20'), Math.floor(500000 / 6));
eq('rp format', [rp(15000), rp(-50000), rp(1000000)], ['Rp15.000', '-Rp50.000', 'Rp1.000.000']);
console.log(`unit.mjs: ${total - fail}/${total} checks passed`);
process.exit(fail ? 1 : 0);
