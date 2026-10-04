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
// OpenIntuneBaseline (oib.js + data/oib.json): exact settingDefinitionId match, values shown with the setting's option labels.
{
  const { oibFor, oibValue } = require('./oib.js');
  const oib = require('./data/oib.json');
  assert.ok(oib._meta.license === 'GPL-3.0' && oib._meta.commit && Object.keys(oib.settings).length > 1000, 'oib.json vide : lancer tools/build-oib.mjs');
  for (const [id, list] of Object.entries(oib.settings)) assert.ok(id && list.every(x => x.p && Array.isArray(x.v)), id);
  const id = 'device_vendor_msft_policy_config_defender_allowarchivescanning';
  const hits = oibFor({ id }, oib);
  assert.ok(hits.length && hits[0].p.includes('OIB'), 'OIB configure ' + id);
  assert.deepStrictEqual(oibFor({ id: 'nope' }, oib), []);
  assert.deepStrictEqual(oibFor(null, oib), []);
  assert.deepStrictEqual(oibFor({ id }, null), []);
  // Choice: portal option label (portal language), else itemId suffix; simple values as is
  const def = { id, options: [{ itemId: id + '_0', displayName: 'Non autorisé' }, { itemId: id + '_1', displayName: 'Autorisé' }] };
  assert.strictEqual(oibValue(id + '_1', def), 'Autorisé');
  assert.strictEqual(oibValue(id + '_1', { id }), '1');
  // Setting found by name (no options): label from the Learn allowed values, else the bare value
  const learn = { allowed: [{ value: '0', description: 'Bloquer.' }, { value: '1', description: 'Autoriser.', default: true }] };
  assert.strictEqual(oibValue(id + '_0', { id, learn }), 'Bloquer (0)');
  assert.strictEqual(oibValue(id + '_2', { id, learn }), '2');
  assert.strictEqual(oibValue(id + '_0', { id, learn: {} }), '0');
  assert.strictEqual(oibValue(15, def), '15');
  assert.strictEqual(oibValue('C:\\x', def), 'C:\\x');
}
console.log('ok');
