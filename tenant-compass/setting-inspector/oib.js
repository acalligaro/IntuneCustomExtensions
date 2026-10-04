// OpenIntuneBaseline recommendations in the setting card (ISOLATED world, loaded after settings-explainer/lib.js).⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
// Data: setting-inspector/data/oib.json, built from the OpenIntuneBaseline repository by tools/build-oib.mjs.
// OpenIntuneBaseline © SkipToTheEndpoint (James Robinson), GPL-3.0: see data/OIB-NOTICE.md and data/OIB-LICENSE.txt.
// Pure part (oibFor, oibValue) tested by setting-inspector/test.js; oibBlock() renders the card section.

const OIB_URL = 'https://github.com/SkipToTheEndpoint/OpenIntuneBaseline';

// Policies of the baseline that configure this setting: exact settingDefinitionId match, [{ p: policy name, v: [values] }].⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
function oibFor(def, oib) {
  const id = def && def.id;
  return (id && oib && oib.settings && oib.settings[id]) || [];
}

// Readable value: a choice value is an option itemId (<setting id>_<x>), shown with the option label the portal gives
// for this setting (so in the portal language); else the itemId suffix. Simple values as they are.
function oibValue(v, def) {
  const d = def || {};
  if (typeof v !== 'string') return String(v);
  const opt = (d.options || []).find(o => o.itemId === v);
  if (opt) return opt.displayName;
  return d.id && v.startsWith(d.id + '_') ? v.slice(d.id.length + 1) : v;
}

// ---------- card section (browser only) ----------

const OIB_CSS = `
    .oib { margin: 4px 0 6px; padding: 6px 8px; border-radius: 8px; background: #f1f6fd; border-left: 3px solid #0078d4; }
    .oib.none { background: #f8f9fb; border-left-color: #c8c6c4; color: #605e5c; }
    .oib .h { color: #005a9e; font-weight: 700; font-size: 11px; margin: 0 0 2px; }
    .oib .rec + .rec { border-top: 1px dashed #c7dcf0; margin-top: 4px; padding-top: 4px; }
    .oib .val { font-weight: 700; font-size: 12.5px; color: #1b1a19; overflow-wrap: anywhere; }
    .oib .meta { color: #605e5c; font-size: 10.5px; overflow-wrap: anywhere; }
    .oib .src { color: #605e5c; font-size: 10px; margin-top: 3px; }
    .oibtag { flex: none; padding: 0 7px; border-radius: 999px; font-size: 10.5px; font-weight: 700; color: #fff; background: #005a9e; }`;

const OIB_MAX = 3;

// Section for entry e; an "OIB" badge is added to the title element when the baseline configures the setting.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
function oibBlock(e, oib, title) {
  const T = (k, v) => __tenantCompassI18n.t('oib.' + k, v);
  const el = (tag, cls, text, tip) => Object.assign(document.createElement(tag), { className: cls, textContent: text, ...(tip ? { title: tip } : {}) });
  const meta = (oib && oib._meta) || {};
  const ver = Object.entries(meta.versions || {}).map(([p, v]) => `${p} v${v}`).join(', ');
  const bench = `OpenIntuneBaseline${ver ? ' (' + ver + ')' : ''}`;
  const hits = oibFor(e, oib);
  if (!hits.length) return el('div', 'oib none', T('none', { bench }));
  title.append(el('span', 'oibtag', 'OIB', T('badge')));
  const box = el('div', 'oib', '');
  box.append(el('div', 'h', T('title'), bench));
  for (const x of hits.slice(0, OIB_MAX)) {
    const rec = el('div', 'rec', '');
    rec.append(el('div', 'val', x.v.map(v => oibValue(v, e)).join(', ')), el('div', 'meta', T('policy', { p: x.p })));
    box.append(rec);
  }
  if (hits.length > OIB_MAX) box.append(el('div', 'meta', T('more', { n: hits.length - OIB_MAX })));
  // Attribution required by the baseline's licence (GPL-3.0): author, licence, source.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
  const src = el('div', 'src', T('credit', { commit: meta.commit || '?' }) + ' ');
  src.append(Object.assign(document.createElement('a'), { href: OIB_URL, target: '_blank', rel: 'noopener noreferrer', textContent: 'GitHub ↗' }));
  box.append(src);
  return box;
}

// Labels of the section (keys 'oib.*'), here so the card gets them without touching its i18n.js.
globalThis.__tenantCompassI18n?.add({
  fr: {
    'oib.title': 'Recommandation OpenIntuneBaseline',
    'oib.badge': 'Paramètre configuré par OpenIntuneBaseline',
    'oib.none': 'Non configuré par {bench}',
    'oib.policy': 'Stratégie : {p}',
    'oib.more': '+ {n} autre(s) stratégie(s) OIB',
    'oib.credit': 'OpenIntuneBaseline © SkipToTheEndpoint, licence GPL-3.0, données extraites (commit {commit}), sans garantie.',
  },
  en: {
    'oib.title': 'OpenIntuneBaseline recommendation',
    'oib.badge': 'Setting configured by OpenIntuneBaseline',
    'oib.none': 'Not configured by {bench}',
    'oib.policy': 'Policy: {p}',
    'oib.more': '+ {n} more OIB policy(ies)',
    'oib.credit': 'OpenIntuneBaseline © SkipToTheEndpoint, GPL-3.0 license, extracted data (commit {commit}), no warranty.',
  },
});

if (typeof module !== 'undefined') module.exports = { oibFor, oibValue };
