// Level 2: parses a Learn CSP page (HTML), fetched live by background.js, into per-setting documentation. Also used by test.js.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
// Learn's CSP pages are generated with stable markers: <!-- Name-Section-Begin --> ... <!-- Name-Section-End -->.

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

// HTML fragment -> readable plain text (paragraphs and list items on their own lines).
function text(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|tr|h\d)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e] ?? m))
    .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l && l !== '•').join('\n');
}

// <table> body rows -> arrays of cell texts.
function rows(html) {
  return [...String(html || '').matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map(r => [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c => text(c[1]).replace(/\n/g, ' ')))
    .filter(r => r.length);
}

// French Learn pages translate the table labels: map them to the English keys used below.
const ALIAS = {
  'valeurs autorisées': 'allowed values', 'valeur par défaut': 'default value',
  'nom convivial': 'Friendly Name', 'emplacement': 'Location', "chemin d'accès": 'Path', 'nom': 'Name',
  'nom de la clé de registre': 'Registry Key Name', 'nom de la valeur de registre': 'Registry Value Name', 'nom du fichier admx': 'ADMX File Name',
};
const alias = k => ALIAS[k.toLowerCase().replace(/[’]/g, "'")] || k;
const DEFAULT_MARK = /\s*\((Default|par défaut)\)\s*$/i;

const SECTIONS = /<!-- ([^\s>]+?)-(Applicability|OmaUri|Description|Editable|DFProperties|AllowedValues|GpMapping)-Begin -->([\s\S]*?)<!-- \1-\2-End -->/g;

// One page -> [{ anchor, uris, description, notes, format, default, range, allowed, gp }].
function parseCspPage(html) {
  const by = new Map();
  for (const m of html.matchAll(SECTIONS)) {
    const [, name, sec, body] = m;
    if (!by.has(name)) {
      const hs = [...html.slice(0, m.index).matchAll(/<h[2-6][^>]*\bid="([^"]+)"/gi)];
      by.set(name, { anchor: hs.length ? hs[hs.length - 1][1].toLowerCase() : null });
    }
    by.get(name)[sec] = body;
  }
  const out = [];
  for (const s of by.values()) {
    const uris = [...String(s.OmaUri || '').matchAll(/<code[^>]*>([\s\S]*?)<\/code>/gi)].map(c => text(c[1])).filter(u => u.startsWith('./'));
    if (!uris.length) continue;
    const e = { anchor: s.anchor, uris };
    const desc = text(s.Description);
    if (desc) e.description = desc;
    // Editable = notes added by hand by Microsoft (tamper protection, prerequisites...). The "Note"/"Important" titles are dropped.
    const notes = text(String(s.Editable || '').replace(/<p>\s*(Note|Important|Tip|Caution|Warning|Remarque|Conseil|Attention|Avertissement)\s*<\/p>/gi, ''));
    if (notes) e.notes = notes;
    const df = Object.fromEntries(rows(s.DFProperties).filter(r => r.length >= 2).map(r => [alias(r[0]).toLowerCase(), r[1]]));
    if (df.format) e.format = df.format;
    if (df['default value']) e.default = df['default value'];
    if (df['allowed values']) e.range = df['allowed values'].replace(/^(Range|Gamme|Plage)\s*:\s*/i, ''); // "Range: [1-365]" -> "[1-365]" (the card labels it)
    const allowed = rows(s.AllowedValues).filter(r => r.length >= 2)
      .map(([v, d]) => ({ value: v.replace(DEFAULT_MARK, ''), description: d, ...(DEFAULT_MARK.test(v) ? { default: true } : {}) }));
    if (allowed.length) e.allowed = allowed;
    const gp = Object.fromEntries(rows(s.GpMapping).filter(r => r.length >= 2).map(r => [alias(r[0]), r[1]]));
    if (Object.keys(gp).length) e.gp = gp;
    out.push(e);
  }
  return out;
}

// Same key for a Graph definition's OMA-URI and a CSP page's OMA-URI.
const uriKey = u => String(u || '').toLowerCase().replace(/\/+$/, '');

// The setting's entry on a parsed page: same OMA-URI first, else the anchor of its infoUrl / derived name.
function findDoc(entries, uri, anchor) {
  const k = uriKey(uri);
  return (k && entries.find(e => e.uris.some(u => uriKey(u) === k))) || (anchor && entries.find(e => e.anchor === anchor)) || null;
}

// Only Learn MDM CSP pages can be fetched: the URL is built here from a validated slug, never taken from a message.
function learnUrl(slug, lang) {
  if (!/^[a-z0-9-]+$/.test(slug || '')) return null;
  return `https://learn.microsoft.com/${lang === 'fr' ? 'fr-fr' : 'en-us'}/windows/client-management/mdm/${slug}`;
}

if (typeof module !== 'undefined') module.exports = { text, rows, parseCspPage, uriKey, findDoc, learnUrl };
//⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
