// Grafik Jatah vs Aktual (SVG lokal) — BUG-10
// - SVG digambar pada lebar piksel nyata (tanpa preserveAspectRatio="none") → teks tidak melar
// - Hari mendatang: tanpa batang terisi, hanya garis putus-putus setinggi jatah + label "Mendatang"
// - Hari di luar rencana: kolom kosong berlabel "di luar rencana"
// - Hari ini/lampau: batang aktual berwarna status; pengeluaran 0 → penanda tipis + "Rp0"
// - Sumbu Y: tick bulat (1/2/2,5/5 × 10^n) dengan ruang di atas max(jatah, aktual, dinamis)
import { rp, rpShort, parse, DAYS, fmtDateLong } from './format.js';

export const ST_COLOR = { safe: '#15803D', warn: '#D97706', over: '#DC2626' };
const ST_TEXT = { safe: 'Aman', warn: 'Hampir habis', over: 'Lewat' };
export function niceScale(maxValue, targetTicks = 5, headroom = 1.2) {
  const target = Math.max(1, maxValue * headroom);
  const raw = target / targetTicks; const mag = 10 ** Math.floor(Math.log10(raw)); const n = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  const top = Math.ceil(target / step) * step; const ticks = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v));
  return { top, step, ticks };
}
export const tickLabel = (v) => 'Rp' + rpShort(v);
export function columnTitle(r) {
  const head = fmtDateLong(r.date);
  if (r.outside) return `${head}: di luar rencana`;
  if (r.future) return `${head}: mendatang · jatah tetap ${rp(r.fixed)}`;
  return `${head}: aktual ${rp(r.actual)} · jatah tetap ${rp(r.fixed)} · jatah dinamis ${rp(r.dyn)} · ${ST_TEXT[r.status] || ''}`;
}
// design.md Addendum v1.2.1 (FINAL): tinggi 260px desktop / 220px HP, batang ≤60% kolom & maks 48px, radius atas 6px, label 12px #6B7280
export const chartHeight = (width) => (width >= 640 ? 260 : 220);
const topRounded = (x, y, w, h, r) => { r = Math.min(r, w / 2, h); return `M${x.toFixed(1)},${(y + h).toFixed(1)} V${(y + r).toFixed(1)} Q${x.toFixed(1)},${y.toFixed(1)} ${(x + r).toFixed(1)},${y.toFixed(1)} H${(x + w - r).toFixed(1)} Q${(x + w).toFixed(1)},${y.toFixed(1)} ${(x + w).toFixed(1)},${(y + r).toFixed(1)} V${(y + h).toFixed(1)} Z`; };
export function barChartSVG(rows, { width = 600, monthly = false, height = chartHeight(width) } = {}) {
  const n = rows.length; if (!n) return '';
  const padL = 56, padR = 8, padT = 14, padB = monthly ? 24 : 36;
  const minCol = monthly ? 16 : 0; const W = Math.max(width, monthly ? padL + padR + n * minCol : 0);
  const colW = (W - padL - padR) / n; const bw = Math.max(4, Math.min(48, colW * 0.6));
  const vals = rows.flatMap((r) => (r.outside ? [] : [r.fixed || 0, r.future ? 0 : r.actual || 0, !r.future && r.dyn > 0 ? r.dyn : 0]));
  const { top, ticks } = niceScale(Math.max(0, ...vals));
  const baseY = height - padB, plotH = baseY - padT; const y = (v) => baseY - (Math.max(0, v) / top) * plotH;
  let grid = '', cols = '', fixedPath = '', dynPts = [], labels = '';
  for (const t of ticks) grid += `<line x1="${padL}" x2="${W - padR}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="#E5E7EB"/><text x="${padL - 6}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end" font-size="12" fill="#6B7280" data-tick="${t}">${tickLabel(t)}</text>`;
  let prevFixed = null;
  rows.forEach((r, i) => {
    const cx = padL + colW * (i + 0.5), x = cx - bw / 2; let g = '';
    const kind = r.outside ? 'outside' : r.future ? 'future' : 'past';
    if (r.outside) {
      g += `<rect x="${(padL + colW * i + 1).toFixed(1)}" y="${padT}" width="${(colW - 2).toFixed(1)}" height="${plotH}" fill="url(#kk-hatch)" opacity=".5"/>`;
      if (!monthly && colW >= 30) { const fs = colW >= 48 ? 10 : 8.5; g += `<text x="${cx.toFixed(1)}" y="${baseY - 18}" text-anchor="middle" font-size="${fs}" fill="#6B7280" data-kind="outside-label">di luar</text><text x="${cx.toFixed(1)}" y="${baseY - 6}" text-anchor="middle" font-size="${fs}" fill="#6B7280">rencana</text>`; }
      prevFixed = null;
    } else {
      if (r.future) {
        const yy = y(r.fixed); g += `<rect x="${x.toFixed(1)}" y="${yy.toFixed(1)}" width="${bw.toFixed(1)}" height="${(baseY - yy).toFixed(1)}" rx="3" fill="none" stroke="#9CA3AF" stroke-width="1.2" stroke-dasharray="4 3" data-kind="future-outline"/>`;
        if (!monthly && colW >= 64) g += `<text x="${cx.toFixed(1)}" y="${baseY - 6}" text-anchor="middle" font-size="9.5" fill="#6B7280">Mendatang</text>`; // kolom sempit: dijelaskan legenda
      } else if (r.actual > 0) {
        const hh = Math.max(2, baseY - y(r.actual)); g += `<path d="${topRounded(x, baseY - hh, bw, hh, 6)}" fill="${ST_COLOR[r.status]}" data-kind="actual" data-status="${r.status}" data-w="${bw.toFixed(1)}"/>`;
      } else {
        g += `<rect x="${x.toFixed(1)}" y="${baseY - 3}" width="${bw.toFixed(1)}" height="3" rx="1.5" fill="${ST_COLOR.safe}" data-kind="zero"/>`;
        if (!monthly) g += `<text x="${cx.toFixed(1)}" y="${baseY - 8}" text-anchor="middle" font-size="10" fill="#166534" font-weight="600">Rp0</text>`;
      }
      // Jatah tetap: garis tangga kontinu antar hari dalam rencana
      const fy = y(r.fixed).toFixed(1), xl = (padL + colW * i).toFixed(1), xr = (padL + colW * (i + 1)).toFixed(1);
      fixedPath += prevFixed === null ? `M${xl},${fy} L${xr},${fy} ` : `L${xl},${fy} L${xr},${fy} `; prevFixed = r.fixed;
      if (!r.future) dynPts.push({ x: cx, v: r.dyn, fixed: r.fixed });
    }
    cols += `<g data-col="${r.date}" data-kind="${kind}"><title>${columnTitle(r)}</title><rect x="${(padL + colW * i).toFixed(1)}" y="${padT}" width="${colW.toFixed(1)}" height="${plotH}" fill="transparent"/>${g}</g>`;
    const d = parse(r.date); const lab = monthly ? d.getDate() : DAYS[d.getDay()];
    if (!monthly || d.getDate() === 1 || d.getDate() % 5 === 0) labels += `<text x="${cx.toFixed(1)}" y="${height - (monthly ? 6 : 14)}" text-anchor="middle" font-size="12" fill="#6B7280" ${r.isToday ? 'font-weight="700"' : ''}>${lab}</text>`;
    if (!monthly && r.isToday) labels += `<text x="${cx.toFixed(1)}" y="${height - 2}" text-anchor="middle" font-size="9" fill="#166534">hari ini</text>`;
  });
  // Jatah dinamis: putus-putus, warna berbeda; digeser 3px ke atas bila sama dengan jatah tetap agar tetap terlihat
  const dyn = dynPts.map((p) => `${p.x.toFixed(1)},${(y(p.v) - (p.v === p.fixed ? 3 : 0)).toFixed(1)}`);
  const dynSvg = dyn.length > 1 ? `<polyline points="${dyn.join(' ')}" stroke="#22C55E" stroke-width="2" stroke-dasharray="6 4" fill="none" data-kind="dyn"/>`
    : dyn.length === 1 ? `<circle cx="${dyn[0].split(',')[0]}" cy="${dyn[0].split(',')[1]}" r="3.5" fill="#fff" stroke="#22C55E" stroke-width="2" data-kind="dyn"/>` : '';
  return `<svg width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" role="img" aria-label="Grafik jatah vs aktual per hari; rincian di tabel di bawah" data-top="${top}">
    <defs><pattern id="kk-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#E5E7EB" stroke-width="3"/></pattern></defs>
    ${grid}${cols}<path d="${fixedPath}" stroke="#166534" stroke-width="2.5" fill="none" data-kind="fixed"/>${dynSvg}
    <line x1="${padL}" x2="${W - padR}" y1="${baseY}" y2="${baseY}" stroke="#9CA3AF"/>${labels}</svg>`;
}
