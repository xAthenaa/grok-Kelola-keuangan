// Kelola Keuangan — router hash + render halaman
import * as F from './format.js';
import * as S from './storage.js';
import { recompute, totals, balanceAt } from './balance.js';
import * as B from './budget.js';
import { recap, pct } from './recap.js';

const { rp, rpSigned, esc, today } = F;
let data = S.load();
recompute(data);
const ui = { txFilter: { q: '', period: 'week', from: '', to: '', account: '', category: '', type: '' }, recapMode: null, recapDate: today(),
  budgetView: '7', showArchived: false, catKind: 'expense' };
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const ROUTES = [
  ['dashboard', 'Dashboard', '🏠'], ['transaksi', 'Transaksi', '📋'], ['akun', 'Akun', '💳'],
  ['anggaran', 'Anggaran', '🎯'], ['rekap', 'Rekap', '📊'], ['pengaturan', 'Pengaturan', '⚙️']];
const TYPE_LABEL = { income: 'Pemasukan', expense: 'Pengeluaran', transfer: 'Transfer', adjustment: 'Penyesuaian' };
const ACC_TYPE = { cash: 'Cash', bank: 'Bank', ewallet: 'E-wallet' };
const ACC_ICON = { cash: '💵', bank: '🏦', ewallet: '📱' };
const PALETTE = ['#15803D', '#22C55E', '#14B8A6', '#0EA5E9', '#F59E0B', '#A855F7', '#EC4899', '#94A3B8'];
const pctStr = (v) => String(v).replace('.', ',') + '%';

function persist(msg = 'Tersimpan') { recompute(data); S.save(data); render(); if (msg) toast(msg); }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2200); }
const cat = (id) => data.categories.find((c) => c.id === id);
const acc = (id) => data.accounts.find((a) => a.id === id);
const catName = (id) => { const c = cat(id); return c ? c.name : '—'; };
const activeAccounts = () => data.accounts.filter((a) => !a.archived);
const amtClass = (t) => (t.type === 'income' ? 'income' : t.type === 'expense' ? 'expense' : t.type === 'transfer' ? 'transfer' : '');
const amtText = (t) => (t.type === 'income' ? '+' + rp(t.amount) : t.type === 'expense' ? '-' + rp(t.amount) : t.type === 'adjustment' ? rpSigned(t.amount) : rp(t.amount));
const badge = (st, extra = '') => `<span class="badge b-${st}">${B.STATUS_LABEL[st]}${extra}</span>`;
const moneyField = (id, label, value = '', extra = '') => `<label for="${id}">${label}</label>
  <div class="money"><span aria-hidden="true">Rp</span><input id="${id}" name="${id}" inputmode="numeric" autocomplete="off" data-money value="${value === '' || value == null ? '' : F.groupDigits(value)}" ${extra} aria-describedby="${id}-err"></div><div class="err" id="${id}-err"></div>`;
// Parse nominal: hanya bilangan bulat, maks 999.999.999.999 (A-14)
function readMoney(input, { allowZero = false, allowNeg = false } = {}) {
  const raw = input.value.trim();
  if (!raw) return { error: 'Nominal wajib diisi' };
  if (/[,]\d|\.\d{1,2}$/.test(raw) && !/^\-?\d{1,3}(\.\d{3})*$/.test(raw)) return { error: 'Nominal harus bilangan bulat (tanpa desimal)' };
  if (!/^-?[\d.]+$/.test(raw)) return { error: 'Nominal hanya boleh angka' };
  const v = F.toInt(raw);
  if (v < 0 && !allowNeg) return { error: 'Nominal harus lebih dari Rp0' };
  if (v === 0 && !allowZero) return { error: 'Nominal harus lebih dari Rp0' };
  if (Math.abs(v) > B.MAX_AMOUNT) return { error: 'Nominal maksimum Rp999.999.999.999' };
  return { value: v };
}
document.addEventListener('input', (e) => {
  const el = e.target; if (!el.matches('[data-money]')) return;
  const neg = el.dataset.neg && el.value.trim().startsWith('-');
  const digits = el.value.replace(/\D/g, '').slice(0, 12);
  el.value = (neg ? '-' : '') + (digits ? F.groupDigits(+digits) : '');
});
function setErr(id, msg) { const e = document.getElementById(id + '-err'); if (e) e.textContent = msg || ''; const i = document.getElementById(id); if (i) i.setAttribute('aria-invalid', msg ? 'true' : 'false'); }

// ---------- Dialog ----------
const dlg = $('#dlg');
function openDialog(title, bodyHtml, { onOpen } = {}) {
  $('#dlg-body').innerHTML = `<div class="dbody"><div class="row between"><h2 id="dlg-title" style="margin:0">${esc(title)}</h2>
    <button class="iconbtn" type="button" data-close aria-label="Tutup">✕</button></div>${bodyHtml}</div>`;
  if (!dlg.open) dlg.showModal();
  $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
  onOpen && onOpen($('#dlg-body'));
  const f = $('#dlg-body input:not([type=radio]):not([type=hidden]), #dlg-body select, #dlg-body .actions .btn.primary', dlg); f && f.focus();
}
function confirmDialog(title, msg, okLabel = 'Ya', danger = false) {
  return new Promise((res) => {
    openDialog(title, `<p>${msg}</p><div class="actions"><button class="btn" type="button" data-no>Batal</button><button class="btn ${danger ? 'danger' : 'primary'}" type="button" data-yes>${esc(okLabel)}</button></div>`);
    let done = false; const fin = (v) => { if (done) return; done = true; dlg.close(); res(v); };
    $('[data-yes]', dlg).onclick = () => fin(true); $('[data-no]', dlg).onclick = () => fin(false);
    dlg.addEventListener('close', () => fin(false), { once: true });
    $('[data-yes]', dlg).focus();
  });
}

// ---------- Navigasi ----------
function route() { const r = location.hash.replace('#', '') || 'dashboard'; return ROUTES.some((x) => x[0] === r) ? r : 'dashboard'; }
function renderNav(r) {
  $('#nav').innerHTML = ROUTES.map(([id, label, ic]) => `<li><a href="#${id}" ${id === r ? 'aria-current="page"' : ''}><span aria-hidden="true">${ic}</span>${label}</a></li>`).join('');
  const mob = [ROUTES[0], ROUTES[1], ROUTES[3], ROUTES[4], ['lainnya', 'Lainnya', '☰']];
  $('#bnav').innerHTML = mob.map(([id, label, ic]) => { const cur = id === r || (id === 'lainnya' && (r === 'akun' || r === 'pengaturan'));
    return `<li><a href="#${id === 'lainnya' ? 'akun' : id}" ${id === 'lainnya' ? 'data-more' : ''} ${cur ? 'aria-current="page"' : ''}><span aria-hidden="true">${ic}</span>${label}</a></li>`; }).join('');
  const more = $('[data-more]'); more.addEventListener('click', (e) => { e.preventDefault();
    openDialog('Lainnya', `<ul class="list"><li><a class="btn text" href="#akun" data-close>💳 Akun</a></li><li><a class="btn text" href="#pengaturan" data-close>⚙️ Pengaturan</a></li></ul>`); });
}
let lastRoute = null;
function render() {
  const r = route(); renderNav(r);
  const title = ROUTES.find((x) => x[0] === r)[1];
  $('#page-title').textContent = r === 'dashboard' ? 'Kelola Keuangan' : title;
  document.title = (r === 'dashboard' ? '' : title + ' · ') + 'Kelola Keuangan';
  const noAcc = data.accounts.length === 0;
  $('#fab').hidden = noAcc; $('#btn-add-tx').hidden = noAcc;
  const main = $('#main');
  main.innerHTML = (noAcc && r !== 'pengaturan' ? pageOnboarding : PAGES[r])();
  (noAcc && r !== 'pengaturan' ? bindOnboarding : BIND[r])(main);
  if (lastRoute !== r) { lastRoute = r; window.scrollTo(0, 0); }
}
window.addEventListener('hashchange', () => { render(); $('#main').focus({ preventScroll: true }); });
$('#fab').addEventListener('click', () => txForm());
$('#btn-add-tx').addEventListener('click', () => txForm());

// ---------- Onboarding (UC-01) ----------
function pageOnboarding() {
  return `<section class="card hl"><h2 style="margin-top:0">Selamat datang 👋</h2>
  <p>Mulai dengan menambahkan akun pertama Anda (dompet cash, rekening bank, atau e-wallet) beserta saldo saat ini. Data hanya disimpan di perangkat ini.</p></section>
  <section class="card"><h2 style="margin-top:0">Tambah akun pertama</h2>${accountFormFields()}
  <div class="actions" style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap"><button class="btn primary" id="ob-save" type="button">Simpan akun</button></div>
  <p class="small muted">Punya cadangan data? <a href="#pengaturan">Impor JSON di Pengaturan</a>.</p></section>`;
}
function bindOnboarding(root) { $('#ob-save', root).addEventListener('click', () => { const a = readAccountForm(root); if (a) { data.accounts.push(a); persist('Akun ditambahkan'); } }); }

// ---------- Akun (F-01, F-02, F-10) ----------
function accountFormFields(a = {}) {
  const type = a.type || 'cash';
  return `<label for="acc-name">Nama akun</label><input id="acc-name" maxlength="40" value="${esc(a.name || '')}" placeholder="mis. Dompet, BCA, GoPay" aria-describedby="acc-name-err" required><div class="err" id="acc-name-err"></div>
  <fieldset style="border:0;padding:0;margin:12px 0 0"><legend style="font-weight:600;font-size:14px;margin-bottom:4px">Tipe</legend>
  <div class="seg">${Object.entries(ACC_TYPE).map(([k, l]) => `<label><input type="radio" name="acc-type" value="${k}" ${k === type ? 'checked' : ''}><span>${ACC_ICON[k]} ${l}</span></label>`).join('')}</div></fieldset>
  ${moneyField('acc-init', a.id ? 'Saldo awal' : 'Saldo awal (saldo saat ini)', a.initialBalance ?? '', 'data-neg="1"')}
  <p class="small muted">Saldo awal dihitung per tanggal akun dibuat, bukan sebagai pemasukan.</p>`;
}
function readAccountForm(root, existing) {
  const name = $('#acc-name', root).value.trim(); setErr('acc-name', name ? '' : 'Nama akun wajib diisi');
  const m = readMoney($('#acc-init', root), { allowZero: true, allowNeg: true }); setErr('acc-init', m.error);
  if (!name || m.error) return null;
  const type = $('input[name=acc-type]:checked', root).value;
  if (existing) return Object.assign(existing, { name, type, initialBalance: m.value });
  return { id: F.uid(), name, type, initialBalance: m.value, balance: m.value, color: null, archived: false, createdAt: today() + 'T' + new Date().toTimeString().slice(0, 8) };
}
function accountForm(a) {
  openDialog(a ? 'Ubah akun' : 'Tambah akun', accountFormFields(a) + `<div class="actions"><button class="btn" type="button" data-close>Batal</button><button class="btn primary" type="button" id="acc-save">Simpan</button></div>`, {
    onOpen: (root) => { $$('[data-close]', root).forEach((b) => (b.onclick = () => dlg.close()));
      $('#acc-save', root).onclick = () => { const r = readAccountForm(root, a); if (!r) return; if (!a) data.accounts.push(r); dlg.close(); persist(a ? 'Akun diperbarui' : 'Akun ditambahkan'); }; } });
}
function adjustForm(a) {
  openDialog(`Sesuaikan saldo · ${a.name}`, `<p class="muted">Saldo tercatat: <b class="num">${rp(a.balance)}</b>. Isi saldo sebenarnya; selisihnya dicatat sebagai transaksi Penyesuaian (tidak dihitung sebagai pemasukan/pengeluaran).</p>
    ${moneyField('adj-val', 'Saldo saat ini', a.balance, 'data-neg="1"')}<label for="adj-date">Tanggal</label><input type="date" id="adj-date" value="${today()}">
    <label for="adj-note">Catatan</label><input id="adj-note" maxlength="120" placeholder="opsional">
    <div class="actions"><button class="btn" type="button" data-close>Batal</button><button class="btn primary" type="button" id="adj-save">Simpan</button></div>`, {
    onOpen: (root) => { $('#adj-save', root).onclick = () => { const m = readMoney($('#adj-val', root), { allowZero: true, allowNeg: true }); setErr('adj-val', m.error); if (m.error) return;
      const diff = m.value - a.balance; if (diff === 0) { setErr('adj-val', 'Saldo sama dengan yang tercatat'); return; }
      const now = new Date().toISOString();
      data.transactions.push({ id: F.uid(), date: $('#adj-date', root).value || today(), type: 'adjustment', amount: diff, accountId: a.id, note: $('#adj-note', root).value.trim(), createdAt: now, updatedAt: now });
      dlg.close(); persist('Saldo disesuaikan'); }; } });
}
function pageAkun() {
  const t = totals(data); const list = data.accounts.filter((a) => ui.showArchived || !a.archived);
  return `<div class="row between"><p class="muted" style="margin:0">Total <b class="num">${rp(t.total)}</b> · Cash <b class="num">${rp(t.cash)}</b> · Digital <b class="num">${rp(t.digital)}</b></p>
  <button class="btn primary" id="acc-add" type="button">+ Tambah akun</button></div>
  ${Object.keys(ACC_TYPE).map((type) => { const items = list.filter((a) => a.type === type); if (!items.length) return '';
    return `<h2>${ACC_TYPE[type]}</h2><div class="card"><ul class="list">${items.map((a) => {
      const used = data.transactions.some((x) => x.accountId === a.id || x.toAccountId === a.id);
      return `<li><span class="ic" aria-hidden="true">${ACC_ICON[a.type]}</span><div class="grow"><div class="t">${esc(a.name)}${a.archived ? ' <span class="badge b-none">Diarsipkan</span>' : ''}</div>
        <div class="s">Saldo awal ${rp(a.initialBalance)}${a.balance < 0 ? ' · <span class="expense">⚠ Saldo akun jadi minus</span>' : ''}</div></div>
        <div class="amount ${a.balance < 0 ? 'expense' : ''}">${rp(a.balance)}</div></li>
        <li style="border-bottom:1px solid var(--border);padding-top:0"><div class="row" style="margin-left:46px">
        <button class="btn sm text" type="button" data-acc-edit="${a.id}" aria-label="Ubah akun ${esc(a.name)}">Ubah</button>
        <button class="btn sm text" type="button" data-acc-adj="${a.id}" aria-label="Sesuaikan saldo ${esc(a.name)}">Sesuaikan saldo</button>
        <button class="btn sm text" type="button" data-acc-arch="${a.id}">${a.archived ? 'Aktifkan' : 'Arsipkan'}</button>
        ${used ? '' : `<button class="btn sm text expense" type="button" data-acc-del="${a.id}" aria-label="Hapus akun ${esc(a.name)}">Hapus</button>`}</div></li>`; }).join('')}</ul></div>`; }).join('')}
  ${data.accounts.some((a) => a.archived) ? `<button class="btn text" id="acc-toggle-arch" type="button" aria-pressed="${ui.showArchived}">${ui.showArchived ? 'Sembunyikan' : 'Tampilkan'} akun diarsipkan</button>` : ''}
  <p class="small muted">Akun yang sudah punya transaksi tidak bisa dihapus, hanya diarsipkan.</p>`;
}
function bindAkun(root) {
  $('#acc-add', root).onclick = () => accountForm();
  $$('[data-acc-edit]', root).forEach((b) => (b.onclick = () => accountForm(acc(b.dataset.accEdit))));
  $$('[data-acc-adj]', root).forEach((b) => (b.onclick = () => adjustForm(acc(b.dataset.accAdj))));
  $$('[data-acc-arch]', root).forEach((b) => (b.onclick = () => { const a = acc(b.dataset.accArch); a.archived = !a.archived; persist(a.archived ? 'Akun diarsipkan' : 'Akun diaktifkan'); }));
  $$('[data-acc-del]', root).forEach((b) => (b.onclick = async () => { const a = acc(b.dataset.accDel);
    if (await confirmDialog('Hapus akun?', `Akun <b>${esc(a.name)}</b> akan dihapus.`, 'Hapus', true)) { data.accounts = data.accounts.filter((x) => x !== a); persist('Akun dihapus'); } }));
  const tg = $('#acc-toggle-arch', root); if (tg) tg.onclick = () => { ui.showArchived = !ui.showArchived; render(); };
}

// ---------- Transaksi (F-03..F-08, F-10) ----------
function txForm(tx, presetType) {
  if (!activeAccounts().length && !tx) { toast('Tambahkan akun dulu'); location.hash = '#akun'; return; }
  let type = tx ? tx.type : presetType || 'expense';
  const accs = data.accounts.filter((a) => !a.archived || (tx && (a.id === tx.accountId || a.id === tx.toAccountId)));
  const accOpts = (sel) => accs.map((a) => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)} (${rp(a.balance)})</option>`).join('');
  const body = () => {
    const cats = data.categories.filter((c) => c.kind === (type === 'income' ? 'income' : 'expense') && (!c.archived || (tx && c.id === tx.categoryId)));
    const selCat = tx && tx.type === type ? tx.categoryId : '';
    const isAdj = type === 'adjustment';
    return `<div class="seg" role="tablist" aria-label="Jenis transaksi" style="margin-top:12px">${[['expense', 'Keluar'], ['income', 'Masuk'], ['transfer', 'Transfer'], ['adjustment', 'Penyesuaian']].map(([k, l]) =>
      `<button type="button" role="tab" data-type="${k}" aria-selected="${k === type}" ${tx && tx.type !== k ? 'disabled' : ''}>${l}</button>`).join('')}</div>
    ${isAdj && tx ? moneyField('tx-amt', 'Nominal penyesuaian (boleh minus)', tx.amount, 'data-neg="1"') : isAdj ? moneyField('tx-amt', 'Saldo saat ini (sebenarnya)', '', 'data-neg="1"') + '<p class="small muted" id="adj-info"></p>' : moneyField('tx-amt', 'Nominal', tx ? tx.amount : '')}
    <label for="tx-date">Tanggal</label><input type="date" id="tx-date" value="${tx ? tx.date : today()}" required aria-describedby="tx-date-err"><div class="err" id="tx-date-err"></div>
    <label for="tx-acc">${type === 'transfer' ? 'Dari akun' : 'Akun'}</label><select id="tx-acc" aria-describedby="tx-acc-err">${accOpts(tx ? tx.accountId : accs[0]?.id)}</select><div class="err" id="tx-acc-err"></div>
    ${type === 'transfer' ? `<label for="tx-to">Ke akun</label><select id="tx-to" aria-describedby="tx-to-err"><option value="">Pilih akun tujuan</option>${accOpts(tx ? tx.toAccountId : '')}</select><div class="err" id="tx-to-err"></div>` : ''}
    ${type === 'income' || type === 'expense' ? `<fieldset style="border:0;padding:0;margin:12px 0 0" aria-describedby="tx-cat-err"><legend style="font-weight:600;font-size:14px;margin-bottom:4px">Kategori</legend><div class="chips">${cats.map((c) =>
      `<label><input type="radio" name="tx-cat" value="${c.id}" ${c.id === selCat ? 'checked' : ''}><span>${c.icon || ''} ${esc(c.name)}</span></label>`).join('')}</div><div class="err" id="tx-cat-err"></div></fieldset>` : ''}
    <label for="tx-note">Catatan</label><input id="tx-note" maxlength="140" value="${esc(tx ? tx.note : '')}" placeholder="opsional">
    <div id="tx-warn"></div>
    <div class="actions"><button class="btn" type="button" data-close>Batal</button><button class="btn primary" type="button" id="tx-save">Simpan</button></div>`;
  };
  const mount = () => openDialog(tx ? 'Ubah transaksi' : 'Tambah transaksi', body(), { onOpen: bind });
  const bind = (root) => {
    $$('[data-type]', root).forEach((b) => (b.onclick = () => { type = b.dataset.type; mount(); $(`[data-type=${type}]`, dlg).focus(); }));
    const adjInfo = () => { const i = $('#adj-info', root); if (i && !tx) { const a = acc($('#tx-acc', root).value); i.textContent = a ? `Saldo tercatat ${rp(a.balance)}. Selisih dicatat sebagai penyesuaian.` : ''; } };
    $('#tx-acc', root).addEventListener('change', adjInfo); adjInfo();
    $('#tx-save', root).onclick = () => {
      const isAdj = type === 'adjustment'; const m = readMoney($('#tx-amt', root), isAdj ? { allowZero: true, allowNeg: true } : {});
      setErr('tx-amt', m.error);
      const date = $('#tx-date', root).value; setErr('tx-date', date ? '' : 'Tanggal wajib diisi');
      const accountId = $('#tx-acc', root).value; setErr('tx-acc', accountId ? '' : 'Akun wajib dipilih');
      let toAccountId = null, categoryId = null, ok = !m.error && date && accountId;
      if (type === 'transfer') { toAccountId = $('#tx-to', root).value; const e = !toAccountId ? 'Akun tujuan wajib dipilih' : toAccountId === accountId ? 'Akun tujuan harus berbeda' : ''; setErr('tx-to', e); ok = ok && !e; }
      if (type === 'income' || type === 'expense') { categoryId = $('input[name=tx-cat]:checked', root)?.value || null; setErr('tx-cat', categoryId ? '' : 'Kategori wajib dipilih'); ok = ok && categoryId; }
      if (!ok) return;
      let amount = m.value;
      if (isAdj && !tx) { amount = m.value - acc(accountId).balance; if (amount === 0) { setErr('tx-amt', 'Saldo sama dengan yang tercatat'); return; } }
      const now = new Date().toISOString(); const note = $('#tx-note', root).value.trim();
      if (tx) Object.assign(tx, { date, amount, accountId, toAccountId, categoryId, note, updatedAt: now });
      else data.transactions.push({ id: F.uid(), date, type, amount, accountId, toAccountId, categoryId, note, createdAt: now, updatedAt: now });
      dlg.close(); recompute(data);
      const neg = data.accounts.filter((a) => a.balance < 0 && (a.id === accountId)); // A-09
      persist(neg.length ? `Tersimpan · ⚠ Saldo akun jadi minus (${neg[0].name} ${rp(neg[0].balance)})` : 'Tersimpan');
    };
  };
  mount();
}
async function deleteTx(t) {
  if (await confirmDialog('Hapus transaksi?', 'Hapus transaksi ini? Saldo akun akan disesuaikan.', 'Hapus', true)) { data.transactions = data.transactions.filter((x) => x !== t); persist('Transaksi dihapus'); }
}
function txDesc(t) {
  if (t.type === 'transfer') return { icon: '⇄', title: `Transfer ${esc(acc(t.accountId)?.name || '?')} → ${esc(acc(t.toAccountId)?.name || '?')}`, sub: '' };
  if (t.type === 'adjustment') return { icon: '⚖️', title: 'Penyesuaian saldo', sub: esc(acc(t.accountId)?.name || '?') };
  const c = cat(t.categoryId); return { icon: c?.icon || '•', title: esc(c?.name || '—'), sub: esc(acc(t.accountId)?.name || '?') };
}
function txItem(t, actions = true) {
  const d = txDesc(t);
  return `<li><span class="ic" aria-hidden="true">${d.icon}</span><div class="grow"><div class="t">${d.title}</div><div class="s">${[d.sub, t.note ? '“' + esc(t.note) + '”' : '', actions ? '' : F.fmtDate(t.date)].filter(Boolean).join(' · ')}</div></div>
    <div class="amount ${amtClass(t)}">${amtText(t)}</div>
    ${actions ? `<button class="iconbtn" type="button" data-tx-edit="${t.id}" aria-label="Ubah transaksi ${d.title.replace(/<[^>]+>/g, '')} ${rp(t.amount)}">✏️</button><button class="iconbtn" type="button" data-tx-del="${t.id}" aria-label="Hapus transaksi ${d.title.replace(/<[^>]+>/g, '')} ${rp(t.amount)}">🗑️</button>` : ''}</li>`;
}
const sortTx = (arr) => [...arr].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
function filteredTx() {
  const f = ui.txFilter; let from = '', to = '';
  if (f.period === 'week') { from = F.weekStart(today()); to = F.weekEnd(today()); }
  else if (f.period === 'lastweek') { from = F.addDays(F.weekStart(today()), -7); to = F.addDays(from, 6); }
  else if (f.period === 'month') { from = F.monthStart(today()); to = F.monthEnd(today()); }
  else if (f.period === 'custom') { from = f.from; to = f.to; }
  const q = f.q.trim().toLowerCase();
  return sortTx(data.transactions.filter((t) => (!from || t.date >= from) && (!to || t.date <= to)
    && (!f.account || t.accountId === f.account || t.toAccountId === f.account) && (!f.category || t.categoryId === f.category)
    && (!f.type || t.type === f.type) && (!q || (t.note || '').toLowerCase().includes(q))));
}
function pageTransaksi() {
  const f = ui.txFilter; const list = filteredTx();
  const groups = []; for (const t of list) { const g = groups[groups.length - 1]; if (g && g.date === t.date) g.items.push(t); else groups.push({ date: t.date, items: [t] }); }
  const sel = (id, label, opts, val) => `<div><label for="${id}">${label}</label><select id="${id}">${opts.map(([v, l]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
  return `<div class="card"><div class="filters">
    <div style="grid-column:1/-1" class="fq"><label for="f-q">Cari catatan</label><input id="f-q" type="search" value="${esc(f.q)}" placeholder="🔍 Cari catatan…"></div>
    ${sel('f-period', 'Periode', [['week', 'Minggu ini'], ['lastweek', 'Minggu lalu'], ['month', 'Bulan ini'], ['all', 'Semua'], ['custom', 'Pilih tanggal']], f.period)}
    ${sel('f-acc', 'Akun', [['', 'Semua akun'], ...data.accounts.map((a) => [a.id, a.name])], f.account)}
    ${sel('f-cat', 'Kategori', [['', 'Semua kategori'], ...data.categories.map((c) => [c.id, `${c.name} (${c.kind === 'income' ? 'masuk' : 'keluar'})`])], f.category)}
    ${sel('f-type', 'Jenis', [['', 'Semua jenis'], ...Object.entries(TYPE_LABEL)], f.type)}
    ${f.period === 'custom' ? `<div><label for="f-from">Dari</label><input type="date" id="f-from" value="${f.from}"></div><div><label for="f-to">Sampai</label><input type="date" id="f-to" value="${f.to}"></div>` : ''}
    </div><div class="row between" style="margin-top:12px"><span class="muted small" aria-live="polite">${list.length} transaksi</span><button class="btn sm" id="csv" type="button">Ekspor CSV</button></div></div>
  ${groups.length ? groups.map((g) => { const net = g.items.reduce((s, t) => s + (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0), 0);
    return `<div class="dategroup"><span>${F.fmtDateLong(g.date)}</span><span class="num">${rpSigned(net)}</span></div><div class="card" style="padding-top:4px;padding-bottom:4px"><ul class="list">${g.items.map((t) => txItem(t)).join('')}</ul></div>`; }).join('')
    : `<div class="card empty">Tidak ada transaksi untuk filter ini.<br><button class="btn primary" style="margin-top:12px" type="button" id="tx-empty-add">+ Tambah transaksi</button></div>`}`;
}
function bindTxActions(root) {
  $$('[data-tx-edit]', root).forEach((b) => (b.onclick = () => txForm(data.transactions.find((t) => t.id === b.dataset.txEdit))));
  $$('[data-tx-del]', root).forEach((b) => (b.onclick = () => deleteTx(data.transactions.find((t) => t.id === b.dataset.txDel))));
}
function bindTransaksi(root) {
  bindTxActions(root);
  const f = ui.txFilter; const upd = (k, id, ev = 'change') => { const el = $('#' + id, root); if (el) el.addEventListener(ev, () => { f[k] = el.value; render(); if (ev === 'input') { const n = $('#' + id); n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }); };
  upd('q', 'f-q', 'input'); upd('period', 'f-period'); upd('account', 'f-acc'); upd('category', 'f-cat'); upd('type', 'f-type'); upd('from', 'f-from'); upd('to', 'f-to');
  $('#csv', root).onclick = exportCSV; const e = $('#tx-empty-add', root); if (e) e.onclick = () => txForm();
}

// ---------- Dashboard (F-02, F-11 kartu jatah) ----------
function allowanceCard() {
  const p = B.activePlan(data); const t = today();
  if (!p) return `<section class="card"><h3>Jatah Hari Ini</h3><p class="muted">Belum ada rencana jatah aktif.</p><a class="btn primary" href="#anggaran">Buat rencana jatah</a></section>`;
  const fixed = B.fixedAllowanceOn(p, t), spent = B.expenseOn(data, t), dyn = B.dynamicAllowanceOn(data, p, t), st = B.status(spent, fixed);
  const ratio = fixed > 0 ? Math.min(100, Math.round((spent * 100) / fixed)) : spent > 0 ? 100 : 0;
  return `<section class="card"><h3>Jatah Hari Ini (${F.DAYS_LONG[F.parse(t).getDay()]}) · ${p.period === 'weekly' ? 'Mingguan' : 'Bulanan'}</h3>
    <div class="big">${rp(fixed)}</div><div class="row between"><span class="muted">Terpakai <b class="num">${rp(spent)}</b> (${fixed > 0 ? pctStr(pct(spent, fixed)) : '—'})</span>${badge(st)}</div>
    <div class="bar ${st}" role="img" aria-label="Terpakai ${ratio}% dari jatah"><i style="width:${ratio}%"></i></div>
    <div class="row between"><span>Sisa jatah hari ini <b class="num ${fixed - spent < 0 ? 'expense' : ''}">${rp(fixed - spent)}</b></span></div>
    <p class="small muted" style="margin:8px 0 0">Jatah dinamis (info): <b class="num ${dyn < 0 ? 'expense' : ''}">${rp(dyn)}</b>/hari${dyn < 0 ? ' · ⚠ Jatah sudah terlampaui' : ''}</p></section>`;
}
function pageDashboard() {
  const t = totals(data); const recent = sortTx(data.transactions).slice(0, 6);
  return `<div class="dash"><section class="card hl"><h3>Total Saldo</h3><div class="big ${t.total < 0 ? 'expense' : ''}">${rp(t.total)}</div>
    <div class="row" style="gap:16px;margin-top:4px"><span>Cash <b class="num">${rp(t.cash)}</b></span><span>Digital <b class="num">${rp(t.digital)}</b></span></div></section>
    ${allowanceCard()}
    <section class="card"><div class="row between"><h3 style="margin:0">Akun</h3><a href="#akun" class="btn sm text">Kelola ›</a></div>
      <div class="hscroll" tabindex="0" role="region" aria-label="Daftar saldo akun" style="margin-top:8px">${activeAccounts().map((a) => `<div class="acc"><div class="small muted">${ACC_ICON[a.type]} ${ACC_TYPE[a.type]}</div><div style="font-weight:600">${esc(a.name)}</div><div class="amount ${a.balance < 0 ? 'expense' : ''}">${rp(a.balance)}</div></div>`).join('')}</div></section>
    <section class="card"><div class="row between"><h3 style="margin:0">Transaksi terbaru</h3><a href="#transaksi" class="btn sm text">Semua ›</a></div>
      ${recent.length ? `<ul class="list">${recent.map((x) => txItem(x, false)).join('')}</ul>` : '<p class="empty">Belum ada transaksi. Tekan “+” untuk menambah.</p>'}</section></div>`;
}

// ---------- Grafik SVG (lokal, tanpa pihak ketiga) ----------
const ST_COLOR = { safe: '#15803D', warn: '#D97706', over: '#DC2626', future: '#D1D5DB', none: '#E5E7EB' };
function barChart(rows, { monthly = false } = {}) {
  const n = rows.length; if (!n) return '';
  const bw = monthly ? 16 : 44, gap = monthly ? 4 : 12, h = 180, pad = 44, W = Math.max(n * (bw + gap) + pad, 300);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.actual || 0, r.fixed || 0, r.dyn > 0 && !r.future ? r.dyn : 0))) * 1.1;
  const y = (v) => h - 20 - (v / max) * (h - 30);
  let bars = '', fixedPts = [], dynPts = [], labels = '';
  rows.forEach((r, i) => {
    const x = pad + i * (bw + gap); const c = r.outside ? ST_COLOR.none : r.future ? ST_COLOR.future : ST_COLOR[r.status];
    const v = r.future ? (r.fixed || 0) : r.actual; const yy = y(v);
    bars += `<rect x="${x}" y="${yy}" width="${bw}" height="${Math.max(0, h - 20 - yy)}" rx="3" fill="${c}" ${r.future ? 'opacity=".6"' : ''}><title>${F.fmtDate(r.date)}: aktual ${rp(r.actual)}${r.fixed != null ? ' · jatah ' + rp(r.fixed) : ''}</title></rect>`;
    if (!r.outside) fixedPts.push(`${x},${y(r.fixed)} ${x + bw},${y(r.fixed)}`);
    if (!r.outside && !r.future) dynPts.push(`${x + bw / 2},${y(Math.max(0, r.dyn))}`);
    const d = F.parse(r.date); const lab = monthly ? d.getDate() : F.DAYS[d.getDay()];
    if (!monthly || d.getDate() === 1 || d.getDate() % 5 === 0) labels += `<text x="${x + bw / 2}" y="${h - 4}" text-anchor="middle" font-size="11" fill="#4B5563">${lab}</text>`;
  });
  const ticks = [0, max / 2, max / 1.1].map((v) => `<text x="${pad - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="#4B5563">Rp${F.rpShort(Math.round(v))}</text><line x1="${pad}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="#E5E7EB"/>`).join('');
  return `<div class="chart" tabindex="0" role="region" aria-label="Grafik jatah vs aktual; data lengkap ada di tabel di bawah"><svg width="${monthly ? W : '100%'}" height="${h}" viewBox="0 0 ${W} ${h}" ${monthly ? '' : 'preserveAspectRatio="none"'} aria-hidden="true">${ticks}${bars}
    ${fixedPts.map((p) => `<polyline points="${p}" stroke="#166534" stroke-width="2.5" fill="none"/>`).join('')}
    ${dynPts.length > 1 ? `<polyline points="${dynPts.join(' ')}" stroke="#22C55E" stroke-width="2" stroke-dasharray="5 4" fill="none"/>` : ''}${labels}</svg></div>
    <ul class="legend row" style="gap:12px"><li><i style="background:#15803D"></i>Aman</li><li><i style="background:#D97706"></i>Hampir habis</li><li><i style="background:#DC2626"></i>Lewat</li><li><i style="background:#D1D5DB"></i>Mendatang</li><li><i style="background:#166534;height:3px"></i>Jatah tetap</li><li><i style="border-top:2px dashed #22C55E;height:0;background:none"></i>Jatah dinamis (info)</li></ul>`;
}
function rowsTable(rows) {
  return `<div class="tablewrap"><table><caption class="sr">Jatah vs aktual per hari</caption><thead><tr><th scope="col">Hari</th><th scope="col" class="r">Jatah tetap</th><th scope="col" class="r">Aktual</th><th scope="col">Status</th></tr></thead><tbody>${rows.map((r) =>
    `<tr class="${r.isToday ? 'today' : ''}"><th scope="row" style="font-weight:500">${F.dayShort(r.date)} ${F.parse(r.date).getDate()}${r.isToday ? ' (hari ini)' : ''}</th><td class="r">${r.outside ? '—' : rp(r.fixed)}</td><td class="r">${r.future ? '—' : rp(r.actual)}</td><td>${r.outside ? badge('none') : badge(r.status)}</td></tr>`).join('')}</tbody></table></div>`;
}
function heatmap(rows) {
  const first = (F.parse(rows[0].date).getDay() + 6) % 7;
  return `<div class="heat" aria-hidden="true">${F.DAYS.slice(1).concat('Min').map((d) => `<div class="out" style="min-height:0;font-weight:700">${d}</div>`).join('')}${'<div class="out"></div>'.repeat(first)}${rows.map((r) =>
    `<div class="${r.outside || r.future ? '' : r.status}"><b>${F.parse(r.date).getDate()}</b><span>${r.future || r.outside ? '' : F.rpShort(r.actual)}</span></div>`).join('')}</div>`;
}
function donut(items, total) {
  if (!total) return '<p class="muted">Belum ada data.</p>';
  let off = 0; const R = 15.915; const segs = items.map((it, i) => { const frac = (it.amount * 100) / total; const s = `<circle r="${R}" cx="21" cy="21" fill="none" stroke="${PALETTE[i % 8]}" stroke-width="7" stroke-dasharray="${frac} ${100 - frac}" stroke-dashoffset="${25 - off}"/>`; off += frac; return s; }).join('');
  return `<div class="donutwrap"><svg width="140" height="140" viewBox="0 0 42 42" aria-hidden="true">${segs}</svg>
    <ul class="legend" style="flex:1;min-width:180px">${items.map((it, i) => `<li><i style="background:${PALETTE[i % 8]}"></i><span class="grow">${esc(catName(it.categoryId))}</span><b class="num">${rp(it.amount)}</b>&nbsp;<span class="num muted">${pctStr(it.pct)}</span></li>`).join('')}</ul></div>`;
}

// ---------- Anggaran (F-11..F-13) ----------
function planForm(existing) {
  const t = today(); const yest = F.addDays(t, -1);
  let period = existing ? existing.period : 'weekly';
  const totalBal = totals(data).total;
  const isEdit = !!existing; const inPlace = existing && existing.startDate === t;
  const html = () => {
    const r = B.periodRange(period, t, true); const days = F.diffDays(r.start, r.end) + 1;
    // O-05/O-06: pengeluaran rencana lama dari max(start lama, awal periode baru) s/d kemarin
    const priorFrom = existing && !inPlace ? (existing.startDate > r.fullStart ? existing.startDate : r.fullStart) : null;
    const prior = priorFrom && priorFrom <= yest ? B.expenseBetween(data, priorFrom, yest) : 0;
    const incInfo = existing && !inPlace ? B.incomeBetween(data, existing.startDate, t) : 0;
    return { r, days, prior, incInfo, priorFrom, markup: `<form id="plan-form" novalidate>
    <fieldset style="border:0;padding:0;margin:0"><legend style="font-weight:600;font-size:14px;margin-bottom:4px">Periode</legend>
    <div class="seg">${[['weekly', 'Mingguan'], ['monthly', 'Bulanan']].map(([k, l]) => `<label><input type="radio" name="period" value="${k}" ${k === period ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></fieldset>
    <p class="small muted" id="plan-range">${period === 'weekly' ? 'Minggu ' + F.fmtRange(r.fullStart, r.end) : F.MONTHS_LONG[F.parse(t).getMonth()] + ' ' + F.parse(t).getFullYear()} · berlaku ${F.fmtDate(r.start)} s/d ${F.fmtDateLong(r.end)} (${days} hari)</p>
    ${moneyField('plan-amt', 'Uang yang dibagi', existing ? existing.amountToAllocate : '')}
    <p class="small muted" style="margin:4px 0 0">ⓘ Total saldo saat ini <b class="num">${rp(totalBal)}</b> <button class="btn sm text" type="button" id="use-bal">Pakai nilai</button></p>
    ${moneyField('plan-saving', 'Jumlah yang ingin ditabung', existing ? existing.savingAmount : '')}
    ${prior || incInfo ? `<p class="note ok small">ⓘ Sudah terpakai ${rp(prior)} (pengeluaran ${F.fmtDate(priorFrom)} s/d kemarin) — dikurangkan dari uang dibagi. Pemasukan periode ini ${rp(incInfo)} (info; “uang dibagi” sudah mencakup pemasukan).</p>` : ''}
    <div class="card hl" style="margin:16px 0 0" aria-live="polite" id="plan-preview"></div><div id="plan-msgs" aria-live="polite"></div>
    <div class="actions"><button class="btn" type="button" id="plan-cancel">Batal</button><button class="btn primary" type="submit" id="plan-save" disabled>Simpan</button></div></form>` };
  };
  const container = $('#plan-slot');
  const mount = () => { const h = html(); container.innerHTML = `<section class="card"><h2 style="margin-top:0">${isEdit ? 'Ubah Rencana Jatah' : 'Buat Rencana Jatah'}</h2>${h.markup}</section>`; bindForm(h); };
  const bindForm = (h) => {
    const root = container; const amt = $('#plan-amt', root), sav = $('#plan-saving', root);
    $$('input[name=period]', root).forEach((i) => (i.onchange = () => { const a = amt.value, s = sav.value; period = i.value; mount(); $('#plan-amt').value = a; $('#plan-saving').value = s; $(`input[name=period][value=${period}]`).focus(); update(); }));
    $('#use-bal', root).onclick = () => { amt.value = F.groupDigits(Math.max(0, totalBal)); update(); };
    $('#plan-cancel', root).onclick = () => render();
    const calc = () => { const A = F.toInt(amt.value), Sv = sav.value.trim() === '' ? 0 : F.toInt(sav.value); return { A, Sv }; };
    const update = () => { const hh = html(); const { A, Sv } = calc(); let err = amt.value.trim() === '' ? null : B.validatePlan(A, Sv);
      if (!err && A > B.MAX_AMOUNT) err = 'Nominal maksimum Rp999.999.999.999';
      const pool = A - Sv - hh.prior;
      if (!err && amt.value.trim() !== '' && pool <= 0) err = `Uang yang dibagi tidak cukup setelah dikurangi tabungan dan pengeluaran yang sudah terjadi (${rp(pool)})`; // O-03
      const daily = pool > 0 ? Math.floor(pool / hh.days) : 0;
      $('#plan-preview').innerHTML = `<h3>Pratinjau</h3><div class="big">${rp(daily)} <span style="font-size:16px">/ hari</span></div>
        <p class="small num" style="margin:4px 0">(${F.groupDigits(A)} − ${F.groupDigits(Sv)}${hh.prior ? ' − ' + F.groupDigits(hh.prior) : ''}) / ${hh.days} hari</p>
        <p class="small" style="margin:0">Ditabung <b class="num">${rp(Sv)}</b> · Dipakai <b class="num">${rp(Math.max(0, pool))}</b>${pool > 0 && pool % hh.days ? ` · sisa pembulatan ${rp(pool - daily * hh.days)} masuk hari terakhir` : ''}</p>`;
      $('#plan-msgs').innerHTML = (err ? `<p class="note bad" role="alert">✖ ${esc(err)}</p>` : '') + (!err && A > totalBal ? `<p class="note warn">⚠ Uang dibagi melebihi total saldo (${rp(totalBal)}); tetap bisa disimpan.</p>` : '');
      $('#plan-save').disabled = !!err || amt.value.trim() === ''; return { err, A, Sv, hh }; };
    amt.addEventListener('input', update); sav.addEventListener('input', update); update();
    $('#plan-form', root).onsubmit = async (e) => { e.preventDefault(); const { err, A, Sv, hh } = update(); if (err) return;
      const active = B.activePlan(data); const now = new Date().toISOString();
      if (active && !(await confirmDialog('Ganti rencana aktif?', active.startDate === t ? 'Rencana aktif (dibuat hari ini) akan diganti dengan isian baru.' : `Rencana aktif akan berakhir kemarin (${F.fmtDate(yest)}) dan disimpan di riwayat. Rencana baru berlaku mulai hari ini.`, 'Ya, ganti'))) return;
      const plan = { period, startDate: hh.r.start, endDate: hh.r.end, amountToAllocate: A, savingAmount: Sv, priorSpent: hh.prior, updatedAt: now };
      if (active && active.startDate === t) { Object.assign(active, plan); active.dailyAllowance = B.fixedAllowanceOn(active, active.startDate); }
      else { if (active) { active.dailyAllowance = B.fixedAllowanceOn(active, active.startDate); active.originalEndDate = active.endDate; active.endDate = yest; active.closedEarly = true; active.updatedAt = now; }
        const np = { id: F.uid(), ...plan, createdAt: now }; np.dailyAllowance = Math.floor(Math.max(0, B.planPool(np)) / B.planDays(np)); data.budgetPlans.push(np); }
      persist('Rencana tersimpan'); };
  };
  mount(); $('#plan-amt').focus();
}
function pageAnggaran() {
  const p = B.activePlan(data); const t = today();
  const history = data.budgetPlans.filter((x) => x !== p).sort((a, b) => b.startDate.localeCompare(a.startDate));
  let main = '';
  if (p) {
    const sm = B.planSummary(data, p); const fixed = B.fixedAllowanceOn(p, t), dyn = B.dynamicAllowanceOn(data, p, t), spentToday = B.expenseOn(data, t);
    const rem = F.diffDays(t, p.endDate) + 1; let from = p.startDate, to = p.endDate;
    if (p.period === 'monthly' && ui.budgetView === '7') { from = F.weekStart(t) < p.startDate ? p.startDate : F.weekStart(t); to = F.weekEnd(t) > p.endDate ? p.endDate : F.weekEnd(t); }
    const rows = B.dailyRows(data, p, from, to); const ratio = sm.budget ? Math.min(100, Math.round((sm.used * 100) / sm.budget)) : 0;
    main = `<section class="card"><div class="row between"><h3 style="margin:0">Rencana aktif · ${p.period === 'weekly' ? 'Mingguan' : 'Bulanan'}</h3>
      <div class="row"><button class="btn sm" type="button" id="plan-edit">Ubah</button><button class="btn sm text expense" type="button" id="plan-del">Hapus</button></div></div>
      <p class="muted small" style="margin:4px 0 8px">${F.fmtDate(p.startDate)} s/d ${F.fmtDateLong(p.endDate)} (${B.planDays(p)} hari)</p>
      <p style="margin:0">Dibagi <b class="num">${rp(p.amountToAllocate)}</b> · Ditabung <b class="num">${rp(p.savingAmount)}</b>${p.priorSpent ? ` · Sudah terpakai sebelumnya <b class="num">${rp(p.priorSpent)}</b>` : ''}</p>
      <div class="grid g2" style="margin-top:12px"><div><div class="small muted">Jatah tetap</div><div class="big" style="font-size:22px">${rp(p.dailyAllowance ?? fixed)}<span class="small">/hari</span></div></div>
      <div><div class="small muted">Jatah dinamis (info, sisa ${rem} hari)</div><div class="big ${dyn < 0 ? 'expense' : ''}" style="font-size:22px">${rp(dyn)}<span class="small">/hari</span></div>${dyn < 0 ? '<div class="small expense">⚠ Jatah sudah terlampaui</div>' : ''}</div></div>
      <p style="margin:12px 0 0">Terpakai <b class="num">${rp(sm.used)}</b> / ${rp(sm.budget)}</p><div class="bar ${ratio > 100 ? 'over' : ratio > 80 ? 'warn' : ''}" role="img" aria-label="Terpakai ${ratio}%"><i style="width:${ratio}%"></i></div>
      <div class="row between"><span>Sisa jatah hari ini <b class="num ${fixed - spentToday < 0 ? 'expense' : ''}">${rp(fixed - spentToday)}</b></span>${badge(B.status(spentToday, fixed))}</div></section>
      <section class="card"><div class="row between"><h3 style="margin:0">Jatah vs Aktual</h3>${p.period === 'monthly' ? `<div class="seg" role="group" aria-label="Rentang grafik"><button type="button" data-bv="7" aria-pressed="${ui.budgetView === '7'}">7 hari</button><button type="button" data-bv="m" aria-pressed="${ui.budgetView !== '7'}">Bulan ini</button></div>` : ''}</div>
      ${barChart(rows, { monthly: rows.length > 7 })}${rows.length > 7 ? `<details style="margin-top:12px"><summary>Kalender (heatmap)</summary>${heatmap(rows)}</details>` : ''}${rowsTable(rows)}</section>`;
  }
  const goals = data.savingGoals;
  return `<div id="plan-slot">${p ? main : ''}</div>
  ${p ? '' : ''}
  <section class="card"><div class="row between"><h3 style="margin:0">Riwayat rencana</h3></div>${history.length ? `<ul class="list">${history.map((h) => { const sm = B.planSummary(data, h);
    return `<li><div class="grow"><div class="t">${h.period === 'weekly' ? 'Mingguan' : 'Bulanan'} · ${F.fmtDate(h.startDate)} – ${F.fmtDate(h.endDate)}</div><div class="s">Dibagi ${rp(h.amountToAllocate)} · ditabung ${rp(h.savingAmount)} · terpakai ${rp(sm.used)} · ${h.startDate > t ? 'mendatang' : sm.achieved ? '✔ sesuai rencana' : '✖ melebihi'}</div></div>
    <button class="btn sm text" type="button" data-hist="${h.startDate}" data-hmode="${h.period}">Rekap</button></li>`; }).join('')}</ul>` : '<p class="muted small">Belum ada rencana lama.</p>'}</section>
  <section class="card"><div class="row between"><h3 style="margin:0">Target Tabungan Jangka Panjang <span class="small muted">(opsional)</span></h3><button class="btn sm" type="button" id="goal-add">+ Target</button></div>
    <p class="small muted">Tabungan dicatat manual: perbarui “sudah terkumpul” saat Anda menabung.</p>
    ${goals.length ? `<ul class="list">${goals.map((g) => { const r = g.targetAmount ? Math.min(100, Math.floor((g.savedAmount * 100) / g.targetAmount)) : 0;
      return `<li style="display:block"><div class="row between"><b>${esc(g.name)}</b><span class="num">${rp(g.savedAmount)} / ${rp(g.targetAmount)}</span></div>
      <div class="bar" role="img" aria-label="Progres ${r}%"><i style="width:${r}%"></i></div><div class="row between"><span class="small muted">${r}%${g.deadline ? ' · tenggat ' + F.fmtDate(g.deadline) : ''}</span>
      <span><button class="btn sm text" type="button" data-goal-edit="${g.id}">Ubah</button><button class="btn sm text expense" type="button" data-goal-del="${g.id}" aria-label="Hapus target ${esc(g.name)}">Hapus</button></span></div></li>`; }).join('')}</ul>` : '<p class="muted small">Belum ada target.</p>'}</section>`;
}
function goalForm(g) {
  openDialog(g ? 'Ubah target' : 'Target tabungan baru', `<label for="g-name">Nama target</label><input id="g-name" value="${esc(g?.name || '')}" maxlength="40" aria-describedby="g-name-err"><div class="err" id="g-name-err"></div>
    ${moneyField('g-target', 'Nominal target', g?.targetAmount ?? '')}${moneyField('g-saved', 'Sudah terkumpul', g?.savedAmount ?? 0)}
    <label for="g-dl">Tenggat (opsional)</label><input type="date" id="g-dl" value="${g?.deadline || ''}">
    <div class="actions"><button class="btn" type="button" data-close>Batal</button><button class="btn primary" type="button" id="g-save">Simpan</button></div>`, {
    onOpen: (root) => { $('#g-save', root).onclick = () => { const name = $('#g-name', root).value.trim(); setErr('g-name', name ? '' : 'Nama wajib diisi');
      const tg = readMoney($('#g-target', root)); setErr('g-target', tg.error); const sv = readMoney($('#g-saved', root), { allowZero: true }); setErr('g-saved', sv.error);
      if (!name || tg.error || sv.error) return; const v = { name, targetAmount: tg.value, savedAmount: sv.value, deadline: $('#g-dl', root).value || null };
      if (g) Object.assign(g, v); else data.savingGoals.push({ id: F.uid(), ...v, createdAt: new Date().toISOString() }); dlg.close(); persist(); }; } });
}
function bindAnggaran(root) {
  const p = B.activePlan(data);
  if (!p) planForm(null);
  else {
    $('#plan-edit', root).onclick = () => planForm(p);
    $('#plan-del', root).onclick = async () => { if (await confirmDialog('Hapus rencana?', 'Rencana aktif akan dihapus. Transaksi tidak terpengaruh.', 'Hapus', true)) { data.budgetPlans = data.budgetPlans.filter((x) => x !== p); persist('Rencana dihapus'); } };
    $$('[data-bv]', root).forEach((b) => (b.onclick = () => { ui.budgetView = b.dataset.bv; render(); }));
  }
  $$('[data-hist]', root).forEach((b) => (b.onclick = () => { ui.recapMode = b.dataset.hmode; ui.recapDate = b.dataset.hist; location.hash = '#rekap'; }));
  $('#goal-add', root).onclick = () => goalForm();
  $$('[data-goal-edit]', root).forEach((b) => (b.onclick = () => goalForm(data.savingGoals.find((g) => g.id === b.dataset.goalEdit))));
  $$('[data-goal-del]', root).forEach((b) => (b.onclick = async () => { if (await confirmDialog('Hapus target?', 'Target tabungan ini akan dihapus.', 'Hapus', true)) { data.savingGoals = data.savingGoals.filter((g) => g.id !== b.dataset.goalDel); persist('Target dihapus'); } }));
}

// ---------- Rekap (F-14, §8, §8a) ----------
function pageRekap() {
  if (!ui.recapMode) { const p = B.activePlan(data); ui.recapMode = p && p.period === 'monthly' ? 'monthly' : 'weekly'; }
  const m = ui.recapMode, R = recap(data, m, ui.recapDate);
  const label = m === 'weekly' ? F.fmtRange(R.start, R.end) : `${F.MONTHS_LONG[F.parse(R.start).getMonth()]} ${F.parse(R.start).getFullYear()}`;
  const pi = R.planInfo; const word = m === 'weekly' ? 'minggu' : 'bulan';
  const recon = R.openBal + R.totalIncome - R.totalExpense + R.adjustTotal + R.newAccOpening;
  return `<div class="row between"><div class="seg" role="group" aria-label="Jenis rekap"><button type="button" data-rm="weekly" aria-pressed="${m === 'weekly'}">Mingguan</button><button type="button" data-rm="monthly" aria-pressed="${m === 'monthly'}">Bulanan</button></div>
    <div class="row" style="flex-wrap:nowrap"><button class="iconbtn" type="button" id="r-prev" aria-label="${word} sebelumnya">◀</button><h2 style="margin:0;font-size:16px;text-align:center" aria-live="polite">${label}</h2><button class="iconbtn" type="button" id="r-next" aria-label="${word} berikutnya">▶</button></div></div>
  <div class="stats five" style="margin-top:12px">
    <div class="stat"><span class="small muted">Saldo awal</span><b>${rp(R.openBal)}</b></div><div class="stat"><span class="small muted">Pemasukan</span><b class="income">+${rp(R.totalIncome)}</b></div>
    <div class="stat"><span class="small muted">Pengeluaran</span><b class="expense">-${rp(R.totalExpense)}</b></div><div class="stat"><span class="small muted">Saldo akhir</span><b>${rp(R.closeBal)}</b></div>
    <div class="stat"><span class="small muted">Selisih (net)</span><b class="${R.net < 0 ? 'expense' : 'income'}">${rpSigned(R.net)}</b></div></div>
  <section class="card"><h3>Rekonsiliasi saldo</h3><div class="tablewrap"><table><tbody>
    <tr><th scope="row">Saldo awal</th><td class="r">${rp(R.openBal)}</td></tr><tr><th scope="row">+ Pemasukan</th><td class="r">${rp(R.totalIncome)}</td></tr><tr><th scope="row">− Pengeluaran</th><td class="r">${rp(R.totalExpense)}</td></tr>
    ${R.adjustTotal ? `<tr><th scope="row">± Penyesuaian (${R.adjustCount})</th><td class="r">${rpSigned(R.adjustTotal)}</td></tr>` : ''}
    ${R.newAccOpening ? `<tr><th scope="row">+ Saldo awal akun baru (${R.newAccounts.map((a) => esc(a.name)).join(', ')})</th><td class="r">${rpSigned(R.newAccOpening)}</td></tr>` : ''}
    <tr><th scope="row">= Saldo akhir</th><td class="r"><b>${rp(recon)}</b>${recon !== R.closeBal ? ' ⚠' : ''}</td></tr></tbody></table></div>
    ${R.transferCount ? `<p class="small muted">${R.transferCount} transfer antar akun tidak dihitung sebagai pemasukan/pengeluaran.</p>` : ''}</section>
  ${pi ? `<section class="card"><h3>Rencana jatah ${word} ini${pi.splitDates.length ? ` <span class="small muted">(rencana diubah ${pi.splitDates.map(F.fmtDate).join(', ')})</span>` : ''}</h3>
    ${pi.showSaving ? `<p style="margin:0">Dibagi <b class="num">${rp(pi.last.amountToAllocate)}</b> · Ditabung <b class="num">${rp(pi.last.savingAmount)}</b> · Jatah <b class="num">${rp(pi.last.dailyAllowance)}</b>/hari</p>` : '<p class="small muted" style="margin:0">Rencana bulanan aktif: ringkasan tabungan ada di rekap bulanan.</p>'}
    <p style="margin:8px 0 0">Jatah ${word} ini <b class="num">${rp(pi.portion)}</b> · Terpakai <b class="num">${rp(pi.used)}</b> · Sisa jatah <b class="num ${pi.remaining < 0 ? 'expense' : ''}">${rp(pi.remaining)}</b>
    ${pi.showSaving ? (pi.achieved ? '<span class="badge b-safe">✔ Sesuai rencana</span>' : '<span class="badge b-over">✖ Melebihi</span>') : ''}</p>
    <p class="small muted" style="margin:4px 0 0">Hari Lewat: ${pi.overDays}/${pi.rows.filter((r) => !r.outside).length}${pi.showSaving ? ` · Tabungan dicatat manual — target jangka panjang terkumpul ${rp(data.savingGoals.reduce((s, g) => s + g.savedAmount, 0))}` : ''}</p></section>` : ''}
  <div class="split"><section class="card"><h3>Pengeluaran per kategori</h3>${donut(R.expenseByCat, R.totalExpense)}</section>
  <section class="card"><h3>Pemasukan per kategori</h3>${R.incomeByCat.length ? `<ul class="legend">${R.incomeByCat.map((it) => `<li style="display:block"><div class="row between"><span>${esc(catName(it.categoryId))}</span><span class="num"><b>${rp(it.amount)}</b> <span class="muted">${pctStr(it.pct)}</span></span></div><div class="bar"><i style="width:${it.pct}%"></i></div></li>`).join('')}</ul>` : '<p class="muted">Belum ada data.</p>'}</section></div>
  ${pi ? `<section class="card" style="margin-top:16px"><h3>Jatah vs Aktual</h3>${barChart(pi.rows, { monthly: m === 'monthly' })}${m === 'monthly' ? `<details style="margin-top:12px"><summary>Kalender (heatmap)</summary>${heatmap(pi.rows)}</details>` : ''}${rowsTable(pi.rows)}</section>` : ''}
  ${m === 'monthly' ? `<section class="card" style="margin-top:16px"><h3>Ringkasan per minggu</h3><div class="tablewrap"><table><thead><tr><th scope="col">Minggu</th><th scope="col">Rentang</th><th scope="col" class="r">Pemasukan</th><th scope="col" class="r">Pengeluaran</th></tr></thead><tbody>${R.weeks.map((w) => `<tr><th scope="row">${w.label}</th><td>${F.parse(w.start).getDate()}–${F.parse(w.end).getDate()}</td><td class="r">${rp(w.income)}</td><td class="r">${rp(w.expense)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
  <div class="split" style="margin-top:16px"><section class="card"><h3>3 pengeluaran terbesar</h3>${R.top3.length ? `<ol class="list">${R.top3.map((t) => txItem(t, false)).join('')}</ol>` : '<p class="muted">Belum ada pengeluaran.</p>'}
    <p style="margin:12px 0 0">vs ${word} lalu: ${R.changePct == null ? '<b>—</b> <span class="muted small">belum ada data</span>' : `Pengeluaran <b class="${R.changePct > 0 ? 'expense' : 'income'}">${R.changePct > 0 ? '▲' : R.changePct < 0 ? '▼' : '='} ${pctStr(Math.abs(R.changePct))}</b> <span class="small muted">(${rp(R.prevExpense)} → ${rp(R.totalExpense)})</span>`}</p></section>
  <section class="card"><h3>Per akun</h3><ul class="list">${R.accounts.map((a) => `<li><span class="ic" aria-hidden="true">${ACC_ICON[a.account.type]}</span><div class="grow"><div class="t">${esc(a.account.name)}</div></div><div class="num">${rp(a.open)} → <b>${rp(a.close)}</b></div></li>`).join('')}</ul></section></div>`;
}
function bindRekap(root) {
  $$('[data-rm]', root).forEach((b) => (b.onclick = () => { ui.recapMode = b.dataset.rm; render(); }));
  const shift = (dir) => { ui.recapDate = ui.recapMode === 'weekly' ? F.addDays(F.weekStart(ui.recapDate), 7 * dir) : (() => { const d = F.parse(F.monthStart(ui.recapDate)); d.setMonth(d.getMonth() + dir); return F.ymd(d); })(); render(); };
  $('#r-prev', root).onclick = () => { shift(-1); $('#r-prev').focus(); }; $('#r-next', root).onclick = () => { shift(1); $('#r-next').focus(); };
}

// ---------- Pengaturan (F-09, F-15, F-16) ----------
function pageSettings() {
  const k = ui.catKind; const cats = data.categories.filter((c) => c.kind === k);
  const used = (c) => data.transactions.filter((t) => t.categoryId === c.id).length;
  return `<section class="card"><div class="row between"><h3 style="margin:0">Kategori</h3><button class="btn sm" type="button" id="cat-add">+ Kategori</button></div>
    <div class="seg" role="group" aria-label="Jenis kategori" style="margin-top:12px"><button type="button" data-ck="expense" aria-pressed="${k === 'expense'}">Pengeluaran</button><button type="button" data-ck="income" aria-pressed="${k === 'income'}">Pemasukan</button></div>
    <ul class="list">${cats.map((c) => { const n = used(c); return `<li><span class="ic" aria-hidden="true">${c.icon || '•'}</span><div class="grow"><div class="t">${esc(c.name)} ${c.isDefault ? '<span class="small muted">(bawaan)</span>' : ''} ${c.archived ? '<span class="badge b-none">Diarsipkan</span>' : ''}</div>${n ? `<div class="s">Dipakai ${n} transaksi</div>` : ''}</div>
      <button class="btn sm text" type="button" data-cat-ren="${c.id}" aria-label="Ubah nama kategori ${esc(c.name)}">Ubah</button>
      ${n ? `<button class="btn sm text" type="button" data-cat-arch="${c.id}">${c.archived ? 'Aktifkan' : 'Arsip'}</button>` : `<button class="btn sm text expense" type="button" data-cat-del="${c.id}" aria-label="Hapus kategori ${esc(c.name)}">Hapus</button>`}</li>`; }).join('')}</ul></section>
  <section class="card"><h3>Data</h3><div class="row"><button class="btn" type="button" id="exp-json">Ekspor JSON</button><label class="btn" for="imp-file" style="margin:0">Impor JSON</label><input type="file" id="imp-file" accept="application/json,.json" class="sr"><button class="btn" type="button" id="exp-csv">Ekspor CSV</button></div>
    <p class="small muted">Terakhir ekspor: ${data.settings.lastExport ? F.fmtDate(data.settings.lastExport.slice(0, 10)) : 'belum pernah'}. Impor akan <b>menimpa</b> seluruh data.</p></section>
  <section class="card"><h3 class="expense">Zona bahaya</h3><button class="btn danger" type="button" id="reset">Hapus semua data</button></section>
  <p class="small muted">Tentang: Kelola Keuangan v1.0 · data hanya di perangkat ini (localStorage, kunci <code>kk_data_v1</code>), tidak dikirim ke server mana pun.</p>`;
}
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
function exportJSON() { data.settings.lastExport = new Date().toISOString(); S.save(data); download(`kelola-keuangan-${today()}.json`, JSON.stringify({ ...data, exportedAt: data.settings.lastExport }, null, 2), 'application/json'); render(); toast('Data diekspor'); }
function exportCSV() {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = ['tanggal,jenis,nominal,akun,akun_tujuan,kategori,catatan', ...sortTx(data.transactions).reverse().map((t) => [t.date, TYPE_LABEL[t.type], t.amount, acc(t.accountId)?.name, acc(t.toAccountId)?.name, t.categoryId ? catName(t.categoryId) : '', t.note].map(q).join(','))];
  download(`transaksi-${today()}.csv`, '\uFEFF' + lines.join('\r\n'), 'text/csv'); toast('CSV diekspor');
}
function catForm(c) {
  openDialog(c ? 'Ubah kategori' : 'Kategori baru', `<label for="c-name">Nama kategori</label><input id="c-name" maxlength="30" value="${esc(c?.name || '')}" aria-describedby="c-name-err"><div class="err" id="c-name-err"></div>
    <label for="c-icon">Ikon (emoji, opsional)</label><input id="c-icon" maxlength="4" value="${esc(c?.icon || '')}">
    <div class="actions"><button class="btn" type="button" data-close>Batal</button><button class="btn primary" type="button" id="c-save">Simpan</button></div>`, {
    onOpen: (root) => { $('#c-save', root).onclick = () => { const name = $('#c-name', root).value.trim(); const kind = c ? c.kind : ui.catKind;
      const dup = data.categories.some((x) => x !== c && x.kind === kind && x.name.toLowerCase() === name.toLowerCase());
      setErr('c-name', !name ? 'Nama wajib diisi' : dup ? 'Nama kategori sudah ada' : ''); if (!name || dup) return;
      const icon = $('#c-icon', root).value.trim(); if (c) Object.assign(c, { name, icon }); else data.categories.push({ id: F.uid(), name, kind, icon, isDefault: false, archived: false });
      dlg.close(); persist(); }; } });
}
function bindSettings(root) {
  $$('[data-ck]', root).forEach((b) => (b.onclick = () => { ui.catKind = b.dataset.ck; render(); }));
  $('#cat-add', root).onclick = () => catForm();
  $$('[data-cat-ren]', root).forEach((b) => (b.onclick = () => catForm(cat(b.dataset.catRen))));
  $$('[data-cat-arch]', root).forEach((b) => (b.onclick = () => { const c = cat(b.dataset.catArch); c.archived = !c.archived; persist(c.archived ? 'Kategori diarsipkan' : 'Kategori diaktifkan'); }));
  $$('[data-cat-del]', root).forEach((b) => (b.onclick = async () => { const c = cat(b.dataset.catDel);
    if (data.transactions.some((t) => t.categoryId === c.id)) { toast('Kategori sudah dipakai, hanya bisa diarsipkan'); return; }
    if (await confirmDialog('Hapus kategori?', `Kategori <b>${esc(c.name)}</b> akan dihapus.`, 'Hapus', true)) { data.categories = data.categories.filter((x) => x !== c); persist('Kategori dihapus'); } }));
  $('#exp-json', root).onclick = exportJSON; $('#exp-csv', root).onclick = exportCSV;
  $('#imp-file', root).onchange = async (e) => { const file = e.target.files[0]; if (!file) return; let obj;
    try { obj = JSON.parse(await file.text()); } catch { toast('File bukan JSON yang valid'); return; }
    const err = S.validateImport(obj); if (err) { toast(err); return; }
    const ok = await confirmDialog('Impor data?', `File berisi ${obj.accounts.length} akun, ${obj.transactions.length} transaksi, ${(obj.budgetPlans || []).length} rencana.<br><b>Data saat ini akan diganti. Ekspor dulu?</b>`, 'Ganti data');
    if (!ok) { e.target.value = ''; return; } const { exportedAt, ...rest } = obj; data = S.migrate(rest); persist('Data diimpor'); };
  $('#reset', root).onclick = async () => {
    if (!(await confirmDialog('Yakin?', 'Semua akun, transaksi, rencana, dan kategori di perangkat ini akan dihapus permanen.', 'Lanjutkan', true))) return;
    openDialog('Konfirmasi terakhir', `<p>Ketik <b>HAPUS</b> untuk mengaktifkan tombol.</p><label for="reset-txt">Ketik HAPUS</label><input id="reset-txt" autocomplete="off">
      <div class="actions"><button class="btn" type="button" data-close>Batal</button><button class="btn danger" type="button" id="reset-go" disabled>Hapus semua data</button></div>`, {
      onOpen: (r) => { $('#reset-txt', r).oninput = (ev) => ($('#reset-go', r).disabled = ev.target.value !== 'HAPUS');
        $('#reset-go', r).onclick = () => { S.clear(); data = S.emptyData(); dlg.close(); ui.recapMode = null; location.hash = '#dashboard'; persist('Semua data dihapus'); }; } });
  };
}

const PAGES = { dashboard: pageDashboard, transaksi: pageTransaksi, akun: pageAkun, anggaran: pageAnggaran, rekap: pageRekap, pengaturan: pageSettings };
const BIND = { dashboard: bindTxActions, transaksi: bindTransaksi, akun: bindAkun, anggaran: bindAnggaran, rekap: bindRekap, pengaturan: bindSettings };
render();
