// Satu-satunya modul yang menyentuh localStorage (NF-03)
export const KEY = 'kk_data_v1';
export const SCHEMA_VERSION = 1;
const INCOME = [['Gaji', '💼'], ['Bonus', '🎁'], ['Usaha/Freelance', '🧑‍💻'], ['Hadiah', '🎀'], ['Lainnya', '➕']];
const EXPENSE = [['Makan & Minum', '🍜'], ['Transportasi', '🚌'], ['Belanja', '🛒'], ['Tagihan', '🧾'], ['Hiburan', '🎮'], ['Kesehatan', '💊'], ['Pendidikan', '📚'], ['Lainnya', '📦']];
export function defaultCategories() {
  const mk = (kind) => ([name, icon], i) => ({ id: `${kind}-${i + 1}`, name, kind, icon, isDefault: true, archived: false });
  return [...INCOME.map(mk('income')), ...EXPENSE.map(mk('expense'))];
}
export function emptyData() {
  return { settings: { currency: 'IDR', weekStartsOn: 1, schemaVersion: SCHEMA_VERSION, lastExport: null },
    accounts: [], categories: defaultCategories(), transactions: [], budgetPlans: [], savingGoals: [] };
}
export function migrate(d) {
  if (!d || typeof d !== 'object') return emptyData();
  const base = emptyData();
  const out = { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}) } };
  for (const k of ['accounts', 'categories', 'transactions', 'budgetPlans', 'savingGoals']) if (!Array.isArray(out[k])) out[k] = base[k];
  out.settings.schemaVersion = SCHEMA_VERSION; // v1: belum ada migrasi
  return out;
}
export function exists() { try { return localStorage.getItem(KEY) !== null; } catch { return false; } }
export function load() { try { const raw = localStorage.getItem(KEY); return raw ? migrate(JSON.parse(raw)) : emptyData(); } catch { return emptyData(); } }
export function save(d) { localStorage.setItem(KEY, JSON.stringify(d)); }
export function clear() { localStorage.removeItem(KEY); }
export function validateImport(obj) {
  if (!obj || typeof obj !== 'object') return 'File bukan JSON yang valid.';
  for (const k of ['accounts', 'categories', 'transactions']) if (!Array.isArray(obj[k])) return `Struktur tidak dikenali: "${k}" tidak ada.`;
  const v = obj.settings?.schemaVersion ?? 1; if (v > SCHEMA_VERSION) return 'Versi data lebih baru dari aplikasi ini.';
  return null;
}
