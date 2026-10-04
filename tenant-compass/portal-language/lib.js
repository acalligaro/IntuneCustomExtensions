// Set Tenant Language: switch the admin portal (Intune / Azure / Entra / Defender / Purview) to a preset language + regional format in one click.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
// Same result as the portal's Settings > Language + region, through the portal's `l=<language>.<format>` URL parameter
// (e.g. ?l=en.en-us), then a reload. Pure helpers, shared by popup.js and test.js.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
(() => {
  // Intune admin center languages (Learn: Intune service description > Language support), Azure portal codes.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
  const LANGUAGES = ['en', 'fr', 'de', 'es', 'it', 'nl', 'pt-br', 'pt-pt', 'pl', 'cs', 'hu', 'ru', 'sv', 'da', 'fi', 'nb', 'ro', 'el', 'tr', 'id', 'ja', 'ko', 'zh-hans', 'zh-hant'];
  // Regional formats (dates, numbers, currency); can differ from the language.
  const FORMATS = ['en-us', 'en-gb', 'fr-fr', 'fr-be', 'fr-ca', 'fr-ch', 'de-de', 'de-ch', 'es-es', 'it-it', 'nl-nl', 'nl-be', 'pt-br', 'pt-pt',
    'pl-pl', 'cs-cz', 'hu-hu', 'ru-ru', 'sv-se', 'da-dk', 'fi-fi', 'nb-no', 'ro-ro', 'el-gr', 'tr-tr', 'id-id', 'ja-jp', 'ko-kr', 'zh-cn', 'zh-tw'];
  // Azure portal family: ?l=<language>.<format>. Defender and Purview: ?mkt=<locale> (UI language only, tested 2026-10-04).
  // M365 admin center, Exchange, Teams and SharePoint admin follow the account language: no URL parameter changes them.
  const PORTALS = /^(intune\.microsoft\.com|endpoint\.microsoft\.com|portal\.azure\.com|entra\.microsoft\.com)$/i;
  const MKT_PORTALS = /^(security\.microsoft\.com|purview\.microsoft\.com)$/i;

  const host = url => { try { const u = new URL(url); return u.protocol === 'https:' ? u.hostname : ''; } catch { return ''; } };
  const isPortal = url => PORTALS.test(host(url)) || MKT_PORTALS.test(host(url));

  // Same page (path and #blade kept), language parameter set. null for unknown values or a non-portal URL.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
  function portalUrl(url, lang, format) {
    if (!isPortal(url) || !LANGUAGES.includes(lang) || !FORMATS.includes(format)) return null;
    const u = new URL(url);
    if (PORTALS.test(u.hostname)) u.searchParams.set('l', `${lang}.${format}`);
    // mkt is a locale: the regional format when it is a variant of the language (fr + fr-ca), else the bare language.
    else u.searchParams.set('mkt', format.startsWith(lang.split('-')[0] + '-') ? format : lang);
    return u.href;
  }

  const api = { LANGUAGES, FORMATS, isPortal, portalUrl };
  if (typeof module !== 'undefined') module.exports = api;
  else globalThis.PortalLanguage = api;
})();
