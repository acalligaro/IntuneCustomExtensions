// Run with: node test.js⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
const assert = require('assert');
const { normalize, omaUri, lookup, licenseFor, slim, buildDb, extractDefs, explain, learnTarget, learnGpo, overlayFor } = require('./lib.js');
const { text, parseCspPage, findDoc, learnUrl } = require('./csp.js');

assert.strictEqual(normalize('  Allow  Archive-Scanning '), 'allow archive scanning');
assert.strictEqual(normalize('Périphérique : Activé!'), 'peripherique active');
assert.strictEqual(normalize(null), '');

assert.strictEqual(omaUri({ baseUri: './Device/Vendor/MSFT/Policy', offsetUri: '/Config/Defender/AllowArchiveScanning' }), './Device/Vendor/MSFT/Policy/Config/Defender/AllowArchiveScanning');
assert.strictEqual(omaUri({ baseUri: './Device/Vendor/MSFT/Policy/', offsetUri: 'Config/X' }), './Device/Vendor/MSFT/Policy/Config/X');
assert.strictEqual(omaUri({ baseUri: './Device/Vendor/MSFT/BitLocker' }), './Device/Vendor/MSFT/BitLocker');
assert.strictEqual(omaUri({}), null);

const db = buildDb([
  { id: 'a', displayName: 'Allow Archive Scanning', baseUri: 'b', offsetUri: 'o', applicability: { platform: 'windows10', windowsSkus: [] }, infoUrls: [], helpText: 'kept', keywords: ['dropped'] },
  { id: 'b', displayName: 'allow archive scanning' },
  { id: 'c', displayName: 'Allow Cortana' },
  { id: 'd', displayName: '' },
]);
assert.deepStrictEqual(Object.keys(db).sort(), ['allow archive scanning', 'allow cortana']);
assert.strictEqual(db['allow archive scanning'].length, 2);
assert.deepStrictEqual(db['allow archive scanning'][0], { id: 'a', displayName: 'Allow Archive Scanning', baseUri: 'b', offsetUri: 'o', applicability: { platform: 'windows10' }, helpText: 'kept' });

assert.deepStrictEqual(lookup(db, 'ALLOW archive scanning').map(e => e.id), ['a', 'b']);
assert.deepStrictEqual(lookup(db, 'Allow Cortana Specifies whether Cortana is allowed').map(e => e.id), ['c']);
assert.deepStrictEqual(lookup(db, 'Allow Cortanas'), []);
assert.deepStrictEqual(lookup(db, ''), []);
assert.deepStrictEqual(lookup(null, 'x'), []);

const rules = require('../setting-inspector/data/overlay.json')._licenseRules;
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
  const rules = JSON.parse(require('fs').readFileSync(__dirname + '/../setting-inspector/data/overlay.json', 'utf8'))._licenseRules;
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
// Explanation material kept by slim() and arranged by explain()
{
  const s = slim({ id: 'c', displayName: 'C', description: ' Does C. ', helpText: 'does c', riskLevel: 'high', defaultOptionId: 'c_1',
    defaultValue: { value: { nested: 1 } },
    options: [{ itemId: 'c_0', displayName: 'Block', optionValue: { value: 0 } }, { itemId: 'c_1', displayName: 'Allow', description: 'Lets users do C', optionValue: { value: 1 } }, {}] });
  assert.deepStrictEqual(s, { id: 'c', displayName: 'C', description: 'Does C.', helpText: 'does c', riskLevel: 'high', defaultOptionId: 'c_1',
    options: [{ itemId: 'c_0', displayName: 'Block', description: undefined, value: 0 }, { itemId: 'c_1', displayName: 'Allow', description: 'Lets users do C', value: 1 }] });
  const x = explain(s, 'fr');
  assert.deepStrictEqual([x.description, x.help, x.default, x.risk, x.options.length, x.curated, x.empty], ['Does C.', null, 'Allow', 'high', 2, null, false]);
  assert.strictEqual(explain({ description: 'A', helpText: 'More detail' }, 'fr').help, 'More detail');
  assert.strictEqual(explain({ defaultValue: 0 }, 'fr').default, '0');
  const cur = { explain: { fr: { what: 'Fait X' }, en: { what: 'Does X' } } };
  assert.strictEqual(explain(cur, 'en').curated.what, 'Does X');
  assert.strictEqual(explain({ explain: { fr: { what: 'Fait X' } } }, 'en').curated.what, 'Fait X');
  assert.strictEqual(explain({}, 'fr').empty, true);
  assert.strictEqual(explain(null, 'fr').empty, true);
  assert.strictEqual(__tenantCompassI18n.t('settingsExplainer.values', { n: 3 }), 'Possible values (3)');
}
// Level 2: Learn page parsing (same markup as learn.microsoft.com CSP pages), page lookup, merge into explain()
{
  const html = `<h2 id="allowx">AllowX</h2>
<!-- AllowX-OmaUri-Begin --><pre><code class="lang-Device">./Device/Vendor/MSFT/Policy/Config/Area/AllowX</code></pre><!-- AllowX-OmaUri-End -->
<!-- AllowX-Description-Begin --><!-- Description-Source-ADMX --><p>Does X &amp; more.</p><ul><li><p>If you enable it, X.</p></li></ul><!-- AllowX-Description-End -->
<!-- AllowX-Editable-Begin --><!-- Add any additional information --><div class="NOTE"><p>Note</p><p>Ignored when tamper protection is on.</p></div><!-- AllowX-Editable-End -->
<!-- AllowX-DFProperties-Begin --><table><tbody><tr><td>Format</td><td><code>int</code></td></tr><tr><td>Default Value</td><td>1</td></tr></tbody></table><!-- AllowX-DFProperties-End -->
<!-- AllowX-AllowedValues-Begin --><table><thead><tr><th>Value</th><th>Description</th></tr></thead><tbody><tr><td>0</td><td>Off.</td></tr><tr><td>1 (Default)</td><td>On.</td></tr></tbody></table><!-- AllowX-AllowedValues-End -->
<!-- AllowX-GpMapping-Begin --><table><tbody><tr><td>Friendly Name</td><td>Allow X</td></tr><tr><td>Location</td><td>Computer Configuration</td></tr><tr><td>Path</td><td>Windows Components &gt; X</td></tr><tr><td>Registry Key Name</td><td>Software\\Policies\\X</td></tr><tr><td>Registry Value Name</td><td>AllowX</td></tr><tr><td>ADMX File Name</td><td>X.admx</td></tr></tbody></table><!-- AllowX-GpMapping-End -->
<h2 id="other">Other</h2><!-- Other-Description-Begin --><p>No OMA-URI: skipped.</p><!-- Other-Description-End -->`;
  const [e, ...rest] = parseCspPage(html);
  assert.strictEqual(rest.length, 0);
  assert.deepStrictEqual([e.anchor, e.uris, e.description, e.notes, e.format, e.default], ['allowx', ['./Device/Vendor/MSFT/Policy/Config/Area/AllowX'], 'Does X & more.\n• If you enable it, X.', 'Ignored when tamper protection is on.', 'int', '1']);
  assert.deepStrictEqual(e.allowed, [{ value: '0', description: 'Off.' }, { value: '1', description: 'On.', default: true }]);
  assert.deepStrictEqual(learnGpo(e.gp), { path: 'Computer Configuration > Windows Components > X', name: 'Allow X', admx: 'X.admx', registry: 'HKLM\\Software\\Policies\\X\\AllowX' });
  assert.strictEqual(findDoc([e], './device/vendor/msft/policy/config/area/allowx/', null), e);
  assert.strictEqual(findDoc([e], './Device/Other', 'allowx'), e);
  assert.strictEqual(findDoc([e], './Device/Other', 'nope'), null);
  assert.strictEqual(text('<p>a&nbsp;b &#39;c&#x27;</p>'), "a b 'c'");
  const [r] = parseCspPage(html.replace('<tr><td>Default Value</td><td>1</td></tr>', '<tr><td>Allowed Values</td><td>Range: <code>[1-365]</code></td></tr>'));
  assert.strictEqual(r.range, '[1-365]');
  // French Learn page: translated labels, "(par défaut)", "Gamme:", "Remarque", translated GPO table
  const fr = html.replace('<td>Default Value</td><td>1</td>', '<td>Valeur par défaut</td><td>1</td></tr><tr><td>Valeurs autorisées</td><td>Gamme: <code>[8-64]</code></td>')
    .replace('<td>1 (Default)</td>', '<td>1 (par défaut)</td>').replace('<p>Note</p>', '<p>Remarque</p>')
    .replace('<td>Friendly Name</td>', '<td>Nom convivial</td>').replace('<td>Path</td>', '<td>Chemin d&#39;accès</td>')
    .replace('<td>Registry Key Name</td>', '<td>Nom de la clé de Registre</td>').replace('<td>Registry Value Name</td>', '<td>Nom de la valeur de Registre</td>')
    .replace('<td>ADMX File Name</td>', '<td>Nom du fichier ADMX</td>');
  const [f] = parseCspPage(fr);
  assert.deepStrictEqual([f.default, f.range, f.notes, f.allowed[1]], ['1', '[8-64]', 'Ignored when tamper protection is on.', { value: '1', description: 'On.', default: true }]);
  assert.deepStrictEqual(learnGpo(f.gp), learnGpo(e.gp));

  assert.deepStrictEqual(learnTarget({ infoUrls: ['https://learn.microsoft.com/windows/client-management/mdm/policy-csp-defender#allowarchivescanning'] }), { slug: 'policy-csp-defender', anchor: 'allowarchivescanning' });
  assert.deepStrictEqual(learnTarget({ infoUrls: ['https://learn.microsoft.com/fr-fr/windows/client-management/mdm/laps-csp'] }), { slug: 'laps-csp', anchor: null });
  assert.deepStrictEqual(learnTarget({ baseUri: './User/Vendor/MSFT/Policy', offsetUri: '/Config/Camera/AllowCamera' }), { slug: 'policy-csp-camera', anchor: 'allowcamera' });
  assert.deepStrictEqual(learnTarget({ baseUri: './Device/Vendor/MSFT/BitLocker', offsetUri: '/RequireDeviceEncryption' }), { slug: 'bitlocker-csp', anchor: null });
  assert.strictEqual(learnTarget({ infoUrls: ['https://example.com/x'], baseUri: 'com.apple.x' }), null);
  assert.strictEqual(learnUrl('policy-csp-defender', 'fr'), 'https://learn.microsoft.com/fr-fr/windows/client-management/mdm/policy-csp-defender');
  assert.strictEqual(learnUrl('../evil', 'en'), null);
  assert.strictEqual(learnUrl('https://evil', 'en'), null);

  const L = { ...e, lang: 'fr', description: 'Fait X.' };
  const x = explain({ description: 'Does X (Graph).', learn: L }, 'fr');
  assert.deepStrictEqual([x.description, x.notes, x.default, x.options.map(o => o.itemId), x.range], ['Fait X.', 'Ignored when tamper protection is on.', '1', ['0', '1'], null]);
  assert.strictEqual(explain({ description: 'Does X (Graph).', learn: { ...L, lang: 'en' } }, 'fr').description, 'Does X (Graph).');
  const g = explain({ options: [{ itemId: 'a_1', displayName: 'On' }], defaultOptionId: 'a_1', learn: L }, 'en');
  assert.deepStrictEqual([g.options.length, g.default, g.description], [1, 'On', 'Fait X.']);
  assert.strictEqual(explain({ learn: { range: '[1-365]' } }, 'fr').range, '[1-365]');
  assert.strictEqual(explain({ learn: { notes: 'n' } }, 'fr').empty, false);
}
// Curated explanations (data/explain.json): known setting ids, both languages, all fields, https Learn sources.
{
  const ov = require('../setting-inspector/data/overlay.json');
  const ex = Object.entries(require('./data/explain.json'));
  for (const [k] of ex) assert.ok(ov[k], 'id inconnu de Setting Inspector : ' + k);
  assert.ok(ex.length >= 12);
  for (const [k, { explain: x }] of ex) for (const l of ['fr', 'en']) {
    const c = x[l];
    assert.ok(c && c.what && c.impact && c.recommendation && Array.isArray(c.pitfalls) && c.pitfalls.length, `${k} ${l}`);
    assert.ok(c.sources.length && c.sources.every(u => u.startsWith('https://learn.microsoft.com/')), `${k} ${l} sources`);
  }
}
// Variant ids of templates fall back to their base setting's overlay entry (at most 2 segments dropped).
{
  const ov = { a_b_age: { x: 1 }, a_b_age_aad: { x: 2 } };
  assert.strictEqual(overlayFor(ov, 'a_b_age_aad').x, 2);
  assert.strictEqual(overlayFor(ov, 'a_b_age_ad').x, 1);
  assert.strictEqual(overlayFor(ov, 'a_b_age_v2_ad').x, 1);
  assert.strictEqual(overlayFor(ov, 'a_b_age_x_y_z'), undefined);
  assert.strictEqual(overlayFor(ov, 'zzz'), undefined);
  assert.strictEqual(overlayFor(null, 'a'), undefined);
  assert.ok(overlayFor(require('./data/explain.json'), 'device_vendor_msft_laps_policies_passwordagedays_aad').explain);
}
console.log('ok');
