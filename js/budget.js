// Rencana jatah (F-11..F-12, §7 v1.2)
import { addDays, diffDays, weekStart, weekEnd, monthStart, monthEnd, today } from './format.js';

export function periodRange(period, refDate = today(), fromToday = true) {
  const start = period === 'weekly' ? weekStart(refDate) : monthStart(refDate);
  const end = period === 'weekly' ? weekEnd(refDate) : monthEnd(refDate);
  return { fullStart: start, start: fromToday && refDate > start ? refDate : start, end };
}
export const planDays = (p) => diffDays(p.startDate, p.endDate) + 1;
export function validatePlan(amount, saving) {
  if (!(amount > 0)) return 'Uang yang dibagi harus lebih dari Rp0';
  if (saving < 0) return 'Jumlah ditabung tidak boleh negatif';
  if (saving >= amount) return 'Jumlah tabungan harus lebih kecil dari uang yang dibagi';
  return null;
}
export const MAX_AMOUNT = 999999999999;
// A-04: priorSpent = pengeluaran yang sudah terjadi di rencana lama (periode yang sama) saat rencana diganti
export const planPool = (p) => p.amountToAllocate - p.savingAmount - (p.priorSpent || 0);
export const calcDaily = (amount, saving, days, prior = 0) => Math.max(0, Math.floor((amount - saving - prior) / days));
export function fixedAllowanceOn(p, date) {
  if (p.closedEarly && Number.isFinite(p.dailyAllowance)) return p.dailyAllowance; // rencana ditutup lebih awal: jatah tetap aslinya dipertahankan
  const days = planDays(p); const pool = Math.max(0, planPool(p)); const base = Math.floor(pool / days);
  return date === p.endDate ? base + (pool - base * days) : base;
}
export function activePlan(data, date = today()) {
  return data.budgetPlans.filter((p) => p.startDate <= date && date <= p.endDate).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null;
}
const sumBy = (data, type, from, to) => data.transactions.reduce((s, t) => (t.type === type && t.date >= from && t.date <= to ? s + t.amount : s), 0);
export const expenseOn = (data, d) => sumBy(data, 'expense', d, d);
export const expenseBetween = (data, a, b) => sumBy(data, 'expense', a, b);
export const incomeBetween = (data, a, b) => sumBy(data, 'income', a, b);
// Jatah dinamis (INFO SAJA, tidak memengaruhi status) hari d =
// floor((dibagi − ditabung − priorSpent − pengeluaran rencana s.d. kemarin + pemasukan startDate..min(d, hari ini)) / sisa hari termasuk d)
// A-06: pemasukan hanya startDate s/d hari ini. A-08: boleh negatif. A-15: penyesuaian/transfer tidak dihitung.
export function dynamicAllowanceOn(data, p, d) {
  const remDays = diffDays(d, p.endDate) + 1; const t = today(); const incTo = d < t ? d : t;
  const pool = planPool(p) - expenseBetween(data, p.startDate, addDays(d, -1)) + incomeBetween(data, p.startDate, incTo);
  return Math.floor(pool / remDays);
}
// Status (design v1.2 §8 #4: memakai jatah TETAP): ≤80% Aman, >80% s.d. 100% Hampir habis, >100% Lewat
export function status(spent, allowance) {
  if (allowance <= 0) return spent > 0 ? 'over' : 'safe';
  const r = spent / allowance;
  return r > 1 ? 'over' : r > 0.8 ? 'warn' : 'safe';
}
export const STATUS_LABEL = { safe: 'Aman', warn: 'Hampir habis', over: 'Lewat', future: 'Belum', none: '—' };
export function dailyRows(data, p, from = p.startDate, to = p.endDate) {
  const t = today(); const rows = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (d < p.startDate || d > p.endDate) { rows.push({ date: d, outside: true, actual: expenseOn(data, d), isToday: d === t, future: d > t, status: 'none' }); continue; }
    const fixed = fixedAllowanceOn(p, d); const dyn = dynamicAllowanceOn(data, p, d); const actual = expenseOn(data, d);
    rows.push({ date: d, fixed, dyn, actual, isToday: d === t, future: d > t, status: d > t ? 'future' : status(actual, fixed) });
  }
  return rows;
}
export function planSummary(data, p) {
  const used = expenseBetween(data, p.startDate, p.endDate);
  const budget = p.closedEarly ? p.dailyAllowance * planDays(p) : Math.max(0, planPool(p));
  return { used, budget, remaining: budget - used, achieved: budget - used >= 0 };
}
