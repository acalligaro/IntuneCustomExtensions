// Feature menu. Main view: active features (chips), Tenant Guard current tab and rules; ⚙ opens the settings (feature toggles, positions).⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
// background.js re-registers content scripts when `features` changes; open tabs need a reload. Strings: shared/i18n.js.

const DEFAULTS = { tenantGuard: true, asBuilt: true, settingInspector: true, settingsExplainer: true, oibRecommendations: true, assignmentLens: true, changeSnapshot: true, portalLanguage: true, pim: true }; // keep in sync with background.js
// Set Tenant Language: two presets (language 1 / language 2), one button each.
const PL_DEFAULT = [{ lang: 'fr', format: 'fr-fr' }, { lang: 'en', format: 'en-us' }];
let portalLangs = PL_DEFAULT.map(p => ({ ...p }));
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
function applyPortalLang({ lang: l, format }) {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    const url = tab && PortalLanguage.portalUrl(tab.url || '', l, format);
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
  portalLangs.forEach((p, i) => {
    fill($id('pl-lang' + i), PortalLanguage.LANGUAGES, p.lang);
    fill($id('pl-format' + i), PortalLanguage.FORMATS, p.format);
  });
  const save = () => {
    portalLangs = [0, 1].map(i => ({ lang: $id('pl-lang' + i).value, format: $id('pl-format' + i).value }));
    chrome.storage.sync.set({ portalLangs });
    render();
  };
  for (const i of [0, 1]) $id('pl-lang' + i).onchange = $id('pl-format' + i).onchange = save;
}

// Quick actions shown next to an active feature.
const ACTIONS = {

  changeSnapshot: () => el('button', { textContent: '📋', title: t('menu.journal.title'), ariaLabel: t('menu.journal.title'),
    onclick: () => chrome.tabs.create({ url: chrome.runtime.getURL('change-snapshot/journal.html') }) }),
};

function render() {
  applyI18n();
  const on = Object.keys(DEFAULTS).filter(k => features[k]);
  // Compact: one chip per active feature (description as tooltip, full text in ⚙), quick action as an icon inside the chip.
  // Set Tenant Language and PIM are actions only, shown outside the chips (left column, buttons row).⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
  // Set Tenant Language: one button per preset, stacked left of the chips (#pl-col). PIM: its own buttons row.
  $id('pl-col').replaceChildren(...portalLangs.map(p => el('button', { textContent: '🌐 ' + p.lang.toUpperCase(),
    title: `${t('f.portalLanguage')} · ${t('pl.apply', { code: `${displayName(p.lang, 'language')} · ${displayName(p.format, 'language')}` })}`,
    onclick: () => applyPortalLang(p) })));
  $id('active-list').replaceChildren(...on.filter(k => k !== 'pim' && k !== 'portalLanguage').map(k =>
    el('span', { title: t('f.' + k + '.desc') }, t('f.' + k), ...(ACTIONS[k] ? [ACTIONS[k]()] : []))));
  $id('none').hidden = on.length > 0;
  $id('toggles').replaceChildren(...Object.keys(DEFAULTS).map(k => {
    const box = el('input', { type: 'checkbox', checked: features[k], onchange: () => {
      features = { ...features, [k]: box.checked };
      chrome.storage.sync.set({ features });
      $id('reload-btn').hidden = false;
      render();
    } });
    return el('label', { className: k === 'settingsExplainer' || k === 'oibRecommendations' ? 'feature sub' : 'feature' }, box, el('div', {}, el('b', { textContent: t('f.' + k) }), el('span', { textContent: t('f.' + k + '.desc') })));
  }));
  for (const n of document.querySelectorAll('.tg-only')) n.hidden = !features.tenantGuard;
  for (const n of document.querySelectorAll('.pl-only')) n.hidden = !features.portalLanguage;
  for (const n of document.querySelectorAll('.pim-only')) n.hidden = !features.pim;
  // Card close delay: applies to the setting card, whichever of its modules are on.
  for (const n of document.querySelectorAll('.se-only')) n.hidden = !(features.settingInspector || features.settingsExplainer || features.oibRecommendations);
  for (const b of document.querySelectorAll('[data-lang]')) b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
}

// PIM: My roles in the tenant Tenant Guard detected in the active tab (see pim/lib.js). "Active" selects its tab in background.js.
function openPim(active) {
  chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
    const st = tab && (await chrome.storage.session.get('t' + tab.id))['t' + tab.id];
    const url = Pim.pimUrl(st?.signals);
    if (active) chrome.runtime.sendMessage({ type: 'pimActive', url });
    else chrome.tabs.create({ url });
    window.close();
  });
}
$id('pim-eligible').onclick = () => openPim(false);
$id('pim-active').onclick = () => openPim(true);

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

// Settings Explainer: seconds the card stays after the pointer leaves the setting (read live by settings-explainer/content.js).
const SE_DEFAULT = { hideDelay: 2 };
$id('se-delay').onchange = e => {
  const v = Math.min(60, Math.max(0, Number(e.target.value) || 0));
  e.target.value = v;
  chrome.storage.sync.set({ explainer: { ...SE_DEFAULT, hideDelay: v } });
};

Promise.all([i18nReady, chrome.storage.sync.get({ features: DEFAULTS, portalLangs: null, portalLang: null, explainer: SE_DEFAULT })]).then(([, r]) => {
  features = { ...DEFAULTS, ...r.features };
  $id('se-delay').value = { ...SE_DEFAULT, ...r.explainer }.hideDelay;
  // Older versions kept one preset (portalLang): it becomes language 2.
  if (Array.isArray(r.portalLangs) && r.portalLangs.length === 2) portalLangs = r.portalLangs;
  else if (r.portalLang) portalLangs = [PL_DEFAULT[0], { ...PL_DEFAULT[1], ...r.portalLang }];
  renderPortalLang();
  render();
  try { if (sessionStorage.getItem('langChanged')) { sessionStorage.removeItem('langChanged'); $id('reload-btn').hidden = false; } } catch {}
});
