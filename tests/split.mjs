import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8931/');
await p.evaluate(() => { localStorage.clear(); const d = { settings: { schemaVersion: 1 }, accounts: [{ id: 'c', name: 'Dompet', type: 'cash', initialBalance: 2000000, archived: false, createdAt: '2026-10-01T08:00:00' }],
  transactions: [{ id: 't1', date: '2026-10-19', type: 'expense', amount: 200000, accountId: 'c', categoryId: 'expense-1', note: '', createdAt: '2026-10-19T10:00:00Z' }],
  budgetPlans: [{ id: 'p1', period: 'weekly', startDate: '2026-10-19', endDate: '2026-10-25', amountToAllocate: 1000000, savingAmount: 300000, dailyAllowance: 100000, createdAt: '2026-10-19T09:00:00Z', updatedAt: '2026-10-19T09:00:00Z' }] };
  localStorage.kk_data_v1 = JSON.stringify(d); });
await p.evaluate(() => location.hash = '#anggaran'); await p.reload(); await p.waitForTimeout(300);
await p.click('#plan-edit'); await p.fill('#plan-amt', '1200000'); await p.fill('#plan-saving', '300000'); await p.waitForTimeout(100);
const t = (await p.innerText('main')).replace(/\s+/g, ' ');
console.log(/Sudah terpakai Rp200\.000/.test(t) ? 'PASS' : 'FAIL', 'info sudah terpakai'); console.log(t.includes('Rp116.666') ? 'PASS' : 'FAIL', 'A-04 (1.200.000−300.000−200.000)/6 = 116.666');
await p.fill('#plan-saving', '1000000'); await p.waitForTimeout(100);
console.log((await p.innerText('main')).includes('tidak cukup setelah dikurangi') ? 'PASS' : 'FAIL', 'O-03 reject pool<=0');
await p.fill('#plan-saving', '300000'); await p.click('#plan-save'); await p.click('[data-yes]'); await p.waitForTimeout(200);
const plans = await p.evaluate(() => JSON.parse(localStorage.kk_data_v1).budgetPlans);
const ok = plans.length === 2 && plans[0].endDate === '2026-10-19' && plans[0].dailyAllowance === 100000 && plans[1].startDate === '2026-10-20' && plans[1].dailyAllowance === 116666;
console.log(ok ? 'PASS' : 'FAIL', 'F-11c split: old ends yesterday (keeps 100.000), new from today', JSON.stringify(plans.map(x => [x.startDate, x.endDate, x.dailyAllowance])));
await p.evaluate(() => location.hash = '#rekap'); await p.waitForTimeout(300); const r = (await p.innerText('main')).replace(/\s+/g, ' ');
console.log(r.includes('rencana diubah 20 Okt 2026') && r.includes('Lewat') ? 'PASS' : 'FAIL', 'recap shows split marker; Mon 200k vs 100k = Lewat');
console.log(errs.length ? 'FAIL errors ' + errs : 'PASS no JS errors'); await b.close();
