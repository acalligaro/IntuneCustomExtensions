// Feature menu. Main view: active features (chips), Tenant Guard current tab and rules; ⚙ opens the settings (feature toggles, positions).⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
// background.js re-registers content scripts when `features` changes; open tabs need a reload. Strings: shared/i18n.js.

const DEFAULTS = { tenantGuard: true, asBuilt: true, settingInspector: true, assignmentLens: true, changeSnapshot: true, portalLanguage: true }; // keep in sync with background.js
const PL_DEFAULT = { lang: 'en', format: 'en-us' };
let portalLang = { ...PL_DEFAULT };
const $id = id => document.getElementById(id);
// Same page serves as the toolbar popup and as the options tab (import, native color picker): style the tab as a centered card.
if (!chrome.extension.getViews({ type: 'popup' }).includes(window)) document.documentElement.classList.add('tab');
let features = { ...DEFAULTS };

function el(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids);
  return n;
}

// Set Tenant Language: reload the active portal tab with ?l=<language>.<format> (see portal-language/lib.js).⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
function applyPortalLang() {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    const url = tab && PortalLanguage.portalUrl(tab.url || '', portalLang.lang, portalLang.format);
    if (!url) { $id('pl-msg').textContent = t('pl.noPortal'); return; }
    chrome.tabs.update(tab.id, { url });
    window.close();
  });
}

const displayName = (code, type) => { try { return new Intl.DisplayNames([lang], { type }).of(code) || code; } catch { return code; } };

function renderPortalLang() {
  const fill = (sel, codes, value) => {
    sel.replaceChildren(...codes.map(c => el('option', { value: c, textContent: `${displayName(c, 'language')} (${c})`, selected: c === value })));
  };
  fill($id('pl-lang'), PortalLanguage.LANGUAGES, portalLang.lang);
  fill($id('pl-format'), PortalLanguage.FORMATS, portalLang.format);
  const save = () => {
    portalLang = { lang: $id('pl-lang').value, format: $id('pl-format').value };
    chrome.storage.sync.set({ portalLang });
    render();
  };
  $id('pl-lang').onchange = save;
  $id('pl-format').onchange = save;
}

// Quick actions shown next to an active feature.
const ACTIONS = {
  portalLanguage: () => el('button', { textContent: '🌐 ' + portalLang.lang.toUpperCase(),
    title: `${t('f.portalLanguage')} · ${t('pl.apply', { code: `${displayName(portalLang.lang, 'language')} · ${displayName(portalLang.format, 'language')}` })}`,
    onclick: applyPortalLang }),
  changeSnapshot: () => el('button', { textContent: '📋', title: t('menu.journal.title'), ariaLabel: t('menu.journal.title'),
    onclick: () => chrome.tabs.create({ url: chrome.runtime.getURL('change-snapshot/journal.html') }) }),
};

function render() {
  applyI18n();
  const on = Object.keys(DEFAULTS).filter(k => features[k]);
  // Compact: one chip per active feature (description as tooltip, full text in ⚙), quick action as an icon inside the chip.
  // Set Tenant Language is its action only (🌐 + target language): its full name is in the tooltip.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
  $id('active-list').replaceChildren(...on.map(k => k === 'portalLanguage'
    ? Object.assign(ACTIONS[k](), { className: 'solo' })
    : el('span', { title: t('f.' + k + '.desc') }, t('f.' + k), ...(ACTIONS[k] ? [ACTIONS[k]()] : []))));
  $id('none').hidden = on.length > 0;
  $id('toggles').replaceChildren(...Object.keys(DEFAULTS).map(k => {
    const box = el('input', { type: 'checkbox', checked: features[k], onchange: () => {
      features = { ...features, [k]: box.checked };
      chrome.storage.sync.set({ features });
      $id('reload-btn').hidden = false;
      render();
    } });
    return el('label', { className: 'feature' }, box, el('div', {}, el('b', { textContent: t('f.' + k) }), el('span', { textContent: t('f.' + k + '.desc') })));
  }));
  for (const n of document.querySelectorAll('.tg-only')) n.hidden = !features.tenantGuard;
  for (const n of document.querySelectorAll('.pl-only')) n.hidden = !features.portalLanguage;
  for (const b of document.querySelectorAll('[data-lang]')) b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
}

$id('gear').onclick = () => {
  const open = $id('settings').hidden;
  $id('settings').hidden = !open;
  $id('gear').setAttribute('aria-pressed', String(open));
};

// Tenant Guard texts (options.js) are built once: reload the page so they follow the new language.
// The in-page features follow the language after the portal tab reloads: remind it once the popup has reloaded.
for (const b of document.querySelectorAll('[data-lang]')) b.onclick = () => {
  if (b.dataset.lang === lang) return;
  setLang(b.dataset.lang);
  try { sessionStorage.setItem('langChanged', '1'); } catch {}
  location.reload();
};

// Positions live in the portal page's localStorage (shared/drag.js): clear them in the active tab, then reload it.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
$id('reset-pos').onclick = () =>
  chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
    const msg = $id('reset-msg');
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => Object.keys(localStorage).filter(k => k.startsWith('tenant-compass:pos:')).forEach(k => localStorage.removeItem(k)),
      });
      chrome.tabs.reload(tab.id);
      msg.textContent = t('menu.resetPos.done');
    } catch {
      msg.textContent = t('menu.resetPos.noTab');
    }
  });

$id('reload-btn').onclick = () =>
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => tab && chrome.tabs.reload(tab.id));

Promise.all([i18nReady, chrome.storage.sync.get({ features: DEFAULTS, portalLang: PL_DEFAULT })]).then(([, r]) => {
  features = { ...DEFAULTS, ...r.features };
  portalLang = { ...PL_DEFAULT, ...r.portalLang };
  renderPortalLang();
  render();
  try { if (sessionStorage.getItem('langChanged')) { sessionStorage.removeItem('langChanged'); $id('reload-btn').hidden = false; } } catch {}
});
