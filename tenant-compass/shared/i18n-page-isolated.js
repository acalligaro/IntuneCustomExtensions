// In-page translations for the features (MAIN and ISOLATED worlds, extension pages). One namespaced global only:⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
// top-level names in the portal's realm could clash with the page's own globals.
// Language: <html data-tenant-compass-lang> set at document_start by shared/lang/<lang>.js (registered by background.js);⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
// extension pages (journal) set it themselves from chrome.storage.sync `lang`. Read at call time, never cached.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
// Each feature adds its dictionary from <feature>/i18n.js: __tenantCompassI18n.add({ fr: {...}, en: {...} }).
(() => {
  if (globalThis.__tenantCompassI18n) return;
  const dict = { fr: {}, en: {} };
  const lang = () => (document.documentElement.dataset.tenantCompassLang === 'en' ? 'en' : 'fr');
  globalThis.__tenantCompassI18n = {
    lang,
    add(d) { for (const l of Object.keys(dict)) Object.assign(dict[l], d[l]); },
    // Missing key: French text, else the key itself. Variables: {name}.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
    t(key, vars) {
      const s = dict[lang()][key] ?? dict.fr[key] ?? key;
      return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
    },
  };
})();
