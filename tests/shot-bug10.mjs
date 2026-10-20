// Screenshot grafik Jatah vs Aktual untuk BUG-10 (before/after). Usage: node shot-bug10.mjs <prefix>
import { chromium } from 'playwright-core';
const BASE = process.env.KK_URL || 'http://localhost:8957/'; const prefix = process.argv[2] || 'after';
const OUT = '/workspace/kelola-keuangan/site-screens/';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const scen = {
  'baru-tanpa-transaksi': { day: '20', tx: [] },
  'tengah-minggu': { day: '23', tx: [['2026-10-20', 9000], ['2026-10-21', 16000], ['2026-10-22', 0]] },
  'lewat-jatah': { day: '23', tx: [['2026-10-20', 25000], ['2026-10-21', 15000], ['2026-10-23', 30000]] } };
for (const w of [375, 1280]) for (const [name, s] of Object.entries(scen)) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, timezoneId: 'Asia/Shanghai' }); const p = await ctx.newPage();
  await p.clock.setFixedTime(new Date(`2026-10-${s.day}T12:00:00+08:00`)); await p.goto(BASE);
  await p.evaluate((tx) => { localStorage.kk_data_v1 = JSON.stringify({ settings: { schemaVersion: 1 }, accounts: [{ id: 'c', name: 'Dompet', type: 'cash', initialBalance: 500000, archived: false, createdAt: '2026-10-01T08:00:00' }],
    transactions: tx.filter(([, a]) => a > 0).map(([date, amount], i) => ({ id: 't' + i, date, type: 'expense', amount, accountId: 'c', categoryId: 'expense-1', note: '', createdAt: date + 'T10:00:00Z' })),
    budgetPlans: [{ id: 'p', period: 'weekly', startDate: '2026-10-20', endDate: '2026-10-25', amountToAllocate: 120000, savingAmount: 17148, dailyAllowance: 17142, createdAt: '2026-10-20T02:00:00Z', updatedAt: '2026-10-20T02:00:00Z' }] }); }, s.tx);
  await p.goto(BASE + '#anggaran'); await p.reload(); await p.waitForTimeout(300);
  const card = p.locator('section.card', { hasText: 'Jatah vs Aktual' }).first();
  await card.screenshot({ path: `${OUT}bug10-${prefix}-${name}-${w}.png` }); await ctx.close(); }
await b.close(); console.log('ok');
