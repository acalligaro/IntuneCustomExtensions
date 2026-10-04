// Pure helpers shared by the content script, the popup and test.js.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣

const GUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

// Tenant hints carried by the URL: ?tid=, ?tenantId=, ?ctid= (GDAP) and Azure-style "#@contoso.onmicrosoft.com".
function urlSignals(href) {
  let u;
  try { u = decodeURIComponent(href); } catch { u = href; }
  const out = [];
  for (const m of u.matchAll(/[?&#/](?:tid|tenantid|tenant|ctid)=([^&#/?]+)/gi)) out.push(m[1]);
  for (const m of u.matchAll(/#@([\w.-]+\.[a-z]{2,})/gi)) out.push(m[1]);
  return out;
}

// MSAL.js cache keys embed the realm (tenant ID): "<oid.tid>-login.windows.net-[idtoken-<clientId>-]<realm>".
// Several cached realms means we cannot tell which one is displayed, so return nothing.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
function storageRealms(keys) {
  const re = new RegExp(`-login\\.(?:windows\\.net|microsoftonline\\.com)-(?:(?:idtoken|accesstoken)-${GUID}-)?(${GUID})`, 'i');
  const realms = new Set();
  for (const k of keys) {
    const m = re.exec(k);
    if (m) realms.add(m[1].toLowerCase());
  }
  return realms.size === 1 ? [...realms] : [];
}

// First signal (in priority order) matching any comma-separated term of a rule wins.
function matchRule(signals, rules) {
  for (const s of signals) {
    const v = s.toLowerCase();
    for (const r of rules) {
      const terms = (r.match || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
      if (terms.some(t => v.includes(t))) return { rule: r, signal: s };
    }
  }
  return null;
}

// Button labels (EN/FR) that write to the tenant, anchored at the start so "Saved views" does not match.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
// ponytail: fixed keyword list, make it a user setting if consultants report misses or false positives.
const GUARDED = /^(save|enregistrer|delete|supprimer|remove|retirer|assign|attribuer|affecter|create|créer|wipe|retire|review \+ (save|create)|vérifier \+ (enregistrer|créer)|passer en revue \+ (enregistrer|créer))(?!\p{L})/iu;

function isGuarded(text) {
  return GUARDED.test(text.replace(/\s+/g, ' ').trim());
}

// Imported file is untrusted: keep only well-formed rules, coerce fields, then merge by `match` (imported rule wins).
// Import: tenants (match, label, color, PROD) replace same-match ones; "My colors" are merged (last `max` kept).⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
function mergeRules(current, data, currentColors = [], max = 5) {
  const list = Array.isArray(data) ? data : data?.rules;
  if (!Array.isArray(list)) throw new Error('Fichier invalide : liste "rules" attendue.');
  const clean = list.filter(r => r && typeof r.match === 'string' && r.match.trim()).map(r => ({
    match: r.match.trim().slice(0, 500),
    label: String(r.label ?? '').slice(0, 100),
    color: /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : '#d13438',
    prod: r.prod !== false,
  }));
  if (!clean.length) throw new Error('Aucun tenant valide dans le fichier.');
  const key = r => r.match.toLowerCase();
  const byMatch = new Map(current.map(r => [key(r), r]));
  for (const r of clean) byMatch.set(key(r), r);
  const colors = Array.isArray(data?.customColors) ? data.customColors.filter(c => /^#[0-9a-f]{6}$/i.test(c)).map(c => c.toLowerCase()) : [];
  const customColors = [...new Set([...currentColors, ...colors])].slice(-max);
  return { rules: [...byMatch.values()], imported: clean.length, customColors };
}

if (typeof module !== 'undefined') module.exports = { urlSignals, storageRealms, matchRule, isGuarded, mergeRules };
