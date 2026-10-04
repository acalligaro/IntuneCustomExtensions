// Popup and options page: edit tenant rules, show what the active tab detected. Strings: t() from shared/i18n.js.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣

const $ = s => document.querySelector(s);
let rules = [];
let customColors = []; // up to 5 user-saved colors, shown after the presets

const PRESETS = [['Rouge', '#d13438'], ['Bleu', '#0078d4'], ['Vert', '#107c10'], ['Violet', '#5c2d91'], ['Fuchsia', '#c239b3']];
const MAX_CUSTOM = 5;
const HEX = /^#[0-9a-f]{6}$/i;
const inPopup = chrome.extension.getViews({ type: 'popup' }).includes(window);

const save = () => chrome.storage.sync.set({ rules });
const saveCustom = () => { chrome.storage.sync.set({ customColors }); draw(); };

// HSL (degrees, %, %) to #rrggbb, for the popup's inline color sliders.
function hslHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))).toString(16).padStart(2, '0');
  return `#${f(0)}${f(8)}${f(4)}`;
}

function swatch(color, title, onclick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'sw';
  b.title = title;
  b.style.background = color;
  b.onclick = onclick;
  return b;
}

// Color cell: native <details> dropdown with presets, saved colors and a free picker.
function picker(r, onPick) {
  const d = document.createElement('details');
  d.className = 'pick';
  const sum = document.createElement('summary');
  sum.title = t('tg.pickColor');
  sum.style.background = r.color;
  const pal = document.createElement('div');
  pal.className = 'pal';
  const pick = c => { sum.style.background = c; onPick(c); d.open = false; };
  for (const [name, c] of PRESETS) pal.append(swatch(c, name, () => pick(c)));
  // Saved colors on their own row, under the presets (grid of 5 columns, MAX_CUSTOM = 5).
  customColors.forEach((c, i) => {
    const b = swatch(c, c, () => pick(c));
    if (!i) b.style.gridColumnStart = 1;
    pal.append(b);
  });
  const more = document.createElement('div');
  more.className = 'more';
  const other = document.createElement(inPopup ? 'div' : 'label');
  if (inPopup) {
    // The native color dialog takes focus and closes the action popup: inline picker instead (hue + lightness sliders,⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
    // hex code, live preview; click the preview or press Enter to apply). Full native picker: options tab.
    const hex = document.createElement('input');
    Object.assign(hex, { type: 'text', className: 'hex', maxLength: 7, placeholder: '#RRGGBB', value: r.color, spellcheck: false, title: t('tg.hex') });
    const ok = () => HEX.test(hex.value.trim());
    const prev = swatch(r.color, t('tg.applyHex'), () => { if (ok()) pick(hex.value.trim().toLowerCase()); });
    const range = (cls, max, value, title) => Object.assign(document.createElement('input'), { type: 'range', className: cls, min: 0, max, value, title });
    const hue = range('hue', 359, 210, t('tg.hue'));
    const lum = range('lum', 100, 45, t('tg.lightness'));
    const fromSliders = () => { hex.value = hslHex(+hue.value, 75, +lum.value); prev.style.background = hex.value; lum.style.setProperty('--h', hue.value); };
    hue.oninput = fromSliders;
    lum.oninput = fromSliders;
    lum.style.setProperty('--h', hue.value);
    hex.oninput = () => { if (ok()) prev.style.background = hex.value.trim(); };
    hex.onkeydown = e => { if (e.key === 'Enter' && ok()) { e.preventDefault(); pick(hex.value.trim().toLowerCase()); } };
    // "Other…" keeps the native color picker: it opens in the options tab (the dialog would close the popup).
    const native = Object.assign(document.createElement('input'), { type: 'color', value: r.color, title: t('tg.otherColor') });
    native.onclick = e => { e.preventDefault(); chrome.runtime.openOptionsPage(); };
    const nativeLabel = document.createElement('label');
    nativeLabel.className = 'native';
    nativeLabel.append(native, t('tg.other'));
    other.className = 'cp';
    other.append(hue, lum, prev, hex, nativeLabel);
  } else {
    const free = document.createElement('input');
    free.type = 'color';
    free.value = r.color;
    free.title = t('tg.otherColor');
    free.onchange = () => pick(free.value);
    other.append(free, t('tg.other'));
  }
  const keep = document.createElement('button');
  keep.type = 'button';
  keep.textContent = t('tg.keep');
  keep.title = t('tg.keep.title', { max: MAX_CUSTOM });
  keep.onclick = () => {
    const c = r.color.toLowerCase();
    if (PRESETS.some(([, p]) => p === c) || customColors.includes(c)) return;
    customColors = [...customColors, c].slice(-MAX_CUSTOM);
    saveCustom();
  };
  more.append(other, keep);
  pal.append(more);
  d.append(sum, pal);
  return d;
}

function drawCustom() {
  const box = $('#customs');
  box.replaceChildren(...customColors.map(c => {
    const b = swatch(c, t('tg.remove', { c }), () => { customColors = customColors.filter(x => x !== c); saveCustom(); });
    b.textContent = '✕';
    return b;
  }));
  if (!customColors.length) box.textContent = t('tg.noCustom');
}

function row(r) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="match"><input type="text" placeholder="contoso.onmicrosoft.com, 00000000-…"></td>
    <td><input type="text" placeholder="CONTOSO PROD"></td>
    <td class="color"></td>
    <td><input type="checkbox"></td>
    <td><button>✕</button></td>`;
  tr.querySelector('td:last-child button').title = t('tg.delete');
  const [match, label, prod] = tr.querySelectorAll('input');
  match.value = r.match;
  label.value = r.label;
  prod.checked = r.prod;
  tr.querySelector('.color').append(picker(r, c => { r.color = c; save(); }));
  // "change" (not "input") keeps us under the storage.sync write quota while typing.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
  tr.addEventListener('change', e => {
    if (e.target.type === 'color' || e.target.closest('.pal')) return; // handled by picker()
    const dup = taken(match.value, r);
    if (dup) { match.value = r.match; msg(t('tg.knownAs', { label: dup.label || dup.match }) + '.'); } // a tenant is registered once
    Object.assign(r, { match: match.value, label: label.value, prod: prod.checked });
    save();
  });
  tr.querySelector('td:last-child button').onclick = () => { rules.splice(rules.indexOf(r), 1); save(); draw(); };
  return tr;
}

function draw() {
  $('#rules').replaceChildren(...rules.map(row));
  drawCustom();
}

const msg = text => { $('#io-msg').textContent = text; };

// Other rule already covering one of the comma-separated terms of `match` (same matching as the banner).
function taken(match, self) {
  const others = rules.filter(r => r !== self);
  for (const term of String(match).split(',').map(x => x.trim()).filter(Boolean)) {
    const hit = matchRule([term], others);
    if (hit) return hit.rule;
  }
  return null;
}

function add(match = '') {
  const dup = match && taken(match);
  if (dup) return msg(t('tg.knownAs', { label: dup.label || dup.match }) + '.');
  rules.push({ match, label: '', color: '#d13438', prod: true });
  save();
  draw();
  $('#rules tr:last-child input')?.focus();
}

$('#add').onclick = () => add();

$('#export').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ app: 'tenant-guard', exportedAt: new Date().toISOString(), rules, customColors }, null, 2)], { type: 'application/json' }));
  Object.assign(document.createElement('a'), { href: url, download: `tenant-guard-${new Date().toISOString().slice(0, 10)}.json` }).click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};

// The action popup closes when the file chooser takes focus, so import runs from the options tab.
$('#import').onclick = () => (inPopup ? chrome.runtime.openOptionsPage() : $('#import-file').click());
$('#import-file').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const res = mergeRules(rules, JSON.parse(await file.text()), customColors, MAX_CUSTOM);
    await chrome.storage.sync.set({ rules: res.rules, customColors: res.customColors }); // rejects on sync quota (~8 KB per item)
    rules = res.rules;
    customColors = res.customColors;
    draw();
    $('#io-msg').textContent = t('tg.imported', { n: res.imported });
  } catch (err) {
    $('#io-msg').textContent = t('tg.importError', { msg: err.message });
  }
};

i18nReady.then(() => chrome.storage.sync.get({ rules: [], customColors: [] }, r => {
  rules = r.rules;
  customColors = r.customColors.filter(c => HEX.test(c)).slice(-MAX_CUSTOM);
  draw();
}));

// The portal shows the tenant a moment after load: say "detecting" and re-read for 3 s before reporting nothing found.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
const DETECT_MS = 3000;
const opened = Date.now();

i18nReady.then(() => chrome.tabs.query({ active: true, currentWindow: true }, async function show([tab]) {
  if (!tab) return;
  const key = 't' + tab.id;
  const st = (await chrome.storage.session.get(key))[key];
  const box = $('#current');
  if (!st?.signals.length && Date.now() - opened < DETECT_MS) {
    box.textContent = t('tg.detecting');
    setTimeout(() => show([tab]), 500);
    return;
  }
  if (!st) { box.textContent = t('tg.noPortal'); return; }
  box.replaceChildren();
  const head = document.createElement('div');
  head.textContent = st.label ? t('tg.tenant', { label: st.label + (st.prod ? ' (PROD)' : '') }) : t('tg.unknown');
  box.append(head);
  if (!st.signals.length) {
    box.append(t('tg.noSignal'));
    return;
  }
  const ul = document.createElement('ul');
  for (const s of st.signals) {
    const li = document.createElement('li');
    const code = document.createElement('code');
    code.textContent = s;
    const btn = document.createElement('button');
    const known = matchRule([s], rules)?.rule;
    btn.textContent = known ? (known.label ? t('tg.knownAs', { label: known.label }) : t('tg.known')) : t('tg.reference');
    btn.disabled = !!known;
    // Name and tenant ID are the same tenant: one rule holds every signal not referenced yet, so it matches every console.
    btn.onclick = () => {
      add(st.signals.filter(x => !matchRule([x], rules)).join(', '));
      for (const b of ul.querySelectorAll('button')) { b.textContent = t('tg.known'); b.disabled = true; }
    };
    li.append(code, ' ', btn);
    ul.append(li);
  }
  box.append(ul);
}));
