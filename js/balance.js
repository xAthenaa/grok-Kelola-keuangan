// Hitung saldo dari transaksi (F-02, F-05, F-06, F-10)
export function effect(t, accId) {
  let e = 0;
  if (t.type === 'income' && t.accountId === accId) e += t.amount;
  if (t.type === 'expense' && t.accountId === accId) e -= t.amount;
  if (t.type === 'adjustment' && t.accountId === accId) e += t.amount; // bertanda
  if (t.type === 'transfer') { if (t.accountId === accId) e -= t.amount; if (t.toAccountId === accId) e += t.amount; }
  return e;
}
export function balanceAt(data, acc, untilDate /* inklusif, opsional */) {
  // A-20: saldo awal berlaku per tanggal createdAt akun (bukan pemasukan)
  const init = !untilDate || (acc.createdAt || '').slice(0, 10) <= untilDate ? acc.initialBalance : 0;
  return data.transactions.reduce((s, t) => (untilDate && t.date > untilDate ? s : s + effect(t, acc.id)), init);
}
export function recompute(data) { for (const a of data.accounts) a.balance = balanceAt(data, a); }
export function totals(data, untilDate) {
  let cash = 0, digital = 0;
  for (const a of data.accounts) { const b = untilDate ? balanceAt(data, a, untilDate) : a.balance; if (a.type === 'cash') cash += b; else digital += b; }
  return { total: cash + digital, cash, digital };
}
