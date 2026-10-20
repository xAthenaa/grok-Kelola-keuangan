// Rekap mingguan & bulanan (F-14, §8 requirements, §5.5 design v1.2)
import { addDays, weekStart, monthStart, monthEnd } from './format.js';
import { balanceAt, totals } from './balance.js';
import { dailyRows, fixedAllowanceOn } from './budget.js';

// O-09: persen dengan bilangan bulat
// G-03: pembulatan simetris (−12,25% → −12,3%), tetap bilangan bulat sesuai O-09
export const pct = (part, total) => { const v = Math.round((Math.abs(part) * 1000) / Math.abs(total)) / 10; return (part < 0) !== (total < 0) && v !== 0 ? -v : v; };
export function recapRange(mode, anyDate) {
  if (mode === 'monthly') { const start = monthStart(anyDate), end = monthEnd(anyDate); const ps = monthStart(addDays(start, -1)); return { start, end, prevStart: ps, prevEnd: addDays(start, -1) }; }
  const start = weekStart(anyDate); return { start, end: addDays(start, 6), prevStart: addDays(start, -7), prevEnd: addDays(start, -1) };
}
export function recap(data, mode, anyDate) {
  const { start, end, prevStart, prevEnd } = recapRange(mode, anyDate);
  const inR = data.transactions.filter((t) => t.date >= start && t.date <= end);
  const income = inR.filter((t) => t.type === 'income'), expense = inR.filter((t) => t.type === 'expense');
  const sum = (a) => a.reduce((s, t) => s + t.amount, 0);
  const byCat = (arr) => { const m = new Map(); for (const t of arr) m.set(t.categoryId, (m.get(t.categoryId) || 0) + t.amount);
    const tot = sum(arr); return [...m].map(([categoryId, amount]) => ({ categoryId, amount, pct: pct(amount, tot) })).sort((a, b) => b.amount - a.amount); };
  const totalIncome = sum(income), totalExpense = sum(expense);
  const adjustments = inR.filter((t) => t.type === 'adjustment'); // A-15: tampil terpisah
  // O-07/O-08: saldo awal akun yang dibuat dalam rentang
  const newAccounts = data.accounts.filter((a) => { const c = (a.createdAt || '').slice(0, 10); return c >= start && c <= end; });
  const newAccOpening = newAccounts.reduce((s, a) => s + a.initialBalance, 0);
  const transfers = inR.filter((t) => t.type === 'transfer');
  const prevExpense = sum(data.transactions.filter((t) => t.type === 'expense' && t.date >= prevStart && t.date <= prevEnd));
  // Semua rencana yang beririsan dengan rentang (rencana di-split ditandai)
  const plans = data.budgetPlans.filter((p) => p.startDate <= end && p.endDate >= start).sort((a, b) => a.startDate.localeCompare(b.startDate));
  let planInfo = null;
  if (plans.length) {
    let portion = 0, used = 0;
    for (const p of plans) {
      const from = p.startDate > start ? p.startDate : start, to = p.endDate < end ? p.endDate : end;
      for (let d = from; d <= to; d = addDays(d, 1)) portion += fixedAllowanceOn(p, d);
      used += sum(expense.filter((t) => t.date >= from && t.date <= to));
    }
    // A-12: seluruh rentang kalender; hari tanpa rencana berstatus "—"
    const rows = [];
    for (let d = start; d <= end; d = addDays(d, 1)) { const p = plans.find((q) => q.startDate <= d && d <= q.endDate) || plans[0]; rows.push({ ...dailyRows(data, p, d, d)[0], planId: p.id }); }
    const last = plans[plans.length - 1];
    const hasMonthly = plans.some((p) => p.period === 'monthly');
    // N-03: jatah periode = uang dibagi − tabungan dari rencana TERAKHIR; dailyPortion = jumlah jatah tetap harian (grafik)
    const periodBudget = last.amountToAllocate - last.savingAmount;
    planInfo = { plans, last, showSaving: !(mode === 'weekly' && hasMonthly), /* A-11 */ portion: periodBudget, dailyPortion: portion, replacedCount: plans.length - 1, used, remaining: periodBudget - used, achieved: periodBudget - used >= 0, rows, splitDates: plans.slice(1).map((p) => p.startDate),
      overDays: rows.filter((r) => r.status === 'over').length };
  }
  const weeks = [];
  if (mode === 'monthly') for (let w = weekStart(start), i = 1; w <= end; w = addDays(w, 7), i++) {
    const a = w < start ? start : w, b = addDays(w, 6) > end ? end : addDays(w, 6);
    weeks.push({ label: `M${i}`, start: a, end: b, expense: sum(expense.filter((t) => t.date >= a && t.date <= b)), income: sum(income.filter((t) => t.date >= a && t.date <= b)) });
  }
  return { mode, start, end, newAccOpening, newAccounts, adjustTotal: sum(adjustments), adjustCount: adjustments.length, transferCount: transfers.length, totalIncome, totalExpense, net: totalIncome - totalExpense,
    openBal: totals(data, addDays(start, -1)).total, closeBal: totals(data, end).total,
    expenseByCat: byCat(expense), incomeByCat: byCat(income), top3: [...expense].sort((a, b) => b.amount - a.amount || b.date.localeCompare(a.date)).slice(0, 3),
    prevExpense, changePct: prevExpense ? pct(totalExpense - prevExpense, prevExpense) : null,
    accounts: data.accounts.map((a) => ({ account: a, open: balanceAt(data, a, addDays(start, -1)), close: balanceAt(data, a, end) })), planInfo, weeks };
}
