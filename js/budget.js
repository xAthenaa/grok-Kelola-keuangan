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
export { MAX_AMOUNT } from './format.js';
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

// G-02 (v1.6, menggantikan O-06; juga memperbaiki BUG-01): saat rencana diganti/diedit, yang dikurangkan adalah
// SEMUA pengeluaran dari awal periode rencana baru s/d kemarin, apa pun rencana yang aktif waktu itu.
export function priorSpentFor(data, existing, newFullStart, t = today()) {
  if (!existing) return { prior: 0, from: null };
  const yest = addDays(t, -1);
  return { prior: newFullStart <= yest ? expenseBetween(data, newFullStart, yest) : 0, from: newFullStart };
}

// Simpan rencana (F-11, F-11b, F-11c, A-04, A-13, O-03, G-02). Rencana aktif yang dibuat hari ini diubah di tempat;
// selain itu rencana aktif ditutup per kemarin (jatah tetap aslinya dipertahankan) dan rencana baru mulai hari ini.
export function savePlan(data, { period, amount, saving }, t = today(), now = new Date().toISOString(), id = null) {
  const err = validatePlan(amount, saving); if (err) return { error: err };
  const r = periodRange(period, t, true); const active = activePlan(data, t);
  const { prior } = priorSpentFor(data, active, r.fullStart, t);
  const pool = amount - saving - prior;
  if (pool <= 0) return { error: `Uang yang dibagi tidak cukup setelah dikurangi tabungan dan pengeluaran yang sudah terjadi (Rp${String(Math.abs(pool)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${pool < 0 ? ' kurang' : ''})`.replace('(Rp0)', '(Rp0)') };
  const plan = { period, startDate: r.start, endDate: r.end, amountToAllocate: amount, savingAmount: saving, priorSpent: prior, updatedAt: now };
  let result;
  if (active && active.startDate === t) { Object.assign(active, plan); result = active; }
  else {
    if (active) { active.dailyAllowance = fixedAllowanceOn(active, active.startDate); active.originalEndDate = active.endDate; active.endDate = addDays(t, -1); active.closedEarly = true; active.updatedAt = now; }
    result = { id: id || (globalThis.crypto?.randomUUID ? crypto.randomUUID() : String(Date.now())), ...plan, createdAt: now }; data.budgetPlans.push(result);
  }
  result.dailyAllowance = Math.floor(pool / planDays(result));
  return { plan: result, prior };
}
