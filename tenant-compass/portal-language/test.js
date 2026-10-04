// Run with: node test.js⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
const assert = require('node:assert');
const { LANGUAGES, FORMATS, isPortal, portalUrl } = require('./lib.js');

assert.ok(isPortal('https://intune.microsoft.com/#home'));
assert.ok(isPortal('https://portal.azure.com/'));
assert.ok(!isPortal('http://intune.microsoft.com/'));
assert.ok(!isPortal('https://intune.microsoft.com.evil.example/'));
assert.ok(!isPortal('chrome://extensions'));
assert.ok(!isPortal('not a url'));

// Hash route (the open blade) is kept; an existing l= is replaced, other parameters kept.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
assert.strictEqual(portalUrl('https://intune.microsoft.com/#view/Microsoft_Intune_DeviceSettings/DevicesMenu/~/configuration', 'en', 'en-us'),
  'https://intune.microsoft.com/?l=en.en-us#view/Microsoft_Intune_DeviceSettings/DevicesMenu/~/configuration');
assert.strictEqual(portalUrl('https://portal.azure.com/?feature.x=1&l=fr.fr-fr#home', 'de', 'de-ch'),
  'https://portal.azure.com/?feature.x=1&l=de.de-ch#home');
assert.strictEqual(portalUrl('https://intune.microsoft.com/', 'fr', 'en-us'), 'https://intune.microsoft.com/?l=fr.en-us');

// Defender and Purview: ?mkt=<locale>; consoles without a language URL parameter are not portals here
assert.strictEqual(portalUrl('https://security.microsoft.com/homepage?tid=x', 'fr', 'fr-fr'), 'https://security.microsoft.com/homepage?tid=x&mkt=fr-fr');
assert.strictEqual(portalUrl('https://purview.microsoft.com/home?mkt=fr-fr', 'en', 'en-us'), 'https://purview.microsoft.com/home?mkt=en-us');
assert.strictEqual(portalUrl('https://security.microsoft.com/', 'en', 'fr-fr'), 'https://security.microsoft.com/?mkt=en');
for (const u of ['https://admin.cloud.microsoft/#/homepage', 'https://admin.teams.microsoft.com/', 'https://contoso-admin.sharepoint.com/'])
  assert.strictEqual(portalUrl(u, 'en', 'en-us'), null, u);
assert.strictEqual(portalUrl('https://example.com/', 'en', 'en-us'), null);
assert.strictEqual(portalUrl('https://intune.microsoft.com/', 'xx', 'en-us'), null);
assert.strictEqual(portalUrl('https://intune.microsoft.com/', 'en', 'en-xx'), null);
assert.ok(LANGUAGES.length === 24 && new Set(FORMATS).size === FORMATS.length);

console.log('portal-language: all checks passed');
//⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
