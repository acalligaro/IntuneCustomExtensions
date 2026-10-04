// Run with: node test.js⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
const assert = require('assert');
const { normalize, omaUri, lookup, licenseFor, buildDb, extractDefs } = require('./lib.js');

assert.strictEqual(normalize('  Allow  Archive-Scanning '), 'allow archive scanning');
assert.strictEqual(normalize('Périphérique : Activé!'), 'peripherique active');
assert.strictEqual(normalize(null), '');

assert.strictEqual(omaUri({ baseUri: './Device/Vendor/MSFT/Policy', offsetUri: '/Config/Defender/AllowArchiveScanning' }), './Device/Vendor/MSFT/Policy/Config/Defender/AllowArchiveScanning');
assert.strictEqual(omaUri({ baseUri: './Device/Vendor/MSFT/Policy/', offsetUri: 'Config/X' }), './Device/Vendor/MSFT/Policy/Config/X');
assert.strictEqual(omaUri({ baseUri: './Device/Vendor/MSFT/BitLocker' }), './Device/Vendor/MSFT/BitLocker');
assert.strictEqual(omaUri({}), null);

const db = buildDb([
  { id: 'a', displayName: 'Allow Archive Scanning', baseUri: 'b', offsetUri: 'o', applicability: { platform: 'windows10', windowsSkus: [] }, infoUrls: [], helpText: 'dropped' },
  { id: 'b', displayName: 'allow archive scanning' },
  { id: 'c', displayName: 'Allow Cortana' },
  { id: 'd', displayName: '' },
]);
assert.deepStrictEqual(Object.keys(db).sort(), ['allow archive scanning', 'allow cortana']);
assert.strictEqual(db['allow archive scanning'].length, 2);
assert.deepStrictEqual(db['allow archive scanning'][0], { id: 'a', displayName: 'Allow Archive Scanning', baseUri: 'b', offsetUri: 'o', applicability: { platform: 'windows10' } });

assert.deepStrictEqual(lookup(db, 'ALLOW archive scanning').map(e => e.id), ['a', 'b']);
assert.deepStrictEqual(lookup(db, 'Allow Cortana Specifies whether Cortana is allowed').map(e => e.id), ['c']);
assert.deepStrictEqual(lookup(db, 'Allow Cortanas'), []);
assert.deepStrictEqual(lookup(db, ''), []);
assert.deepStrictEqual(lookup(null, 'x'), []);

const rules = require('./data/overlay.json')._licenseRules;
assert.strictEqual(rules.verified.length, 10);
assert.deepStrictEqual(licenseFor({ id: 'device_vendor_msft_policy_config_deviceguard_lsacfgflags', license: 'Manuel' }, rules), { text: 'Manuel', source: 'overlay' });
const cg = licenseFor({ id: 'device_vendor_msft_policy_config_deviceguard_lsacfgflags', applicability: { platform: 'windows10', windowsSkus: ['windowsProfessional'] } }, rules);
assert.deepStrictEqual([cg.source, cg.feature, cg.text, cg.verified], ['rule', 'Credential Guard', 'Windows Enterprise E3/E5 ou Education A3/A5', rules.verified]);
assert.strictEqual(licenseFor({ id: 'x', baseUri: './Vendor/MSFT/AppLocker/', offsetUri: 'ApplicationLaunchRestrictions' }, rules).feature, 'AppLocker');
assert.strictEqual(licenseFor({ id: 'user_vendor_msft_policy_config_experience_allowthirdpartysuggestionsinwindowsspotlight' }, rules).source, 'default');
assert.deepStrictEqual(licenseFor({ id: 'device_vendor_msft_policy_config_foo', applicability: { platform: 'windows10', windowsSkus: ['windowsEnterprise', 'windowsEducation'] } }, rules),
  { text: 'Windows Enterprise E3/E5 ou Education A3/A5 (édition Pro non prise en charge)', source: 'skus', proBlocked: true });
assert.deepStrictEqual(licenseFor({ id: 'device_vendor_msft_policy_config_camera_allowcamera', applicability: { platform: 'windows10', windowsSkus: ['windowsProfessional', 'windowsEnterprise'] } }, rules),
  { text: 'Inclus : Windows Pro + Intune Plan 1', source: 'default' });
assert.strictEqual(licenseFor({ id: 'device_vendor_msft_policy_config_camera_allowcamera' }, null).text, 'Inclus : Windows Pro + Intune Plan 1');
assert.deepStrictEqual(licenseFor({ id: 'com.apple.mcx.filevault2_enable', applicability: { platform: 'macOS' } }, rules), { text: 'Inclus : Intune Plan 1', source: 'default' });

const graph = { value: [
  { id: 'p1', settingInstance: {}, settingDefinitions: [
    { '@odata.type': '#microsoft.graph.deviceManagementConfigurationChoiceSettingDefinition', id: 'x', displayName: 'Allow X', baseUri: './Device', offsetUri: '/X' },
    { '@odata.type': '#microsoft.graph.deviceManagementConfigurationChoiceSettingDefinition', id: 'x', displayName: 'Allow X' },
  ] },
  { responses: [{ body: { value: [{ id: 'y', displayName: 'Y', baseUri: '', offsetUri: 'Y' }] } }] },
  { id: 'z', displayName: 'Not a definition' },
] };
assert.deepStrictEqual(extractDefs(graph).map(d => d.id), ['x', 'y']);
assert.deepStrictEqual(extractDefs(null), []);

// Pro-blocked badge flag⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
{
  const rules = JSON.parse(require('fs').readFileSync(__dirname + '/data/overlay.json', 'utf8'))._licenseRules;
  assert.strictEqual(licenseFor({ id: 'device_vendor_msft_policy_config_deviceguard_lsacfgflags' }, rules).proBlocked, true);
  assert.strictEqual(licenseFor({ id: 'x', applicability: { platform: 'windows10', windowsSkus: ['windowsEnterprise'] } }, rules).proBlocked, true);
  assert.ok(!licenseFor({ id: 'device_vendor_msft_policy_config_defender_allowarchivescanning' }, rules).proBlocked);
}
// English licence texts through the in-page dictionary (lib default stays French, see above)⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
{
  globalThis.document = { documentElement: { dataset: { tenantCompassLang: 'en' } } };
  require('../shared/i18n-page.js');
  require('./i18n.js');
  const t = (k, fr) => { const s = __tenantCompassI18n.t(k); return s === k ? fr : s; };
  assert.strictEqual(licenseFor({ id: 'x', applicability: { platform: 'windows10', windowsSkus: ['windowsEnterprise'] } }, rules, t).text, 'Windows Enterprise E3/E5 or Education A3/A5 (Pro edition not supported)');
  assert.strictEqual(licenseFor({ id: 'device_vendor_msft_policy_config_camera_allowcamera' }, null, t).text, 'Included: Windows Pro + Intune Plan 1');
  assert.strictEqual(licenseFor({ id: 'device_vendor_msft_policy_config_deviceguard_lsacfgflags' }, rules, t).text, 'Windows Enterprise E3/E5 or Education A3/A5');
  assert.strictEqual(licenseFor({ id: 'x', license: 'Texte libre' }, rules, t).text, 'Texte libre');
}
console.log('ok');
