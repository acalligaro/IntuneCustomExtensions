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
// t(key, french) translates; default keeps French. Data texts (overlay) use key 'settingsExplainer.lic.<French text>'.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
function licenseFor(def, rules, t = (k, fr) => fr) {
  const d = def || {};
  const data = s => t('settingsExplainer.lic.' + s, s);
  if (d.license) return { text: data(d.license), source: 'overlay' };
  const hay = [d.id, omaUri(d)].filter(Boolean).join(' ').toLowerCase();
  for (const r of (rules && rules.rules) || []) {
    if (hay && r.match.some(m => hay.includes(m.toLowerCase()))) return { text: data(r.license), source: 'rule', feature: r.feature, verified: rules.verified, proBlocked: !!r.proBlocked };
  }
  const a = d.applicability || {};
  const win = /windows/i.test(a.platform || '') || (!a.platform && /vendor[_/]msft/.test(hay));
  const skus = a.windowsSkus || [];
  if (win && skus.length && !skus.includes('windowsProfessional') && (skus.includes('windowsEnterprise') || skus.includes('windowsEducation'))) {
    return { text: t('settingsExplainer.license.skus', 'Windows Enterprise E3/E5 ou Education A3/A5 (édition Pro non prise en charge)'), source: 'skus', proBlocked: true };
  }
  return { text: win ? t('settingsExplainer.license.windows', 'Inclus : Windows Pro + Intune Plan 1') : t('settingsExplainer.license.default', 'Inclus : Intune Plan 1'), source: 'default' };
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
  // Explanation material (Settings Explainer): Microsoft's own texts, choice values and default.
  for (const k of ['description', 'helpText', 'riskLevel', 'defaultOptionId']) if (typeof d[k] === 'string' && d[k].trim()) out[k] = d[k].trim();
  const prim = v => (v != null && typeof v !== 'object' ? v : undefined);
  const dv = prim(d.defaultValue && d.defaultValue.value);
  if (dv !== undefined) out.defaultValue = dv;
  const opts = (Array.isArray(d.options) ? d.options : []).filter(o => o && o.itemId)
    .map(o => ({ itemId: o.itemId, displayName: o.displayName || o.name || o.itemId, description: o.description || undefined, value: prim(o.optionValue && o.optionValue.value) }));
  if (opts.length) out.options = opts;
  return out;
}

// Overlay entry of a setting. Templates use variant ids (`..._passwordagedays_aad`): when the exact id has no entry,
// up to 2 trailing `_segment`s are dropped, so the variant gets its base setting's licence, GPO and explanation.
function overlayFor(overlay, id) {
  let k = String(id || '');
  for (let i = 0; i <= 2 && k; i++, k = k.includes('_') ? k.replace(/_[^_]*$/, '') : '') if (overlay && overlay[k]) return overlay[k];
  return undefined;
}

// Learn CSP page of a setting: from its infoUrls, else derived from the OMA-URI (Policy CSP area -> policy-csp-<area>).
function learnTarget(def) {
  const d = def || {};
  for (const u of d.infoUrls || []) {
    const m = /^https:\/\/learn\.microsoft\.com\/(?:[a-z]{2}-[a-z]{2}\/)?windows\/client-management\/mdm\/([\w-]+)(?:#([\w-]+))?/i.exec(u);
    if (m) return { slug: m[1].toLowerCase(), anchor: m[2] ? m[2].toLowerCase() : null };
  }
  const uri = omaUri(d) || '';
  let m = /^\.\/(?:device|user)\/vendor\/msft\/policy\/(?:config|result)\/([^/]+)\/([^/]+)/i.exec(uri);
  if (m) return { slug: 'policy-csp-' + m[1].toLowerCase(), anchor: m[2].toLowerCase() };
  m = /^\.\/(?:device\/|user\/)?vendor\/msft\/([a-z0-9]+)/i.exec(uri);
  return m ? { slug: m[1].toLowerCase() + '-csp', anchor: null } : null;
}

// Learn "Group policy mapping" table -> the card's GPO row shape (same as overlay `gpo`).
function learnGpo(gp) {
  if (!gp || !(gp['Friendly Name'] || gp.Name)) return null;
  const key = gp['Registry Key Name'], val = gp['Registry Value Name'];
  return { path: [gp.Location, gp.Path].filter(Boolean).join(' > '), name: gp['Friendly Name'] || gp.Name, admx: gp['ADMX File Name'],
    registry: key ? (/^HK/i.test(key) ? key : 'HKLM\\' + key) + (val ? '\\' + val : '') : undefined };
}

// What the "Explanation" section shows. Curated text (overlay `explain`, per language) comes first;
// Microsoft's description and help text follow, the help text only when it adds something.
function explain(def, lang) {
  const d = def || {};
  const x = d.explain || {};
  const L = d.learn || {};
  // Learn page in the portal language (French when available) beats Graph's English description.
  const desc = (lang === 'fr' && L.lang === 'fr' && L.description) || d.description || L.description || null;
  const help = d.helpText && (!desc || !normalize(desc).includes(normalize(d.helpText))) ? d.helpText : null;
  const opts = d.options && d.options.length ? d.options
    : (L.allowed || []).map(a => ({ itemId: a.value, displayName: a.value, description: a.description, ...(a.default ? { isDefault: true } : {}) }));
  const def0 = opts.find(o => o.itemId === d.defaultOptionId) || (!d.options && opts.find(o => o.isDefault));
  const out = {
    curated: x[lang] || x.fr || x.en || null,
    description: desc,
    help,
    default: def0 ? def0.displayName : (d.defaultValue !== undefined ? String(d.defaultValue) : (L.default || null)),
    notes: L.notes || null,
    range: !opts.length && L.range ? L.range : null,
    options: opts,
    risk: d.riskLevel || null,
  };
  out.empty = !out.curated && !desc && !help && out.default === null && !opts.length && !out.notes && !out.range;
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

if (typeof module !== 'undefined') module.exports = { normalize, omaUri, lookup, licenseFor, slim, buildDb, extractDefs, explain, learnTarget, learnGpo, overlayFor };
