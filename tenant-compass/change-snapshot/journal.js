// Journal page: lists, filters, exports and clears the logged changes (chrome.storage.local, keys "e:<id>").⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
const L = globalThis.__changeSnapshotLib;
const $ = id => document.getElementById(id);
let all = [];
const T = (k, v) => __tenantCompassI18n.t(k, v);

function el(tag, props, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}

const localDay = ts => new Date(ts).toLocaleDateString('sv-SE'); // YYYY-MM-DD, local time like <input type=date>

function filtered() {
  const pol = $('fPolicy').value.trim().toLowerCase();
  const usr = $('fUser').value.trim().toLowerCase();
  const from = $('fFrom').value, to = $('fTo').value;
  return all.filter(e =>
    (!pol || `${e.policyName || ''} ${e.policyId} ${e.policyType}`.toLowerCase().includes(pol)) &&
    (!usr || (e.user || '').toLowerCase().includes(usr)) &&
    (!from || localDay(e.ts) >= from) &&
    (!to || localDay(e.ts) <= to));
}

const OPS = { add: '+', remove: '−', change: '~' };

function detail(e) {
  const diff = el('table', { className: 'diff' }, ...e.diff.map(d => el('tr', { className: d.op },
    el('td', { textContent: OPS[d.op] }),
    el('td', { textContent: d.path || T('changeSnapshot.root') }),
    el('td', { textContent: d.op === 'add' ? '' : L.formatValue(d.from, 2000) }),
    el('td', { textContent: d.op === 'remove' ? '' : L.formatValue(d.to, 2000) }))));
  return el('td', { colSpan: 10 },
    el('div', { className: 'hint', textContent: `${e.method} · ${e.url}` }),
    e.diff.length ? diff : el('p', { textContent: T('changeSnapshot.noDiff') }),
    e.before ? '' : el('p', { className: 'hint', textContent: T('changeSnapshot.journal.noBefore') }),
    el('details', {}, el('summary', { textContent: T('changeSnapshot.journal.before') }), el('pre', { textContent: JSON.stringify(e.before, null, 2) })),
    el('details', {}, el('summary', { textContent: T('changeSnapshot.journal.after') }), el('pre', { textContent: JSON.stringify(e.after, null, 2) })));
}

function render() {
  const list = filtered();
  $('count').textContent = T('changeSnapshot.journal.count', { shown: list.length, total: all.length });
  $('rows').replaceChildren(...list.map(e => {
    const btn = el('button', { textContent: T('changeSnapshot.journal.show') });
    const tr = el('tr', {},
      el('td', { textContent: new Date(e.ts).toLocaleString(__tenantCompassI18n.lang() === 'en' ? 'en-US' : 'fr-FR') }),
      el('td', { textContent: e.user || '?' }),
      el('td', { textContent: e.tenantId || '?' }),
      el('td', { className: e.env === 'prod' ? 'prod' : '', textContent: e.env ? T('changeSnapshot.env.' + e.env) : '?' }),
      el('td', { textContent: e.policyType }),
      el('td', { textContent: e.policyName || e.policyId, title: e.policyId }),
      e.ticket ? el('td', { textContent: e.ticket }) : el('td', { className: 'noticket', textContent: T('changeSnapshot.journal.noTicket') }),
      el('td', { textContent: e.comment }),
      el('td', { textContent: String(e.diff.length) }),
      el('td', {}, btn));
    btn.addEventListener('click', () => {
      if (tr.nextSibling && tr.nextSibling.className === 'detail') { tr.nextSibling.remove(); btn.textContent = T('changeSnapshot.journal.show'); return; }
      tr.after(el('tr', { className: 'detail' }, detail(e)));
      btn.textContent = T('changeSnapshot.journal.hide');
    });
    return tr;
  }));
}

async function load() {
  const data = await chrome.storage.local.get(null);
  all = Object.entries(data).filter(([k]) => k.startsWith('e:')).map(([, v]) => v).sort((a, b) => b.ts.localeCompare(a.ts));
  render();
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  el('a', { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
$('exportJson').addEventListener('click', () => download(`change-snapshot-${stamp()}.json`, JSON.stringify(filtered(), null, 2), 'application/json'));
$('exportCsv').addEventListener('click', () => download(`change-snapshot-${stamp()}.csv`, '﻿' + L.toCsv(filtered()), 'text/csv;charset=utf-8'));
$('clear').addEventListener('click', async () => {
  if (!confirm(T('changeSnapshot.journal.confirmClear', { count: all.length }))) return;
  await chrome.storage.local.remove(all.map(e => 'e:' + e.id));
});
for (const id of ['fPolicy', 'fUser', 'fFrom', 'fTo']) $(id).addEventListener('input', render);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') load();
  if (area === 'sync' && changes.lang) setLang(changes.lang.newValue).then(render);
});

// Language: same rule as background.js (chrome.storage.sync `lang`, else the browser language). Set before any render.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
async function setLang(lang) {
  if (lang === undefined) ({ lang } = await chrome.storage.sync.get({ lang: '' }));
  const ui = ['fr', 'en'].includes(lang) ? lang : (navigator.language || '').toLowerCase().startsWith('fr') ? 'fr' : 'en';
  document.documentElement.dataset.tenantCompassLang = ui;
  document.documentElement.lang = ui;
  for (const n of document.querySelectorAll('[data-i18n]')) n.textContent = T(n.dataset.i18n);
}
setLang().then(load);
//⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
