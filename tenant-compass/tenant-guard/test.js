// Run: node tenant-guard/test.js⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
const assert = require('node:assert');
const { urlSignals, storageRealms, matchRule, isGuarded, mergeRules } = require('./lib.js');

const T1 = '11111111-2222-3333-4444-555555555555';
const T2 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const CLIENT = '99999999-8888-7777-6666-000000000000';

// URL signals
assert.deepStrictEqual(urlSignals(`https://security.microsoft.com/homepage?tid=${T1}`), [T1]);
assert.deepStrictEqual(urlSignals('https://portal.azure.com/#@contoso.onmicrosoft.com/resource/x'), ['contoso.onmicrosoft.com']);
assert.deepStrictEqual(urlSignals(`https://admin.microsoft.com/Partner/BeginClientSession.aspx?CTID=${T2}`), [T2]);
assert.deepStrictEqual(urlSignals('https://intune.microsoft.com/#home'), []);

// MSAL realms: one realm is used, several are ambiguous⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
const k1 = `oid.${T2}-login.windows.net-idtoken-${CLIENT}-${T1}-`;
const k2 = `oid.${T2}-login.windows.net-${T1}`;
const k3 = `oid.${T2}-login.windows.net-accesstoken-${CLIENT}-${T2}-scope`;
assert.deepStrictEqual(storageRealms([k1, k2, 'unrelated']), [T1]);
assert.deepStrictEqual(storageRealms([k1, k3]), []);
assert.deepStrictEqual(storageRealms([`oid.${T2}-login.windows.net-refreshtoken-${CLIENT}--`]), []);

// Rule matching: signal order is priority, terms are comma-separated and case-insensitive
const rules = [
  { match: 'fabrikam', label: 'FABRIKAM', prod: false },
  { match: ` Contoso.onmicrosoft.com , ${T1}`, label: 'CONTOSO PROD', prod: true },
];
assert.strictEqual(matchRule(['contoso.onmicrosoft.com'], rules).rule.label, 'CONTOSO PROD');
assert.strictEqual(matchRule([T1], rules).rule.label, 'CONTOSO PROD');
assert.strictEqual(matchRule(['Fabrikam Inc', T1], rules).rule.label, 'FABRIKAM');
assert.strictEqual(matchRule(['other'], rules), null);
assert.strictEqual(matchRule(['x'], [{ match: ' , ', label: 'empty' }]), null);

// Guarded buttons⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
for (const t of ['Save', 'Enregistrer', 'Review + save', 'Vérifier + créer', 'Supprimer', 'Delete', 'Assign', 'Créer', 'Wipe', '  Retire  '])
  assert.ok(isGuarded(t), t);
for (const t of ['Saved views', 'Cancel', 'Annuler', 'Créerx', 'Add filter', 'Refresh', ''])
  assert.ok(!isGuarded(t), t);

// Import merge
const cur = [{ match: 'contoso.com', label: 'OLD', color: '#000000', prod: false }, { match: 'fabrikam.com', label: 'F', color: '#111111', prod: true }];
const m = mergeRules(cur, { rules: [{ match: 'CONTOSO.com', label: 'NEW', color: 'red' }, { match: '' }, null, { match: 'x.com', prod: false }] });
assert.strictEqual(m.imported, 2);
assert.deepStrictEqual(m.rules.map(r => r.label), ['NEW', 'F', '']);
assert.strictEqual(m.rules[0].color, '#d13438');
assert.strictEqual(m.rules[0].prod, true);
assert.strictEqual(m.rules[2].prod, false);
// Export -> import round trip keeps label, color, PROD and "My colors".⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
const exported = JSON.parse(JSON.stringify({ app: 'tenant-guard', rules: cur, customColors: ['#ABCDEF', '#123456'] }));
const rt = mergeRules([], exported, ['#123456', '#000001'], 5);
assert.deepStrictEqual(rt.rules, cur);
assert.deepStrictEqual(rt.customColors, ['#123456', '#000001', '#abcdef']);
assert.deepStrictEqual(mergeRules([], { rules: cur, customColors: ['nope', '#aaaaaa'] }, ['#1', '#b', '#c', '#d', '#e', '#f'].map(x => x.padEnd(7, '0')), 5).customColors.length, 5);
assert.deepStrictEqual(mergeRules([], { rules: cur }).customColors, []); // older exports: no customColors key
assert.throws(() => mergeRules(cur, { foo: 1 }));
assert.throws(() => mergeRules(cur, []));

// shared/i18n-page-isolated.js must stay a byte-for-byte copy of shared/i18n-page.js (one path per world, see background.js).
{
  const fs = require('fs'), p = require('path').join(__dirname, '..', 'shared');
  assert.strictEqual(fs.readFileSync(p + '/i18n-page-isolated.js', 'utf8'), fs.readFileSync(p + '/i18n-page.js', 'utf8'), 'i18n-page-isolated.js differs from i18n-page.js');
}
// No content-script file may be listed for both worlds: Chrome injects a file once per frame, in the first world only.
{
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8').replace(/^importScripts.*$/m, '');
  let reg;
  const noop = { addListener() {} };
  globalThis.chrome = { runtime: { getManifest: () => require('../manifest.json'), onInstalled: noop, onStartup: noop },
    storage: { onChanged: noop, sync: { get: async d => d } }, action: { setBadgeText() {} },
    scripting: { getRegisteredContentScripts: async () => [], unregisterContentScripts: async () => {}, registerContentScripts: async w => { reg = w; } } };
  new Function(src + ';return apply')()().then(() => {
    const worlds = {};
    for (const s of reg) for (const f of s.js) (worlds[f] = worlds[f] || new Set()).add(s.world || 'ISOLATED');
    const both = Object.keys(worlds).filter(f => worlds[f].size > 1);
    assert.deepStrictEqual(both, [], 'files registered in both worlds: ' + both);
    assert.ok(!reg.some(s => s.matches.some(m => m.includes('learn.microsoft.com'))), 'nothing injected on learn.microsoft.com');
    console.log('tenant-guard: all checks passed');
  }).catch(e => { console.error(e); process.exit(1); });
}
