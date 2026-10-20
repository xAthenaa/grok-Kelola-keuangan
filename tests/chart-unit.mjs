// BUG-10 regresi grafik (node, tanpa browser)
import { barChartSVG, niceScale, chartHeight } from '../js/chart.js';
import { dailyRows } from '../js/budget.js';
let fail = 0, total = 0; const eq = (n, a, b) => { total++; const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); };
const plan = { startDate: '2026-10-20', endDate: '2026-10-25', amountToAllocate: 120000, savingAmount: 17148 };
const mk = (todayStr, tx) => { const data = { transactions: tx.map(([date, amount]) => ({ type: 'expense', amount, date })) };
  // dailyRows memakai today(); tentukan future/isToday/status secara eksplisit agar deterministik
  return dailyRows(data, plan, '2026-10-19', '2026-10-25').map((r) => ({ ...r, isToday: r.date === todayStr, future: r.date > todayStr, status: r.outside ? 'none' : r.date > todayStr ? 'future' : r.actual > r.fixed ? 'over' : r.actual > r.fixed * 0.8 ? 'warn' : 'safe' })); };
const count = (svg, re) => (svg.match(re) || []).length;
eq('nice ticks 17.142 → 0/5rb/…/25rb (×1,2 headroom)', niceScale(17142).ticks, [0, 5000, 10000, 15000, 20000, 25000]);
eq('nice ticks 30.000 → top 40rb', niceScale(30000).top, 40000);
eq('height 220 HP / 260 desktop', [chartHeight(320), chartHeight(900)], [220, 260]);
{ const svg = barChartSVG(mk('2026-10-20', []), { width: 320 });
  eq('new plan, no tx: 7 columns', count(svg, /data-col="/g), 7);
  eq('new plan: 5 future outlines, 0 filled actual bars', [count(svg, /data-kind="future-outline"/g), count(svg, /data-kind="actual"/g)], [5, 0]);
  eq('new plan: today zero marker + Rp0 label', [count(svg, /data-kind="zero"/g), count(svg, />Rp0</g) >= 2], [1, true]);
  eq('Monday outside plan labeled "di luar rencana"', [count(svg, /data-kind="outside"/g), /di luar( rencana)?<\/text>/.test(svg), svg.includes('Senin, 19 Okt 2026: di luar rencana')], [1, true, true]);
  eq('no preserveAspectRatio="none", real width', [svg.includes('preserveAspectRatio'), /width="320" height="220" viewBox="0 0 320 220"/.test(svg)], [false, true]);
  eq('tooltip full amount Rp17.142', svg.includes('jatah tetap Rp17.142'), true);
  eq('dynamic line visible when equal to fixed (circle offset 3px)', /data-kind="dyn"/.test(svg), true); }
{ const svg = barChartSVG(mk('2026-10-23', [['2026-10-20', 9000], ['2026-10-21', 16000]]), { width: 900 });
  eq('mid-week: 2 actual bars, 2 zero markers, 2 future outlines', [count(svg, /data-kind="actual"/g), count(svg, /data-kind="zero"/g), count(svg, /data-kind="future-outline"/g)], [2, 2, 2]);
  eq('mid-week statuses safe + warn', [...svg.matchAll(/data-status="(\w+)"/g)].map((m) => m[1]), ['safe', 'warn']);
  const ws = [...svg.matchAll(/data-w="([\d.]+)"/g)].map((m) => +m[1]); const colW = (900 - 56 - 8) / 7;
  eq('bar width ≤ 48px and ≤ 60% column', ws.every((w) => w <= 48 && w <= colW * 0.6 + 0.01), true);
  eq('fixed line continuous single path', count(svg, /data-kind="fixed"/g), 1);
  eq('rounded top corners (Q curves)', /data-kind="actual"/.test(svg) && /d="M[^"]*Q[^"]*Q/.test(svg), true); }
{ const svg = barChartSVG(mk('2026-10-23', [['2026-10-20', 25000], ['2026-10-21', 15000], ['2026-10-23', 30000]]), { width: 400 });
  eq('over jatah: red bars for 25.000 and 30.000', [...svg.matchAll(/data-status="(\w+)"/g)].map((m) => m[1]), ['over', 'warn', 'over']);
  eq('over jatah: y top 40rb above max 30.000', /data-top="40000"/.test(svg), true);
  eq('future bars never filled (height uses 0, not jatah)', count(svg, /data-kind="actual"/g), 3); }
for (const w of [320, 375, 768, 1280]) { const s = barChartSVG(mk('2026-10-23', [['2026-10-20', 9000]]), { width: w });
  const fs = [...s.matchAll(/font-size="([\d.]+)"[^>]*data-kind="(outside|future)-label"/g)].map((m) => +m[1]);
  eq(`labels 12px at ${w}px: 1×"di luar rencana" + 2×"Mendatang"`, [s.match(/data-kind="future-label"/g)?.length, fs.length >= 3 && fs.every((f) => f >= 12)], [2, true]); }
console.log(`chart-unit.mjs: ${total - fail}/${total} checks passed`); process.exit(fail ? 1 : 0);
