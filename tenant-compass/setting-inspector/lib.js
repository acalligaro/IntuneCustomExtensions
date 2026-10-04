// Pure helpers shared by the content script, tools/build-db.mjs and test.js.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣

// Case, accents, punctuation and whitespace insensitive key.
function normalize(name) {
  return String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// OMA-URI = baseUri + offsetUri, joined by exactly one slash.
function omaUri(def) {
  const base = (def && def.baseUri) || '';
  const off = (def && def.offsetUri) || '';
  if (!base && !off) return null;
  if (!base || !off) return base || off;
  return base.replace(/\/+$/, '') + '/' + off.replace(/^\/+/, '');
}

// Exact normalized match first, else the longest key the text starts with (row text often has extra words after the name).⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
// ponytail: linear scan over keys on fallback, fine for ~20k keys behind a hover debounce; build a trie if it gets slow.
function lookup(db, text) {
  const n = normalize(text);
  if (!n || !db) return [];
  if (db[n]) return db[n];
  let best = '';
  for (const k of Object.keys(db)) {
    if (k.length > best.length && k.length >= 8 && n.startsWith(k + ' ')) best = k;
  }
  return best ? db[best] : [];
}

// Licence needed for a setting: overlay override > first matching rule (id or OMA-URI substring) > windowsSkus without Pro > default.
// rules = overlay._licenseRules ({ verified, source, rules: [{ feature, match: [...], license }] }).
// t(key, french) translates; default keeps French. Data texts (overlay) use key 'settingInspector.lic.<French text>'.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
function licenseFor(def, rules, t = (k, fr) => fr) {
  const d = def || {};
  const data = s => t('settingInspector.lic.' + s, s);
  if (d.license) return { text: data(d.license), source: 'overlay' };
  const hay = [d.id, omaUri(d)].filter(Boolean).join(' ').toLowerCase();
  for (const r of (rules && rules.rules) || []) {
    if (hay && r.match.some(m => hay.includes(m.toLowerCase()))) return { text: data(r.license), source: 'rule', feature: r.feature, verified: rules.verified, proBlocked: !!r.proBlocked };
  }
  const a = d.applicability || {};
  const win = /windows/i.test(a.platform || '') || (!a.platform && /vendor[_/]msft/.test(hay));
  const skus = a.windowsSkus || [];
  if (win && skus.length && !skus.includes('windowsProfessional') && (skus.includes('windowsEnterprise') || skus.includes('windowsEducation'))) {
    return { text: t('settingInspector.license.skus', 'Windows Enterprise E3/E5 ou Education A3/A5 (édition Pro non prise en charge)'), source: 'skus', proBlocked: true };
  }
  return { text: win ? t('settingInspector.license.windows', 'Inclus : Windows Pro + Intune Plan 1') : t('settingInspector.license.default', 'Inclus : Intune Plan 1'), source: 'default' };
}

// Keeps only what the tooltip needs from a Graph setting definition.
function slim(d) {
  const a = d.applicability || {};
  const app = {};
  for (const k of ['platform', 'technologies', 'minimumSupportedVersion', 'maximumSupportedVersion', 'windowsSkus']) {
    if (a[k] != null && a[k] !== '' && !(Array.isArray(a[k]) && !a[k].length)) app[k] = a[k];
  }
  const out = { id: d.id, displayName: d.displayName };
  if (d.baseUri) out.baseUri = d.baseUri;
  if (d.offsetUri) out.offsetUri = d.offsetUri;
  if (Object.keys(app).length) out.applicability = app;
  if (d.infoUrls && d.infoUrls.length) out.infoUrls = d.infoUrls;
  return out;
}

// Graph definitions -> { normalizedDisplayName: [slim defs] } (several settings share a display name).
function buildDb(defs) {
  const db = {};
  for (const d of defs) {
    const k = normalize(d.displayName);
    if (!k) continue;
    (db[k] = db[k] || []).push(slim(d));
  }
  return db;
}

// Setting definitions found anywhere in a Graph response (list, $expand=settingDefinitions, $batch bodies).⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
function extractDefs(json) {
  const out = [];
  const seen = new Set();
  (function walk(v, depth) {
    if (!v || typeof v !== 'object' || depth > 8) return;
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    const isDef = /SettingDefinition$/i.test(v['@odata.type'] || '') || (typeof v.offsetUri === 'string' && 'baseUri' in v);
    if (isDef && typeof v.id === 'string' && typeof v.displayName === 'string' && !seen.has(v.id)) {
      seen.add(v.id);
      out.push(slim(v));
    }
    for (const k in v) if (v[k] && typeof v[k] === 'object') walk(v[k], depth + 1);
  })(json, 0);
  return out;
}

if (typeof module !== 'undefined') module.exports = { normalize, omaUri, lookup, licenseFor, slim, buildDb, extractDefs };
