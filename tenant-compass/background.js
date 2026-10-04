// Registers the content scripts of the enabled features only, so a disabled feature injects nothing.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
importScripts('tenant-guard/background.js', 'change-snapshot/background.js', 'settings-explainer/csp.js', 'settings-explainer/background.js', 'pim/lib.js');

// PIM "Active" button (popup): open My roles, then select the Active assignments tab once the page has loaded.
// The portal often bounces through login.microsoftonline.com (SSO) before the blade shows, so every portal load of the tab
// in the first minute gets the script, not only the first one. All frames: the blade can render in a *.portal.azure.net iframe.
chrome.runtime.onMessage.addListener(msg => {
  if (msg.type !== 'pimActive') return;
  chrome.tabs.create({ url: msg.url }).then(({ id }) => {
    const done = (tabId, info, tab) => {
      if (tabId !== id || info.status !== 'complete' || !tab.url?.startsWith('https://portal.azure.com/')) return;
      chrome.scripting.executeScript({ target: { tabId: id, allFrames: true }, func: Pim.selectActiveTab }).catch(() => {});
    };
    chrome.tabs.onUpdated.addListener(done);
    setTimeout(() => chrome.tabs.onUpdated.removeListener(done), 60000); // ponytail: lost if the service worker sleeps first; the user then picks the tab
  });
});

// Portals only: host_permissions also holds learn.microsoft.com (Settings Explainer reads its CSP pages), where nothing is injected.
const PORTALS = chrome.runtime.getManifest().host_permissions.filter(h => !h.includes('learn.microsoft.com'));
const CS_MATCHES = ['https://intune.microsoft.com/*', 'https://endpoint.microsoft.com/*', 'https://portal.azure.com/*', 'https://*.portal.azure.net/*'];

// Each feature = one or more content scripts (ids must be unique across features).⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
const SCRIPTS = {
  tenantGuard: [{
    id: 'tenant-guard',
    matches: PORTALS,
    js: ['tenant-guard/lib.js', 'tenant-guard/content.js'],
    allFrames: true,
    runAt: 'document_idle',
  }],
  asBuilt: [{
    id: 'as-built',
    // Intune console: Intune objects; Entra and Azure consoles: Entra objects (see as-built/page.js).
    matches: ['https://intune.microsoft.com/*', 'https://endpoint.microsoft.com/*', 'https://entra.microsoft.com/*', 'https://portal.azure.com/*', 'https://*.portal.azure.net/*'],
    js: ['shared/drag.js', 'as-built/lib.js', 'as-built/page.js'],
    allFrames: true,
    runAt: 'document_start',
    world: 'MAIN',
  }],
  // The setting card. Three modules toggled separately (Setting Inspector details, Settings Explainer, OpenIntuneBaseline recommendations),⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
  // shown in this one card: injected when any of them is on (see apply()), content.js reads `features` to pick the sections.
  settingsExplainer: [{
    id: 'settings-explainer-hook',
    i18n: false,
    matches: ['https://intune.microsoft.com/*', 'https://endpoint.microsoft.com/*', 'https://*.portal.azure.net/*'],
    js: ['settings-explainer/page-hook.js'],
    allFrames: true,
    runAt: 'document_start',
    world: 'MAIN',
  }, {
    id: 'settings-explainer',
    matches: ['https://intune.microsoft.com/*', 'https://endpoint.microsoft.com/*', 'https://*.portal.azure.net/*'],
    js: ['settings-explainer/lib.js', 'setting-inspector/oib.js', 'settings-explainer/content.js'],
    allFrames: true,
    runAt: 'document_start',
  }],
  assignmentLens: [{
    id: 'assignment-lens',
    matches: ['https://intune.microsoft.com/*', 'https://*.portal.azure.net/*'],
    js: ['shared/drag.js', 'assignment-lens/lib.js', 'assignment-lens/page.js'],
    allFrames: true,
    runAt: 'document_start',
    world: 'MAIN',
  }],
  changeSnapshot: [{
    id: 'change-snapshot-hook',
    i18n: false,
    matches: CS_MATCHES,
    js: ['change-snapshot/lib.js', 'change-snapshot/page.js'],
    allFrames: true,
    runAt: 'document_start',
    world: 'MAIN',
  }, {
    id: 'change-snapshot',
    matches: CS_MATCHES,
    // No lib.js here: listed for the MAIN hook too, Chrome would inject it in one world only and page.js, which has no
    // fallback, could lose it. content.js loads it with import() (web_accessible_resources).
    js: ['change-snapshot/content.js'],
    allFrames: true,
    runAt: 'document_start',
  }],
};
const DEFAULTS = { tenantGuard: true, asBuilt: true, settingInspector: true, settingsExplainer: true, oibRecommendations: true, assignmentLens: true, changeSnapshot: true, portalLanguage: true, pim: true }; // portalLanguage, pim: popup-only, no content script

// UI language of the in-page features: a marker script sets <html data-tenant-compass-lang>, read by shared/i18n-page.js
// in every world. Each feature script also gets the shared helper and its own dictionary (<feature>/i18n.js).⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
const LANGS = ['fr', 'en'];
const defaultLang = () => ((navigator.language || '').toLowerCase().startsWith('fr') ? 'fr' : 'en');
// Chrome injects a given file only once per frame, whatever the world: a file shared by a MAIN and an ISOLATED script
// runs only in the first one injected. So the helper has one path per world (identical files, checked by
// tenant-guard/test.js), and MAIN hooks that show no text (`i18n: false`) get no dictionary, which keeps
// <feature>/i18n.js for the feature's ISOLATED script.
const withI18n = ({ i18n, ...s }) => i18n === false ? s : ({ ...s, js: [s.world === 'MAIN' ? 'shared/i18n-page.js' : 'shared/i18n-page-isolated.js',
  s.js[s.js.length - 1].split('/')[0] + '/i18n.js', ...s.js] });

async function apply() {
  const { features, lang } = await chrome.storage.sync.get({ features: DEFAULTS, lang: '' });
  const on = { ...DEFAULTS, ...features };
  on.settingsExplainer = on.settingInspector || on.settingsExplainer || on.oibRecommendations; // one card, see SCRIPTS.settingsExplainer
  const ui = LANGS.includes(lang) ? lang : defaultLang();
  const ids = (await chrome.scripting.getRegisteredContentScripts()).map(s => s.id);
  if (ids.length) await chrome.scripting.unregisterContentScripts({ ids });
  const wanted = [
    { id: 'ui-lang', matches: PORTALS, js: [`shared/lang/${ui}.js`], allFrames: true, runAt: 'document_start' },
    ...Object.keys(SCRIPTS).filter(k => on[k]).flatMap(k => SCRIPTS[k]).map(withI18n),
  ];
  await chrome.scripting.registerContentScripts(wanted);
  if (!on.tenantGuard) chrome.action.setBadgeText({ text: '' });
}

// Serialized: two quick toggles must not interleave unregister/register.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
let queue = Promise.resolve();
const sync = () => (queue = queue.then(apply, apply).catch(e => console.error('[Tenant Compass]', e)));

chrome.runtime.onInstalled.addListener(sync);
chrome.runtime.onStartup.addListener(sync);
chrome.storage.onChanged.addListener((c, area) => { if (area === 'sync' && (c.features || c.lang)) sync(); });
