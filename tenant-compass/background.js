// Registers the content scripts of the enabled features only, so a disabled feature injects nothing.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
importScripts('tenant-guard/background.js', 'change-snapshot/background.js');

const CS_MATCHES = ['https://intune.microsoft.com/*', 'https://endpoint.microsoft.com/*', 'https://portal.azure.com/*', 'https://*.portal.azure.net/*'];

// Each feature = one or more content scripts (ids must be unique across features).⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
const SCRIPTS = {
  tenantGuard: [{
    id: 'tenant-guard',
    matches: chrome.runtime.getManifest().host_permissions,
    js: ['tenant-guard/lib.js', 'tenant-guard/content.js'],
    allFrames: true,
    runAt: 'document_idle',
  }],
  asBuilt: [{
    id: 'as-built',
    matches: ['https://intune.microsoft.com/*', 'https://endpoint.microsoft.com/*', 'https://*.portal.azure.net/*'],
    js: ['shared/drag.js', 'as-built/lib.js', 'as-built/page.js'],
    allFrames: true,
    runAt: 'document_start',
    world: 'MAIN',
  }],
  settingInspector: [{
    id: 'setting-inspector-hook',
    matches: ['https://intune.microsoft.com/*', 'https://endpoint.microsoft.com/*', 'https://*.portal.azure.net/*'],
    js: ['setting-inspector/page-hook.js'],
    allFrames: true,
    runAt: 'document_start',
    world: 'MAIN',
  }, {
    id: 'setting-inspector',
    matches: ['https://intune.microsoft.com/*', 'https://endpoint.microsoft.com/*', 'https://*.portal.azure.net/*'],
    js: ['setting-inspector/lib.js', 'setting-inspector/content.js'],
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
    matches: CS_MATCHES,
    js: ['change-snapshot/lib.js', 'change-snapshot/page.js'],
    allFrames: true,
    runAt: 'document_start',
    world: 'MAIN',
  }, {
    id: 'change-snapshot',
    matches: CS_MATCHES,
    js: ['change-snapshot/lib.js', 'change-snapshot/content.js'],
    allFrames: true,
    runAt: 'document_start',
  }],
};
const DEFAULTS = { tenantGuard: true, asBuilt: true, settingInspector: true, assignmentLens: true, changeSnapshot: true, portalLanguage: true }; // portalLanguage: popup-only, no content script

// UI language of the in-page features: a marker script sets <html data-tenant-compass-lang>, read by shared/i18n-page.js
// in every world. Each feature script also gets the shared helper and its own dictionary (<feature>/i18n.js).⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
const LANGS = ['fr', 'en'];
const defaultLang = () => ((navigator.language || '').toLowerCase().startsWith('fr') ? 'fr' : 'en');
const withI18n = s => ({ ...s, js: ['shared/i18n-page.js', s.js[s.js.length - 1].split('/')[0] + '/i18n.js', ...s.js] });

async function apply() {
  const { features, lang } = await chrome.storage.sync.get({ features: DEFAULTS, lang: '' });
  const on = { ...DEFAULTS, ...features };
  const ui = LANGS.includes(lang) ? lang : defaultLang();
  const ids = (await chrome.scripting.getRegisteredContentScripts()).map(s => s.id);
  if (ids.length) await chrome.scripting.unregisterContentScripts({ ids });
  const wanted = [
    { id: 'ui-lang', matches: chrome.runtime.getManifest().host_permissions, js: [`shared/lang/${ui}.js`], allFrames: true, runAt: 'document_start' },
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
