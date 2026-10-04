// Run: node assignment-lens/test.js⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
const assert = require('node:assert');
const { parsePolicyRef, parseHashRef, graphTokenIn, summarizeAssignments, findOverlaps } = require('./lib.js');

const P = '11111111-2222-3333-4444-555555555555';
const G1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const G2 = 'aaaaaaaa-0000-0000-0000-000000000002';
const F1 = 'ffffffff-0000-0000-0000-000000000001';
const G = 'https://graph.microsoft.com';

// parsePolicyRef
assert.deepStrictEqual(parsePolicyRef(`${G}/beta/deviceManagement/configurationPolicies('${P}')/settings?$expand=x`), { family: 'configurationPolicies', id: P });
assert.deepStrictEqual(parsePolicyRef(`${G}/beta/deviceManagement/deviceConfigurations/${P}`), { family: 'deviceConfigurations', id: P });
assert.deepStrictEqual(parsePolicyRef(`${G}/v1.0/deviceManagement/deviceCompliancePolicies/${P}/assignments`), { family: 'deviceCompliancePolicies', id: P });
assert.deepStrictEqual(parsePolicyRef(`${G}/beta/deviceAppManagement/mobileApps/${P.toUpperCase()}?$expand=categories`), { family: 'mobileApps', id: P });
assert.deepStrictEqual(parsePolicyRef(`${G}/beta/deviceManagement/groupPolicyConfigurations%28%27${P}%27%29`), { family: 'groupPolicyConfigurations', id: P });
assert.deepStrictEqual(parsePolicyRef(`/deviceManagement/deviceConfigurations/${P}/assignments`), { family: 'deviceConfigurations', id: P }); // $batch body
assert.strictEqual(parsePolicyRef(`${G}/beta/deviceManagement/configurationPolicies?$top=100`), null);
assert.strictEqual(parsePolicyRef(`${G}/beta/deviceManagement/managedDevices/${P}`), null);
assert.strictEqual(parsePolicyRef(`https://evil.example/beta/deviceManagement/deviceConfigurations/${P}`), null);
assert.strictEqual(parsePolicyRef(`${G}/beta/deviceManagement/deviceConfigurations/${P}x`), null);
assert.strictEqual(parsePolicyRef(undefined), null);

// parseHashRef⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
assert.deepStrictEqual(parseHashRef(`#view/Microsoft_Intune_Workflows/PolicySummaryBlade/policyId/${P.toUpperCase()}/isAssigned~/true`), { family: null, id: P });
assert.deepStrictEqual(parseHashRef(`#view/Microsoft_Intune_Apps/SettingsMenu/~/0/appId/${P}`), { family: 'mobileApps', id: P });
assert.strictEqual(parseHashRef('#view/Microsoft_Intune_DeviceSettings/DevicesMenu/~/configuration'), null);
assert.strictEqual(parseHashRef(`#view/x/policyId/${P}x`), null);
// enrollment: Autopilot profile, ESP (id with a suffix, kept as is), MDM blade appId ignored
assert.deepStrictEqual(parseHashRef(`#view/Microsoft_Intune_Enrollment/AutopilotMenuBlade/~/overview/apProfileId/${P}`), { family: 'windowsAutopilotDeploymentProfiles', id: P });
assert.deepStrictEqual(parseHashRef(`#view/Microsoft_Intune_Enrollment/EnrollmentStatusPageMenuBlade/~/overview/profileId/${P.toUpperCase()}_DefaultWindows10EnrollmentCompletionPageConfiguration`),
  { family: 'deviceEnrollmentConfigurations', id: `${P}_DefaultWindows10EnrollmentCompletionPageConfiguration` });
assert.strictEqual(parseHashRef('#view/Microsoft_AAD_IAM/MdmApplication/appId/0000000a-0000-0000-c000-000000000000/appName/Microsoft Intune'), null);
assert.deepStrictEqual(parsePolicyRef(`https://graph.microsoft.com/beta/deviceManagement/deviceEnrollmentConfigurations/${P}_Windows10EnrollmentCompletionPageConfiguration/assignments`),
  { family: 'deviceEnrollmentConfigurations', id: `${P}_Windows10EnrollmentCompletionPageConfiguration` });

// graphTokenIn⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = claims => `${b64({ typ: 'JWT' })}.${b64(claims)}.sig`;
const future = Math.floor(Date.now() / 1000) + 3600;
const graphJwt = jwt({ aud: 'https://graph.microsoft.com', exp: future });
assert.strictEqual(graphTokenIn({ kind: 1, data: [{ token: graphJwt }] }), 'Bearer ' + graphJwt);
assert.strictEqual(graphTokenIn({ h: 'Bearer ' + graphJwt }), 'Bearer ' + graphJwt);
assert.strictEqual(graphTokenIn({ token: jwt({ aud: 'https://management.core.windows.net/', exp: future }) }), null);
assert.strictEqual(graphTokenIn({ token: jwt({ aud: 'https://graph.microsoft.com/', exp: 1 }) }), null); // expired
assert.strictEqual(graphTokenIn({ s: 'eyJnot a token' }), null);
assert.strictEqual(graphTokenIn(new Uint8Array(10)), null);

// summarizeAssignments
const t = (type, extra = {}) => ({ target: { '@odata.type': '#microsoft.graph.' + type, ...extra } });
const s = summarizeAssignments([
  t('groupAssignmentTarget', { groupId: G1, deviceAndAppManagementAssignmentFilterId: F1, deviceAndAppManagementAssignmentFilterType: 'include' }),
  t('exclusionGroupAssignmentTarget', { groupId: G2, deviceAndAppManagementAssignmentFilterType: 'none' }),
  t('allDevicesAssignmentTarget', { deviceAndAppManagementAssignmentFilterId: F1, deviceAndAppManagementAssignmentFilterType: 'exclude' }),
  t('configurationManagerCollectionAssignmentTarget', { collectionId: 'SMS00001' }),
  { intent: 'required', ...t('groupAssignmentTarget', { groupId: G2, deviceAndAppManagementAssignmentFilterId: '00000000-0000-0000-0000-000000000000', deviceAndAppManagementAssignmentFilterType: 'include' }) },
]);
assert.deepStrictEqual(s, {
  include: [{ groupId: G1 }, { groupId: G2, intent: 'required' }],
  exclude: [{ groupId: G2 }],
  allUsers: false,
  allDevices: true,
  filters: [{ target: G1, id: F1, mode: 'include' }, { target: 'allDevices', id: F1, mode: 'exclude' }],
});
assert.deepStrictEqual(summarizeAssignments(undefined), { include: [], exclude: [], allUsers: false, allDevices: false, filters: [] });
assert.strictEqual(summarizeAssignments([t('allLicensedUsersAssignmentTarget')]).allUsers, true);

// findOverlaps⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
const others = [
  { name: 'Catalogue A', assignments: [t('groupAssignmentTarget', { groupId: G1 }), t('allLicensedUsersAssignmentTarget')] },
  { displayName: 'Profil B', assignments: [t('exclusionGroupAssignmentTarget', { groupId: G1 }), t('groupAssignmentTarget', { groupId: G2 })] },
  { displayName: 'Sans affectation' },
];
assert.deepStrictEqual(findOverlaps([G1, 'allUsers'], others), [
  { policyName: 'Catalogue A', groupId: G1, mode: 'include' },
  { policyName: 'Catalogue A', groupId: 'allUsers', mode: 'include' },
  { policyName: 'Profil B', groupId: G1, mode: 'exclude' },
]);
assert.deepStrictEqual(findOverlaps([], others), []);

console.log('assignment-lens: all checks passed');
