// Run: node change-snapshot/test.js⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
const assert = require('node:assert');
const L = require('./lib.js');
const { parsePolicyRef, isTrackedRead, stripVolatile, applyRead, applyWrite, jsonDiff, jwtClaims, formatValue, toCsv, isExpired, retentionDays } = L;

const G = 'https://graph.microsoft.com/beta/deviceManagement';
const ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

// ---------- parsePolicyRef ----------
assert.deepStrictEqual(parsePolicyRef(`${G}/configurationPolicies/${ID}`), { type: 'configurationPolicies', id: ID, sub: '' });
assert.deepStrictEqual(parsePolicyRef(`${G}/configurationPolicies('${ID}')`), { type: 'configurationPolicies', id: ID, sub: '' }); // portal key syntax
assert.deepStrictEqual(parsePolicyRef(`${G}/configurationPolicies/${ID}/settings?$expand=settingDefinitions&top=1000`),
  { type: 'configurationPolicies', id: ID, sub: 'settings' });
assert.deepStrictEqual(parsePolicyRef(`https://graph.microsoft.com/v1.0/deviceManagement/deviceCompliancePolicies/${ID}/microsoft.graph.assign`),
  { type: 'deviceCompliancePolicies', id: ID, sub: 'assign' });
assert.deepStrictEqual(parsePolicyRef(`${G}/groupPolicyConfigurations/${ID}/definitionValues/x1/presentationValues/`),
  { type: 'groupPolicyConfigurations', id: ID, sub: 'definitionValues/x1/presentationValues' });
assert.deepStrictEqual(parsePolicyRef(`https://graph.microsoft.com/beta/deviceAppManagement/iosManagedAppProtections/T_${ID}`),
  { type: 'iosManagedAppProtections', id: `T_${ID}`, sub: '' });
assert.deepStrictEqual(parsePolicyRef(`${G}/deviceConfigurations`), { type: 'deviceConfigurations', id: null, sub: '' });
for (const u of [
  `${G}/managedDevices/${ID}`,                                     // not a policy collection
  `${G}/deviceConfigurations/getIosAvailableUpdateVersions()`,      // function
  `${G}/deviceConfigurations/$count`,
  `${G}/deviceConfigurations/microsoft.graph.windows10GeneralConfiguration`, // cast
  `https://graph.microsoft.com/beta/$batch`,
  `https://evil.example/beta/deviceManagement/deviceConfigurations/${ID}`,
  `http://graph.microsoft.com/beta/deviceManagement/deviceConfigurations/${ID}`,
  'not a url', '',
]) assert.strictEqual(parsePolicyRef(u), null, u);

// ---------- isTrackedRead ----------
assert.ok(isTrackedRead(parsePolicyRef(`${G}/configurationPolicies/${ID}?$expand=settings`)));
assert.ok(isTrackedRead(parsePolicyRef(`${G}/configurationPolicies/${ID}/assignments`)));
assert.ok(isTrackedRead(parsePolicyRef(`${G}/groupPolicyConfigurations/${ID}/definitionValues/d1/presentationValues`)));
assert.ok(!isTrackedRead(parsePolicyRef(`${G}/deviceConfigurations/${ID}/deviceStatuses`)));
assert.ok(!isTrackedRead(parsePolicyRef(`${G}/deviceConfigurations`)));
assert.ok(!isTrackedRead(null));

// ---------- stripVolatile ----------
const raw = {
  '@odata.context': 'x', '@odata.type': '#microsoft.graph.windows10GeneralConfiguration', id: ID, displayName: 'P',
  lastModifiedDateTime: '2026-01-01', version: 7, settingCount: 2, 'assignments@odata.navigationLink': 'y',
  nested: [{ lastModifiedDateTime: 'z', keep: 1, 'definition@odata.bind': 'https://graph/def' }],
  settingDefinitions: [{ huge: true }],
  wifi: { preSharedKey: 'hunter2', passwordRequired: true, passwordRequiredType: 'alphanumeric', sharedSecret: '' },
  secret: { '@odata.type': '#microsoft.graph.deviceManagementConfigurationSecretSettingValue', value: 's3cr3t', valueState: 'notEncrypted' },
};
assert.deepStrictEqual(stripVolatile(raw), {
  '@odata.type': '#microsoft.graph.windows10GeneralConfiguration', id: ID, displayName: 'P',
  nested: [{ keep: 1, 'definition@odata.bind': 'https://graph/def' }],
  wifi: { preSharedKey: '[masqué]', passwordRequired: true, passwordRequiredType: 'alphanumeric', sharedSecret: '' },
  secret: { '@odata.type': '#microsoft.graph.deviceManagementConfigurationSecretSettingValue', value: '[masqué]', valueState: 'notEncrypted' },
});
assert.strictEqual(stripVolatile(null), null);
assert.strictEqual(stripVolatile(3), 3);
assert.strictEqual(raw.lastModifiedDateTime, '2026-01-01'); // input untouched

// ---------- applyRead ----------
const refOf = u => parsePolicyRef(`${G}/${u}`);
let snap = applyRead(undefined, refOf(`configurationPolicies/${ID}`), { id: ID, name: 'Base' });
snap = applyRead(snap, refOf(`configurationPolicies/${ID}/settings`), { value: [{ id: '0' }] }, `${G}/configurationPolicies/${ID}/settings`);
snap = applyRead(snap, refOf(`configurationPolicies/${ID}/settings`), { value: [{ id: '1' }] }, `${G}/configurationPolicies/${ID}/settings?$skiptoken=abc`);
assert.deepStrictEqual(snap, { id: ID, name: 'Base', settings: [{ id: '0' }, { id: '1' }] });
// A fresh (non-paged) read replaces the list
assert.deepStrictEqual(applyRead(snap, refOf(`configurationPolicies/${ID}/settings`), { value: [] }, 'u').settings, []);
assert.strictEqual(applyRead(snap, refOf(`configurationPolicies/${ID}/settings`), { nope: 1 }, 'u'), snap);
assert.strictEqual(applyRead(snap, refOf(`configurationPolicies/${ID}`), null), snap);
let gp = { definitionValues: [{ id: 'd1', enabled: true }, { id: 'd2' }] };
gp = applyRead(gp, refOf(`groupPolicyConfigurations/${ID}/definitionValues/d1/presentationValues`), { value: [{ id: 'p1', value: 5 }] });
assert.deepStrictEqual(gp.definitionValues, [{ id: 'd1', enabled: true, presentationValues: [{ id: 'p1', value: 5 }] }, { id: 'd2' }]);

// ---------- applyWrite ----------
const before = { id: ID, name: 'A', description: 'old', settings: [{ id: '0' }], assignments: [] };
assert.deepStrictEqual(applyWrite(before, refOf(`configurationPolicies/${ID}`), 'PATCH', { description: 'new' }),
  { ...before, description: 'new' });
assert.deepStrictEqual(applyWrite(before, refOf(`configurationPolicies/${ID}`), 'PUT', { name: 'A', settings: [] }).settings, []);
assert.strictEqual(applyWrite(before, refOf(`configurationPolicies/${ID}`), 'DELETE', null), null);
assert.deepStrictEqual(applyWrite(null, refOf('deviceConfigurations'), 'POST', { displayName: 'New' }), { displayName: 'New' });
assert.strictEqual(applyWrite(null, refOf('deviceConfigurations'), 'PATCH', {}), undefined);
const asg = [{ target: { '@odata.type': '#microsoft.graph.groupAssignmentTarget', groupId: 'g1' } }];
assert.deepStrictEqual(applyWrite(before, refOf(`configurationPolicies/${ID}/assign`), 'POST', { assignments: asg }).assignments, asg);
assert.deepStrictEqual(applyWrite({}, refOf(`deviceManagementScripts/${ID}/assign`), 'POST',
  { deviceManagementScriptGroupAssignments: [1], deviceManagementScriptAssignments: [2] }).assignments, [2]);
assert.deepStrictEqual(applyWrite({}, refOf(`deviceHealthScripts/${ID}/assign`), 'POST', { deviceHealthScriptAssignments: asg }).assignments, asg);
// Intents: only changed settings are sent, matched by definitionId
assert.deepStrictEqual(applyWrite({ settings: [{ definitionId: 'a', value: 1 }, { definitionId: 'b', value: 2 }] },
  refOf(`intents/${ID}/updateSettings`), 'POST', { settings: [{ definitionId: 'b', value: 3 }, { definitionId: 'c', value: 4 }] }).settings,
  [{ definitionId: 'a', value: 1 }, { definitionId: 'b', value: 3 }, { definitionId: 'c', value: 4 }]);
// ADMX: added / updated / deletedIds⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
assert.deepStrictEqual(applyWrite({ definitionValues: [{ id: 'd1', enabled: true }, { id: 'd2', enabled: true }] },
  refOf(`groupPolicyConfigurations/${ID}/updateDefinitionValues`), 'POST',
  { added: [{ enabled: true, 'definition@odata.bind': 'x' }], updated: [{ id: 'd1', enabled: false }], deletedIds: ['d2'] }).definitionValues,
  [{ id: 'd1', enabled: false }, { enabled: true, 'definition@odata.bind': 'x' }]);
// Item of a sub-collection
assert.deepStrictEqual(applyWrite({ settings: [{ id: 's1', v: 1 }] }, refOf(`configurationPolicies/${ID}/settings/s1`), 'PATCH', { v: 2 }).settings, [{ id: 's1', v: 2 }]);
assert.deepStrictEqual(applyWrite({ settings: [{ id: 's1', v: 1 }] }, refOf(`configurationPolicies/${ID}/settings/s2`), 'PATCH', { v: 2 }).settings, [{ id: 's1', v: 1 }, { id: 's2', v: 2 }]);
assert.deepStrictEqual(applyWrite({ settings: [{ id: 's1' }] }, refOf(`configurationPolicies/${ID}/settings/s1`), 'DELETE', null).settings, []);
assert.deepStrictEqual(applyWrite({ assignments: [{ id: 'a' }] }, refOf(`deviceCompliancePolicies/${ID}/assignments`), 'POST', { id: 'b' }).assignments, [{ id: 'a' }, { id: 'b' }]);
// Unknown action: recorded as a pseudo-field
assert.deepStrictEqual(applyWrite({ id: ID }, refOf(`deviceCompliancePolicies/${ID}/scheduleActionsForRules`), 'POST', { x: 1 }),
  { id: ID, scheduleActionsForRules: { x: 1 } });
assert.strictEqual(applyWrite({}, refOf(`deviceCompliancePolicies/${ID}/whatever`), 'DELETE', null), undefined);
assert.deepStrictEqual(before.settings, [{ id: '0' }]); // inputs untouched

// ---------- jsonDiff ----------
assert.deepStrictEqual(jsonDiff({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } }), []);
assert.deepStrictEqual(jsonDiff({ a: 1, b: { c: 2 }, d: 'x' }, { a: 2, b: { c: 2, e: true } }), [
  { path: 'a', op: 'change', from: 1, to: 2 },
  { path: 'b.e', op: 'add', to: true },
  { path: 'd', op: 'remove', from: 'x' },
]);
assert.deepStrictEqual(jsonDiff({ a: null }, { a: { b: 1 } }), [{ path: 'a', op: 'change', from: null, to: { b: 1 } }]);
assert.deepStrictEqual(jsonDiff({ a: [1] }, { a: { 0: 1 } }), [{ path: 'a', op: 'change', from: [1], to: { 0: 1 } }]);
// Primitive arrays: by index
assert.deepStrictEqual(jsonDiff({ t: ['a', 'b'] }, { t: ['a', 'c', 'd'] }), [
  { path: 't[1]', op: 'change', from: 'b', to: 'c' },
  { path: 't[2]', op: 'add', to: 'd' },
]);
// Settings Catalog: matched by settingDefinitionId, so a reordered list is not a change
const s = (def, v) => ({ id: String(v), settingInstance: { settingDefinitionId: def, choiceSettingValue: { value: `${def}_${v}` } } });
assert.deepStrictEqual(jsonDiff({ settings: [s('x', 0), s('y', 1)] }, { settings: [s('y', 1), s('x', 0)] }), []);
assert.deepStrictEqual(jsonDiff({ settings: [s('x', 0), s('y', 1)] }, { settings: [s('y', 1), s('z', 1)] }), [
  { path: 'settings[x]', op: 'remove', from: s('x', 0) },
  { path: 'settings[z]', op: 'add', to: s('z', 1) },
]);
assert.deepStrictEqual(jsonDiff({ settings: [s('x', 0)] }, { settings: [{ ...s('x', 1), id: '0' }] }), [
  { path: 'settings[x].settingInstance.choiceSettingValue.value', op: 'change', from: 'x_0', to: 'x_1' },
]);
// Assignments: matched by target group, an include -> exclude switch is a change of the target type
const t = (type, g) => ({ target: { '@odata.type': type, groupId: g } });
assert.deepStrictEqual(jsonDiff({ assignments: [t('#inc', 'g1'), t('#inc', 'g2')] }, { assignments: [t('#exc', 'g2')] }), [
  { path: 'assignments[g1]', op: 'remove', from: t('#inc', 'g1') },
  { path: 'assignments[g2].target.@odata.type', op: 'change', from: '#inc', to: '#exc' },
]);
// Missing or duplicate keys: falls back to index
assert.deepStrictEqual(jsonDiff({ v: [{ a: 1 }, { id: 'k' }] }, { v: [{ a: 2 }, { id: 'k' }] }), [{ path: 'v[0].a', op: 'change', from: 1, to: 2 }]);
assert.deepStrictEqual(jsonDiff({ v: [{ id: 'k', a: 1 }, { id: 'k', a: 2 }] }, { v: [{ id: 'k', a: 1 }] }), [{ path: 'v[1]', op: 'remove', from: { id: 'k', a: 2 } }]);
// Empty -> keyed list⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
assert.deepStrictEqual(jsonDiff({ v: [] }, { v: [{ id: 'k' }] }), [{ path: 'v[k]', op: 'add', to: { id: 'k' } }]);
// Creation / deletion seen as field-level adds / removes
assert.deepStrictEqual(jsonDiff({}, { name: 'N' }), [{ path: 'name', op: 'add', to: 'N' }]);
assert.deepStrictEqual(jsonDiff({ name: 'N' }, {}), [{ path: 'name', op: 'remove', from: 'N' }]);

// ---------- jwtClaims ----------
const b64url = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const tok = c => `${b64url({ alg: 'RS256' })}.${b64url(c)}.sig`;
assert.deepStrictEqual(jwtClaims('Bearer ' + tok({ upn: 'admin@contoso.com', tid: ID, oid: 'x' })), { upn: 'admin@contoso.com', tid: ID });
assert.deepStrictEqual(jwtClaims(tok({ unique_name: 'u@c.com', tid: ID })), { upn: 'u@c.com', tid: ID });
assert.deepStrictEqual(jwtClaims(tok({ preferred_username: 'p@c.com' })), { upn: 'p@c.com', tid: null });
assert.deepStrictEqual(jwtClaims(tok({ upn: 'élodie@contoso.fr', tid: 7 })), { upn: 'élodie@contoso.fr', tid: null }); // UTF-8, non-string tid
// Payload whose base64url uses '-' / '_' characters
const weird = { upn: '??>>~~', tid: ID };
assert.ok(/[-_]/.test(b64url(weird)));
assert.deepStrictEqual(jwtClaims(tok(weird)), weird);
for (const bad of [null, undefined, '', 'abc', 'a.b.c', 'a.!!!.c', `x.${Buffer.from('[1]').toString('base64')}.y`])
  assert.ok(jwtClaims(bad) === null || (jwtClaims(bad).upn === null && jwtClaims(bad).tid === null), String(bad));

// ---------- formatValue ----------
assert.strictEqual(formatValue(undefined), '∅');
assert.strictEqual(formatValue('a'), '"a"');
assert.strictEqual(formatValue({ a: 'x'.repeat(300) }).length, 201);

// ---------- toCsv ----------
const csv = toCsv([
  { ts: '2026-10-03T10:00:00.000Z', tenantId: ID, user: 'a@b.c', policyType: 'deviceConfigurations', policyId: ID, policyName: 'Wi-Fi; "Siège"',
    method: 'PATCH', url: 'u1\nu2', ticket: '', comment: '=HYPERLINK("x")', diff: [{ path: 'a', op: 'change', from: 1, to: 2 }] },
]);
const lines = csv.split('\r\n');
assert.strictEqual(lines[0], 'ts;tenantId;user;policyType;policyId;policyName;method;url;ticket;comment;diff;env');
assert.strictEqual(csv,
  'ts;tenantId;user;policyType;policyId;policyName;method;url;ticket;comment;diff;env\r\n' +
  `2026-10-03T10:00:00.000Z;${ID};a@b.c;deviceConfigurations;${ID};"Wi-Fi; ""Siège""";PATCH;"u1\nu2";;"'=HYPERLINK(""x"")";` +
  '"[{""path"":""a"",""op"":""change"",""from"":1,""to"":2}]";');
assert.strictEqual(toCsv([]), 'ts;tenantId;user;policyType;policyId;policyName;method;url;ticket;comment;diff;env');
assert.ok(toCsv([{ user: null, comment: '-1' }]).endsWith(";;;;;;;;;'-1;;"));

// ---------- isExpired (14 days) ----------
const NOW = Date.parse('2026-10-15T12:00:00Z');
assert.strictEqual(isExpired('2026-10-02T12:00:00Z', NOW), false); // 13 days
assert.strictEqual(isExpired('2026-10-01T11:59:59Z', NOW), true);  // just over 14 days
assert.strictEqual(isExpired('garbage', NOW), true);
assert.strictEqual(isExpired('2026-10-02T12:00:00Z', NOW, 7), true);   // 13 days, 7-day retention
assert.strictEqual(isExpired('2026-10-02T12:00:00Z', NOW, 30), false);
assert.strictEqual(retentionDays(0), 14);
assert.strictEqual(retentionDays('30'), 14); // only integers from the popup
assert.strictEqual(retentionDays(90), 90);

// OData key syntax used by the Intune portal.
assert.deepStrictEqual(L.parsePolicyRef("https://graph.microsoft.com/beta/deviceManagement/configurationPolicies('abc-1')"), { type: 'configurationPolicies', id: 'abc-1', sub: '' });
assert.deepStrictEqual(L.parsePolicyRef("https://graph.microsoft.com/beta/deviceManagement/configurationPolicies('abc-1')/settings?$expand=settingDefinitions"), { type: 'configurationPolicies', id: 'abc-1', sub: 'settings' });
assert.deepStrictEqual(L.parsePolicyRef("https://graph.microsoft.com/beta/deviceManagement/configurationPolicies(%27abc-1%27)/assign"), { type: 'configurationPolicies', id: 'abc-1', sub: 'assign' });

// $batch expansion.
const bx = L.expandBatch('https://graph.microsoft.com/beta/$batch',
  { requests: [
    { id: '1', method: 'put', url: "/deviceManagement/configurationPolicies('p1')", body: { name: 'N' } },
    { id: '2', method: 'GET', url: 'deviceManagement/configurationPolicies/p1/assignments' },
    { id: '3', method: 'GET', url: 'me' } ] },
  { responses: [{ id: '2', status: 200, body: { value: [] } }, { id: '1', status: 204 }] });
assert.deepStrictEqual(bx.map(o => [o.method, o.url, o.status]), [
  ['PUT', "https://graph.microsoft.com/beta/deviceManagement/configurationPolicies('p1')", 204],
  ['GET', 'https://graph.microsoft.com/beta/deviceManagement/configurationPolicies/p1/assignments', 200]]);
assert.deepStrictEqual(bx[0].reqBody, { name: 'N' });
assert.deepStrictEqual(L.expandBatch('https://evil.example/$batch', { requests: [{ id: '1', method: 'GET', url: 'x' }] }, { responses: [{ id: '1', status: 200 }] }), []);

// Assignment noise from the portal's /assign body is not a difference⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
{
  const T = { '@odata.type': '#microsoft.graph.allLicensedUsersAssignmentTarget', deviceAndAppManagementAssignmentFilterId: null };
  const before = { description: 'test9', assignments: [{ id: 'p_x', source: 'direct', sourceId: 'p', target: T }] };
  const after = { description: 'test10', assignments: [{ id: '', target: { '@odata.type': T['@odata.type'] } }] };
  assert.deepStrictEqual(L.jsonDiff(before, after).map(d => d.path), ['description']);
}
console.log('change-snapshot: all checks passed');
