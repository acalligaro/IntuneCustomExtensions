// Run: node as-built/test.js⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
const assert = require('node:assert');
const L = require('./lib.js');

const G = '#microsoft.graph.deviceManagementConfiguration';

// Escaping
assert.strictEqual(L.mdEscapeCell('a|b\nc\\d <x>'), 'a\\|b<br>c\\\\d &lt;x>');
assert.strictEqual(L.mdEscapeCell(null), '');
assert.strictEqual(L.htmlEscape(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
assert.strictEqual(L.fmtDate('2025-03-14T09:12:00Z'), '14/03/2025');

// Settings Catalog fixture shaped like GET configurationPolicies/{id}/settings?$expand=settingDefinitions
const RT = 'device_vendor_msft_policy_config_defender_allowrealtimemonitoring';
const HP = 'device_vendor_msft_policy_config_microsoft_edge~policy~microsoft_edge~startup_homepagelocation';
const FW = 'vendor_msft_firewall_mdmstore_firewallrules_{firewallrulename}';
const settings = [
  { id: '0', settingInstance: { '@odata.type': `${G}ChoiceSettingInstance`, settingDefinitionId: RT,
      choiceSettingValue: { '@odata.type': `${G}ChoiceSettingValue`, value: `${RT}_1`, children: [] } },
    settingDefinitions: [{ '@odata.type': `${G}ChoiceSettingDefinition`, id: RT, displayName: 'Allow Realtime Monitoring', categoryId: 'cat-def',
      options: [{ itemId: `${RT}_0`, displayName: 'Not allowed' }, { itemId: `${RT}_1`, displayName: 'Allowed' }] }] },
  { id: '1', settingInstance: { '@odata.type': `${G}SimpleSettingInstance`, settingDefinitionId: 'device_vendor_msft_policy_config_defender_avgcpuloadfactor',
      simpleSettingValue: { '@odata.type': `${G}IntegerSettingValue`, value: 50 } },
    settingDefinitions: [{ id: 'device_vendor_msft_policy_config_defender_avgcpuloadfactor', displayName: 'Avg CPU Load Factor', categoryId: 'cat-def' }] },
  { id: '2', settingInstance: { '@odata.type': `${G}ChoiceSettingInstance`, settingDefinitionId: HP,
      choiceSettingValue: { value: `${HP}_1`, children: [
        { '@odata.type': `${G}SimpleSettingInstance`, settingDefinitionId: `${HP}_homepagelocation`,
          simpleSettingValue: { '@odata.type': `${G}StringSettingValue`, value: 'https://intranet.contoso.com' } }] } },
    settingDefinitions: [
      { id: HP, displayName: 'Configure the home page URL', categoryId: 'cat-edge-start', options: [{ itemId: `${HP}_0`, displayName: 'Disabled' }, { itemId: `${HP}_1`, displayName: 'Enabled' }] },
      { id: `${HP}_homepagelocation`, displayName: 'Home page URL (Device)', categoryId: 'cat-edge-start' }] },
  { id: '3', settingInstance: { '@odata.type': `${G}GroupSettingCollectionInstance`, settingDefinitionId: FW,
      groupSettingCollectionValue: [
        { children: [
          { '@odata.type': `${G}SimpleSettingInstance`, settingDefinitionId: `${FW}_name`, simpleSettingValue: { value: 'RDP | in' } },
          { '@odata.type': `${G}ChoiceSettingCollectionInstance`, settingDefinitionId: `${FW}_profiles`,
            choiceSettingCollectionValue: [{ value: `${FW}_profiles_1`, children: [] }, { value: `${FW}_profiles_2`, children: [] }] },
          { '@odata.type': `${G}SimpleSettingCollectionInstance`, settingDefinitionId: `${FW}_localportranges`,
            simpleSettingCollectionValue: [{ value: '3389' }, { value: '3390' }] }] },
        { children: [
          { '@odata.type': `${G}SimpleSettingInstance`, settingDefinitionId: `${FW}_name`, simpleSettingValue: { value: 'SMB' } }] }] },
    settingDefinitions: [
      { id: FW, displayName: 'Firewall Rules', categoryId: 'cat-fw' },
      { id: `${FW}_name`, displayName: 'Name', categoryId: 'cat-fw' },
      { id: `${FW}_profiles`, displayName: 'Network Types', categoryId: 'cat-fw', options: [{ itemId: `${FW}_profiles_1`, displayName: 'Domain' }, { itemId: `${FW}_profiles_2`, displayName: 'Private' }] },
      { id: `${FW}_localportranges`, displayName: 'Local Port Ranges', categoryId: 'cat-fw' }] },
  { id: '4', settingInstance: { '@odata.type': `${G}GroupSettingInstance`, settingDefinitionId: 'grp',
      groupSettingValue: { children: [{ '@odata.type': `${G}SimpleSettingInstance`, settingDefinitionId: 'secret',
        simpleSettingValue: { '@odata.type': `${G}SecretSettingValue`, value: 'xyz', valueState: 'encryptedValueToken' } }] } },
    settingDefinitions: [{ id: 'grp', displayName: 'Wi-Fi' }, { id: 'secret', displayName: 'Pre-shared key' }] },
  { id: '5', settingInstance: { '@odata.type': `${G}SomethingNewInstance`, settingDefinitionId: 'unknown_def' }, settingDefinitions: [] },
];
const categories = {
  'cat-def': { displayName: 'Defender', parentCategoryId: 'cat-def' },
  'cat-edge': { displayName: 'Microsoft Edge', parentCategoryId: 'cat-edge' },
  'cat-edge-start': { displayName: 'Startup, home page and new tab page', parentCategoryId: 'cat-edge' },
  'cat-fw': { displayName: 'Firewall', parentCategoryId: 'cat-fw' },
};
const defs = settings.flatMap(s => s.settingDefinitions);
assert.strictEqual(L.categoryPath('cat-edge-start', categories), 'Microsoft Edge > Startup, home page and new tab page');
assert.strictEqual(L.categoryPath('loop', { loop: { displayName: 'A', parentCategoryId: 'loop2' }, loop2: { displayName: 'B', parentCategoryId: 'loop' } }).split(' > ').length, 10);
assert.deepStrictEqual(L.settingRows(settings, defs, categories), [
  { path: 'Defender', name: 'Allow Realtime Monitoring', value: 'Allowed' },
  { path: 'Defender', name: 'Avg CPU Load Factor', value: '50' },
  { path: 'Microsoft Edge > Startup, home page and new tab page', name: 'Configure the home page URL', value: 'Enabled' },
  { path: 'Microsoft Edge > Startup, home page and new tab page > Configure the home page URL', name: 'Home page URL (Device)', value: 'https://intranet.contoso.com' },
  { path: 'Firewall > Firewall Rules [1]', name: 'Name', value: 'RDP | in' },
  { path: 'Firewall > Firewall Rules [1]', name: 'Network Types', value: 'Domain, Private' },
  { path: 'Firewall > Firewall Rules [1]', name: 'Local Port Ranges', value: '3389, 3390' },
  { path: 'Firewall > Firewall Rules [2]', name: 'Name', value: 'SMB' },
  { path: 'Wi-Fi', name: 'Pre-shared key', value: '(secret masqué)' },
  { path: '', name: 'unknown_def', value: '(type non pris en charge : SomethingNewInstance)' },
]);
// Unknown option and missing definitions fall back to raw ids
assert.deepStrictEqual(L.settingRows([{ '@odata.type': `${G}ChoiceSettingInstance`, settingDefinitionId: 'x', choiceSettingValue: { value: 'x_9' } }], []),
  [{ path: '', name: 'x', value: 'x_9' }]);

// Template properties⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
assert.deepStrictEqual(L.propertyRows({
  '@odata.type': '#microsoft.graph.windows10CompliancePolicy', id: 'p', displayName: 'n', version: 3,
  passwordRequired: true, passwordMinimumLength: 8, storageRequireEncryption: false, osMinimumVersion: null,
  passwordRequiredType: 'notConfigured', validOperatingSystemBuildRanges: [], deviceThreatProtectionRequiredSecurityLevel: 'medium',
  omaSettings: [{ '@odata.type': '#microsoft.graph.omaSettingString', displayName: 'Custom', omaUri: './Device/Vendor/MSFT/X', value: '<enabled/>' }],
  bluetoothAllowedServices: ['a', 'b'],
}), [
  { path: '', name: 'Password required', value: 'Oui' },
  { path: '', name: 'Password minimum length', value: '8' },
  { path: '', name: 'Storage require encryption', value: 'Non' },
  { path: '', name: 'Device threat protection required security level', value: 'medium' },
  { path: 'Oma settings [1]', name: 'Display name', value: 'Custom' },
  { path: 'Oma settings [1]', name: 'Oma uri', value: './Device/Vendor/MSFT/X' },
  { path: 'Oma settings [1]', name: 'Value', value: '<enabled/>' },
  { path: '', name: 'Bluetooth allowed services', value: 'a, b' },
]);

// ADMX
assert.deepStrictEqual(L.admxRows([
  { id: 'v1', enabled: true, definition: { displayName: 'Prevent access to registry editing tools', categoryPath: '\\System', classType: 'user' },
    presentationValues: [
      { '@odata.type': '#microsoft.graph.groupPolicyPresentationValueText', value: '1', presentation: { label: 'Disable regedit from running silently?' } },
      { '@odata.type': '#microsoft.graph.groupPolicyPresentationValueList', values: [{ name: 'k', value: 'v' }], presentation: { label: 'List' } },
      { '@odata.type': '#microsoft.graph.groupPolicyPresentationValueBoolean', value: false, presentation: { label: 'Flag' } }] },
  { id: 'v2', enabled: false, definition: { displayName: 'Turn off Autoplay', categoryPath: '\\Windows Components\\AutoPlay Policies', classType: 'machine' } },
]), [
  { path: '\\System (Utilisateur)', name: 'Prevent access to registry editing tools', value: 'Activé' },
  { path: '\\System (Utilisateur) > Prevent access to registry editing tools', name: 'Disable regedit from running silently?', value: '1' },
  { path: '\\System (Utilisateur) > Prevent access to registry editing tools', name: 'List', value: 'k = v' },
  { path: '\\System (Utilisateur) > Prevent access to registry editing tools', name: 'Flag', value: 'Non' },
  { path: '\\Windows Components\\AutoPlay Policies', name: 'Turn off Autoplay', value: 'Désactivé' },
]);

// Assignments
const asg = [
  { target: { '@odata.type': '#microsoft.graph.groupAssignmentTarget', groupId: 'g1', deviceAndAppManagementAssignmentFilterId: 'f1', deviceAndAppManagementAssignmentFilterType: 'include' } },
  { target: { '@odata.type': '#microsoft.graph.exclusionGroupAssignmentTarget', groupId: 'g2', deviceAndAppManagementAssignmentFilterType: 'none' } },
  { target: { '@odata.type': '#microsoft.graph.allDevicesAssignmentTarget', deviceAndAppManagementAssignmentFilterId: 'f2', deviceAndAppManagementAssignmentFilterType: 'exclude' } },
];
assert.deepStrictEqual(L.assignmentRows(asg, { g1: 'GRP-Postes-Pilote' }, { f1: 'Corporate only' }), [
  { group: 'GRP-Postes-Pilote', mode: 'Inclure', filter: 'Corporate only (inclure)' },
  { group: 'g2', mode: 'Exclure', filter: '' },
  { group: 'Tous les appareils', mode: 'Inclure', filter: 'f2 (exclure)' },
]);

// Summaries
assert.deepStrictEqual(L.policySummary('sc', { id: '1', name: 'SC', platforms: 'windows10', lastModifiedDateTime: 'd', templateReference: { templateDisplayName: 'Antivirus' } }),
  { kind: 'sc', id: '1', description: '', modified: 'd', name: 'SC', type: 'Catalogue de paramètres (modèle Antivirus)', platform: 'Windows' });
assert.strictEqual(L.policySummary('dc', { '@odata.type': '#microsoft.graph.iosGeneralDeviceConfiguration', displayName: 'x' }).platform, 'iOS/iPadOS');
assert.strictEqual(L.policySummary('comp', { '@odata.type': '#microsoft.graph.androidWorkProfileCompliancePolicy' }).type, 'Stratégie de conformité (androidWorkProfileCompliancePolicy)');
assert.strictEqual(L.policySummary('dc', { '@odata.type': '#microsoft.graph.aospDeviceOwnerDeviceRestrictionConfiguration' }).platform, 'Android (AOSP)');

// Documents⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
const pol = { name: 'WIN - Defender', type: 'Catalogue de paramètres', platform: 'Windows', description: 'Ligne 1\nLigne 2 | x', modified: '2025-03-14T09:12:00Z',
  settings: [{ path: 'Defender', name: 'Allow <Realtime>', value: 'Allowed' }], assignments: [] };
const md = L.toMarkdown([pol]);
assert.ok(md.startsWith("# Dossier d'architecture détaillée"));
assert.ok(md.includes('## WIN - Defender'));
assert.ok(md.includes('| Description | Ligne 1<br>Ligne 2 \\| x |'));
assert.ok(md.includes('| Date de modification | 14/03/2025 |'));
assert.ok(md.includes('| Defender > Allow &lt;Realtime> | Allowed |'));
assert.ok(md.includes('_Aucune affectation._'));
const doc = L.toWordHtml([{ ...pol, name: '<script>alert(1)</script>', assignments: [{ group: 'G & H', mode: 'Inclure', filter: '' }] }]);
assert.ok(doc.includes('xmlns:w="urn:schemas-microsoft-com:office:word"'));
assert.ok(!doc.includes('<script>'));
assert.ok(doc.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
assert.ok(doc.includes('<td>G &amp; H</td>'));
assert.ok(doc.includes('<td>Ligne 1<br>Ligne 2 | x</td>'));

// JSON backup
const T = '11111111-2222-3333-4444-555555555555';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
assert.strictEqual(L.jwtTid(`${b64({ alg: 'RS256' })}.${b64({ tid: T, aud: 'https://graph.microsoft.com' })}.sig`), T);
assert.strictEqual(L.jwtTid('garbage'), '');
assert.strictEqual(L.jwtTid(`x.${b64({ tid: 'not-a-guid' })}.y`), '');

const scRaw = { policy: { id: 'sc1', name: 'WIN - Wi-Fi', platforms: 'windows10', templateReference: { templateId: '', templateFamily: 'none' } },
  settings: [settings[4]],
  assignments: [asg[0]], filters: [{ id: 'f1', displayName: 'Corporate only', platform: 'windows10AndLater', rule: '(device.deviceOwnership -eq "Corporate")' }],
  groups: [{ id: 'g1', displayName: 'GRP-Postes-Pilote' }] };
const dcRaw = { policy: { '@odata.type': '#microsoft.graph.windows10CustomConfiguration', id: 'dc1', displayName: 'OMA',
  omaSettings: [{ '@odata.type': '#microsoft.graph.omaSettingString', omaUri: './x', value: 'cipher', isEncrypted: true },
    { '@odata.type': '#microsoft.graph.omaSettingInteger', omaUri: './y', value: 1, isEncrypted: false }] }, assignments: [], filters: [], groups: [] };
const admxRaw = { policy: { id: 'a1', displayName: 'ADMX' }, definitionValues: [{ id: 'v1', enabled: true, definition: { displayName: 'X' }, presentationValues: [] }], assignments: [], filters: [], groups: [] };
const json = L.toJson([
  { kind: 'sc', id: 'sc1', raw: scRaw }, { kind: 'dc', id: 'dc1', raw: dcRaw }, { kind: 'admx', id: 'a1', raw: admxRaw },
  { kind: 'comp', id: 'c1', name: 'Broken', raw: { error: 'Graph 403' } },
], { exportedAt: '2025-03-14T09:12:00.000Z', tenantId: T });
assert.strictEqual(json.tenantId, T);
assert.deepStrictEqual(json.policies.map(p => p.type), ['settingsCatalog', 'deviceConfiguration', 'groupPolicyConfiguration', 'compliancePolicy']);
const [sc, dc, ad, err] = json.policies;
assert.deepStrictEqual(sc.base, { templateId: '', templateFamily: 'none' });
assert.strictEqual(sc.settings[0].settingInstance.groupSettingValue.children[0].simpleSettingValue.value, '(secret masqué)');
assert.strictEqual(sc.settings[0].settingInstance.groupSettingValue.children[0].simpleSettingValue.valueState, 'encryptedValueToken');
assert.strictEqual(settings[4].settingInstance.groupSettingValue.children[0].simpleSettingValue.value, 'xyz'); // input untouched
assert.strictEqual(sc.filters[0].rule, '(device.deviceOwnership -eq "Corporate")');
assert.deepStrictEqual(sc.assignments, [asg[0]]);
assert.deepStrictEqual(sc.groups, [{ id: 'g1', displayName: 'GRP-Postes-Pilote' }]);
assert.ok(!('settings' in dc) && !('definitionValues' in dc));
assert.deepStrictEqual(dc.base, { '@odata.type': '#microsoft.graph.windows10CustomConfiguration' });
assert.deepStrictEqual(dc.policy.omaSettings.map(o => o.value), ['(secret masqué)', 1]);
assert.strictEqual(ad.base, null);
assert.strictEqual(ad.definitionValues.length, 1);
assert.deepStrictEqual(err, { type: 'compliancePolicy', id: 'c1', name: 'Broken', error: 'Graph 403' });
assert.ok(!('tenantId' in L.toJson([], { exportedAt: 'x' })));

console.log('as-built: all checks passed');

// File names
const used = new Set();
assert.strictEqual(L.fileName('WIN - a/b:c?', 'md', used), 'WIN - a_b_c_.md');
assert.strictEqual(L.fileName('win - A/B:C?', 'md', used), 'win - A_B_C_ (2).md');
assert.strictEqual(L.fileName('  ', 'json'), 'sans-nom.json');
assert.deepStrictEqual(L.platformsOf({ platform: 'Windows, macOS' }), ['Windows', 'macOS']);
assert.deepStrictEqual(L.platformsOf({}), []);

// Apps and scripts
const enc64 = s => Buffer.from(s, 'utf8').toString('base64');
assert.strictEqual(L.policySummary('app', { '@odata.type': '#microsoft.graph.win32LobApp', displayName: 'Chrome' }).platform, 'Windows');
assert.strictEqual(L.policySummary('app', { '@odata.type': '#microsoft.graph.managedIOSStoreApp', displayName: 'x' }).platform, 'iOS/iPadOS');
assert.deepStrictEqual(L.policySummary('rem', { id: 'r', displayName: 'Fix' }).platform, 'Windows');
assert.deepStrictEqual(L.scriptFiles('ps', { fileName: 'a.ps1', scriptContent: enc64('Write-Host é') }), [{ suffix: '', ext: 'ps1', text: 'Write-Host é' }]);
assert.deepStrictEqual(L.scriptFiles('rem', { detectionScriptContent: enc64('d'), remediationScriptContent: '' }).map(f => f.suffix), [' - detection']);
const app = { rules: [
  { '@odata.type': '#microsoft.graph.win32LobAppPowerShellScriptRule', ruleType: 'detection', scriptContent: enc64('det') },
  { '@odata.type': '#microsoft.graph.win32LobAppPowerShellScriptRule', ruleType: 'requirement', scriptContent: enc64('req') },
  { '@odata.type': '#microsoft.graph.win32LobAppFileSystemRule', ruleType: 'detection' }] };
assert.deepStrictEqual(L.scriptFiles('app', app).map(f => f.suffix + ':' + f.text), [' - detection:det', ' - requirement:req']);
assert.ok(L.propertyRows(app).some(r => r.value === '(script exporté dans un fichier séparé)'));
assert.ok(!JSON.stringify(L.propertyRows({ largeIcon: { value: 'x' } })).includes('x'));
console.log('as-built: apps/scripts checks passed');

assert.ok(/E3\/E5/.test(L.policySummary('rem', { id: 'r', displayName: 'Fix' }).license));
assert.ok(!L.policySummary('ps', { id: 'p', displayName: 'S' }).license);
console.log('as-built: remediation licence checks passed');

// English: the real page i18n (shared/i18n-page.js + i18n.js) with <html data-tenant-compass-lang="en">.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
globalThis.document = { documentElement: { dataset: { tenantCompassLang: 'en' } } };
require('../shared/i18n-page.js');
require('./i18n.js');
assert.strictEqual(L.policySummary('sc', { id: '1', name: 'SC', platforms: 'windows10', templateReference: { templateDisplayName: 'Antivirus' } }).type, 'Settings catalog (Antivirus template)');
assert.strictEqual(L.policySummary('comp', { id: '2', displayName: 'C', '@odata.type': '#microsoft.graph.windows10CompliancePolicy' }).type, 'Compliance policy (windows10CompliancePolicy)');
assert.deepStrictEqual(L.propertyRows({ passwordRequired: true, storageRequireEncryption: false }).map(r => r.value), ['Yes', 'No']);
assert.deepStrictEqual(L.assignmentRows([{ target: { '@odata.type': '#microsoft.graph.allDevicesAssignmentTarget', deviceAndAppManagementAssignmentFilterId: 'f', deviceAndAppManagementAssignmentFilterType: 'exclude' } }], {}, { f: 'F' })[0],
  { group: 'All devices', mode: 'Include', filter: 'F (exclude)' });
const mdEn = L.toMarkdown([{ ...pol, settings: [], assignments: [] }]);
assert.ok(mdEn.startsWith('# Detailed Design Document – Intune Policies'));
assert.ok(mdEn.includes('| Property | Value |') && mdEn.includes('### Settings') && mdEn.includes('_No settings configured._') && mdEn.includes('_No assignments._'));
assert.ok(L.toWordHtml([{ ...pol, settings: [], assignments: [] }]).includes('<h3>Assignments</h3>'));
document.documentElement.dataset.tenantCompassLang = 'fr';
assert.ok(L.toMarkdown([{ ...pol, settings: [], assignments: [] }]).includes('### Affectations'));
console.log('as-built: i18n checks passed');
