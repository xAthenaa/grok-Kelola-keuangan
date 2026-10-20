// Format Rupiah, tanggal, minggu Senin–Minggu (F-17, NF-04, NF-05)
export const toInt = (v) => { const n = parseInt(String(v ?? '').replace(/[^\d-]/g, ''), 10); return Number.isFinite(n) ? n : 0; };
export const groupDigits = (n) => String(Math.abs(Math.trunc(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export const rp = (n) => (n < 0 ? '-' : '') + 'Rp' + groupDigits(n);
export const rpSigned = (n) => (n > 0 ? '+' : n < 0 ? '-' : '') + 'Rp' + groupDigits(n);
export const rpShort = (n) => { const a = Math.abs(n); const s = n < 0 ? '-' : '';
  if (a >= 1e6) return s + (Math.round(a / 1e5) / 10).toString().replace('.', ',') + 'jt';
  if (a >= 1e3) return s + Math.round(a / 1e3) + 'rb'; return s + a; };
export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const today = () => ymd(new Date());
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
export const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
export const weekStart = (s) => { const d = parse(s); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return ymd(d); };
export const weekEnd = (s) => addDays(weekStart(s), 6);
export const monthStart = (s) => s.slice(0, 8) + '01';
export const monthEnd = (s) => { const d = parse(s); return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
export const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
export const DAYS_LONG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const MONTHS_LONG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const fmtDate = (s) => { const d = parse(s); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
export const fmtDateLong = (s) => { const d = parse(s); return `${DAYS_LONG[d.getDay()]}, ${fmtDate(s)}`; };
export const dayShort = (s) => DAYS[parse(s).getDay()];
export const fmtRange = (a, b) => { const A = parse(a), B = parse(b);
  return `${DAYS[A.getDay()]} ${A.getDate()}${A.getMonth() !== B.getMonth() ? ' ' + MONTHS[A.getMonth()] : ''} – ${DAYS[B.getDay()]} ${B.getDate()} ${MONTHS[B.getMonth()]} ${B.getFullYear()}`; };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

// Parse nominal (A-14, AC-7): hanya bilangan bulat; desimal, negatif (kecuali allowNeg) & > maks ditolak, tidak diubah diam-diam
export const MAX_AMOUNT = 999999999999;
export function parseMoney(rawIn, { allowZero = false, allowNeg = false } = {}) {
  // BUG-09: awalan 'Rp' (tanpa beda huruf besar/kecil, spasi opsional) diterima
  const raw = String(rawIn ?? '').trim().replace(/^rp\s*/i, '').replace(/\s+/g, '');
  if (!raw) return { error: 'Nominal wajib diisi' };
  const neg = raw.startsWith('-'); const body = neg ? raw.slice(1) : raw;
  if (/,/.test(body) || (body.includes('.') && !/^\d{1,3}(\.\d{3})+$/.test(body))) return { error: 'Nominal harus bilangan bulat (tanpa desimal)' };
  if (!/^[\d.]+$/.test(body)) return { error: 'Nominal hanya boleh angka' };
  if (neg && !allowNeg) return { error: 'Nominal harus lebih dari 0' };
  const digits = body.replace(/\./g, '').replace(/^0+(?=\d)/, '');
  if (digits.length > 12 || +digits > MAX_AMOUNT) return { error: 'Nominal maksimum Rp999.999.999.999' };
  const v = (neg ? -1 : 1) * Number(digits);
  if (v === 0 && !allowZero) return { error: 'Nominal harus lebih dari Rp0' };
  return { value: v || 0 };
}
// Mask: format titik ribuan hanya jika isinya murni digit (opsional '-' di depan); selain itu dibiarkan apa adanya agar bisa ditolak
export function maskMoney(value, rawMode) {
  if (rawMode) return value;
  const m = /^(-?)([\d.]*)$/.exec(value); if (!m) return value;
  const digits = m[2].replace(/\./g, ''); return m[1] + (digits ? digits.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '');
}
