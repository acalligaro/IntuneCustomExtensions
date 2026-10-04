// Runs in every frame of the Intune portal. On hover of a Settings Catalog row, explains the setting
// (curated text, Microsoft description, values, default) and shows CSP / GPO / licence details.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
(() => {
  const MAX_DEPTH = 6;    // ancestors inspected from the hovered node
  const MAX_TEXT = 300;   // longer text = we left the row (a whole list or panel)
  const DEBOUNCE = 150;
  // How long the card stays after the pointer leaves the setting: ⚙ menu > Settings Explainer (chrome.storage.sync `explainer.hideDelay`, seconds).
  let hideDelay = 2000;
  const setDelay = x => { const s = Number(x && x.hideDelay); if (Number.isFinite(s) && s >= 0 && s <= 60) hideDelay = s * 1000; };
  chrome.storage.sync.get('explainer').then(r => setDelay(r.explainer)).catch(() => {});
  chrome.storage.onChanged.addListener((c, area) => { if (area === 'sync' && c.explainer) setDelay(c.explainer.newValue); });
  const T = (k, v) => globalThis.__tenantCompassI18n ? __tenantCompassI18n.t(k, v) : k;
  // For lib.js: French fallback when the key is unknown (t() returns the key itself).
  const tr = (k, fr) => { const s = T(k); return s === k ? fr : s; };

  // ---------- data ----------

  let data;
  const LIVE = 'explainerLive'; // not Setting Inspector's `live`: our definitions keep more fields (description, options...)
  const byId = new Map(); // settingDefinitionId -> def (seed + live)
  let licenseRules;      // overlay._licenseRules (keys starting with _ are not setting ids)
  function load() {
    // ponytail: every frame that gets hovered parses its own copy of the DB; move lookups to a service worker if memory hurts.
    // Seed and overlay (licence, GPO) are Setting Inspector's; only the curated explanations (level 3) are ours.
    const json = p => fetch(chrome.runtime.getURL(p)).then(r => r.json()).catch(() => ({}));
    return data ||= Promise.all([
      json('setting-inspector/data/settings.json'), json('setting-inspector/data/overlay.json'), json('settings-explainer/data/explain.json'),
      chrome.storage.local.get(LIVE).then(s => s[LIVE] || {}).catch(() => ({})),
    ]).then(([db, overlay, explain, live]) => {
      for (const [id, x] of Object.entries(explain)) overlay[id] = { ...overlay[id], ...x };
      for (const list of Object.values(db)) for (const d of list) byId.set(d.id, d);
      addLive(db, Object.values(live));
      licenseRules = overlay._licenseRules;
      return [db, overlay];
    });
  }

  // Definitions captured from the portal's Graph traffic (page-hook.js) override the bundled seed.
  function addLive(db, defs) {
    for (const d of defs) {
      byId.set(d.id, d);
      const k = normalize(d.displayName);
      if (!k) continue;
      db[k] = [d, ...(db[k] || []).filter(e => e.id !== d.id)];
    }
  }

  window.addEventListener('message', async e => {
    if (e.source !== window || !e.data || e.data.type !== 'settings-explainer:graph') return;
    const defs = extractDefs(e.data.json);
    if (!defs.length) return;
    console.info(`[Settings Explainer] ${defs.length} définition(s) capturée(s)`);
    addLive((await load())[0], defs);
    // Shared with the other frames (picker and Graph calls may live in different iframes).⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
    // ponytail: read-modify-write, concurrent frames can drop a batch; it is re-captured on next portal load.
    const live = (await chrome.storage.local.get(LIVE))[LIVE] || {};
    for (const d of defs) live[d.id] = d;
    chrome.storage.local.set({ [LIVE]: live });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[LIVE] && data) data.then(([db]) => addLive(db, Object.values(changes[LIVE].newValue || {})));
  });

  // ---------- detection (heuristic, see README) ----------

  function candidates(el) {
    const out = [];
    for (let i = 0; el && el !== document.body && i < MAX_DEPTH; i++, el = el.parentElement) {
      for (const a of ['aria-label', 'title']) {
        const v = el.getAttribute(a);
        if (v) out.push(v);
      }
      const t = el.innerText;
      if (!t) continue;
      if (t.length > MAX_TEXT) break;
      out.push(t.split('\n')[0], t);
    }
    return out;
  }

  async function find(target) {
    const [db, overlay] = await load();
    // Row tagged by page-hook.js with its definition id (works whatever the portal language).
    const tag = target.closest?.('[data-se-def]');
    if (tag) {
      try {
        const v = Object.fromEntries(Object.entries(slim(JSON.parse(tag.getAttribute('data-se-def')))).filter(([, x]) => x != null));
        return [{ ...byId.get(v.id), ...v, ...overlayFor(overlay, v.id) }];
      } catch {}
    }
    for (const c of candidates(target)) {
      const hits = lookup(db, c);
      if (hits.length) return hits.map(e => ({ ...e, ...overlayFor(overlay, e.id) }));
    }
    return [];
  }

  // ---------- tooltip ----------

  const host = document.createElement('div');
  host.id = 'settings-explainer';
  const root = host.attachShadow({ mode: 'open' });
  let box, hideTimer;

  // Same look as the As-Built panel (rounded card, blue -> violet gradient, light scheme).⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
  const CSS = `
    :host { all: initial; color-scheme: light; }
    * { box-sizing: border-box; }
    .box { position: fixed; z-index: 2147483647; width: 380px; max-width: calc(100vw - 8px); max-height: 60vh; overflow: auto;
           background: #fff; color: #1b1a19; border-radius: 12px;
           box-shadow: 0 10px 28px rgba(0,0,0,.18), 0 0 0 1px rgba(0,0,0,.05);
           font: 12px/1.4 "Segoe UI Variable", "Segoe UI", system-ui, sans-serif; animation: pop .12s ease-out; }
    @keyframes pop { from { opacity: 0; transform: translateY(3px); } }
    .entry { padding: 0 10px 6px; }
    .entry + .entry { border-top: 1px solid #f3f2f1; padding-top: 6px; }
    .title { display: flex; gap: 6px; align-items: center; margin: 0 -10px 4px; padding: 6px 10px; color: #fff; font-weight: 600; font-size: 12.5px;
             background: linear-gradient(135deg, #0078d4, #5b5fc7); }
    .title span:first-child { flex: 1; min-width: 0; }
    .entry + .entry .title { margin-top: -6px; }
    .row { display: grid; grid-template-columns: 92px minmax(0, 1fr) auto; gap: 6px; align-items: center; margin: 3px 0; }
    .k { color: #605e5c; font-weight: 600; font-size: 11px; overflow-wrap: anywhere; }
    code { font: 11px/1.4 "Cascadia Code", Consolas, monospace; background: #f3f2f1; color: #323130; padding: 1px 6px; border-radius: 6px;
           white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    button { font: inherit; font-size: 11px; font-weight: 600; padding: 1px 8px; border: 0; border-radius: 999px;
             background: #eff6fc; color: #005a9e; cursor: pointer; transition: background .15s, transform .1s; }
    button:hover { background: #deecf9; }
    button:active { transform: scale(.96); }
    .nopro { flex: none; padding: 0 7px; border-radius: 999px; font-size: 10.5px; font-weight: 700;
             color: #a4262c; background: #fde7e9; text-decoration: line-through; text-decoration-thickness: 2px; }
    .links a + a { margin-left: 8px; }
    .ex { margin: 4px 0 6px; padding: 6px 8px; border-radius: 8px; background: #f8f9fb; }
    .ex p { margin: 0 0 4px; white-space: pre-line; }
    .ex .h { color: #605e5c; font-weight: 600; font-size: 11px; margin: 4px 0 1px; }
    .ex ul { margin: 0 0 4px; padding-left: 16px; }
    .ex .ms { color: #323130; }
    .ex .help { color: #605e5c; }
    .ex .note { color: #8a5300; background: #fff4ce; border-radius: 6px; padding: 3px 6px; }
    .ex .src { color: #605e5c; font-size: 10.5px; }
    .ex details { margin: 2px 0; }
    .ex summary { cursor: pointer; color: #005a9e; font-weight: 600; font-size: 11px; }
    .ex .opt b { font-weight: 600; }
    .ex .opt .v { color: #605e5c; font-family: "Cascadia Code", Consolas, monospace; font-size: 10.5px; }
    .tag { flex: none; padding: 0 7px; border-radius: 999px; font-size: 10.5px; font-weight: 700; }
    .risk-high { color: #a4262c; background: #fde7e9; }
    .risk-medium { color: #8a5300; background: #fff4ce; }
    .cur { color: #0b6a0b; background: #dff6dd; }
    a { color: #0078d4; text-decoration: none; }
    a:hover { text-decoration: underline; }`;

  function h(tag, props, ...kids) {
    const n = document.createElement(tag);
    Object.assign(n, props);
    n.append(...kids.filter(k => k != null && k !== ''));
    return n;
  }

  // Compact grid row: label | value (ellipsis, full text in tooltip) | optional button.
  function row(label, value, btn) {
    const v = typeof value === 'string' ? h('span', { textContent: value, title: value }) : value;
    return h('div', { className: 'row' }, h('span', { className: 'k', textContent: label }), v, btn || h('span'));
  }

  async function copy(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API is often blocked inside the portal's cross-origin iframes.
      const ta = h('textarea', { value: text });
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    btn.textContent = T('settingsExplainer.copied');
  }

  // Explanation block: curated text first (overlay `explain`), then Microsoft's texts, default and possible values.
  function explanation(e, title) {
    const x = explain(e, __tenantCompassI18n.lang());
    if (x.risk === 'high' || x.risk === 'medium') title.append(h('span', { className: 'tag risk-' + x.risk, textContent: T('settingsExplainer.risk.' + x.risk) }));
    if (x.curated) title.append(h('span', { className: 'tag cur', textContent: T('settingsExplainer.curated'), title: T('settingsExplainer.curatedTip') }));
    if (x.empty) return h('div', { className: 'ex' }, h('p', { className: 'help', textContent: T('settingsExplainer.none') }));
    const kids = [];
    const c = x.curated;
    if (c) {
      const part = (key, v) => v && v.length ? [h('div', { className: 'h', textContent: T('settingsExplainer.' + key) }),
        Array.isArray(v) ? h('ul', {}, ...v.map(t => h('li', { textContent: t }))) : h('p', { textContent: v })] : [];
      kids.push(...part('what', c.what), ...part('impact', c.impact), ...part('pitfalls', c.pitfalls), ...part('recommendation', c.recommendation));
      const src = (c.sources || []).filter(u => /^https:\/\//i.test(u));
      if (src.length) kids.push(h('div', { className: 'h', textContent: T('settingsExplainer.sources') }), h('span', { className: 'links' },
        ...src.map((u, i) => h('a', { href: u, target: '_blank', rel: 'noopener noreferrer', title: u, textContent: T('settingsExplainer.docN', { n: i + 1 }) }))));
    }
    const ms = [x.description && h('p', { className: 'ms', textContent: x.description }), x.help && h('p', { className: 'help', textContent: x.help })].filter(Boolean);
    if (e.learn && e.learn.url) ms.push(h('div', { className: 'src' }, T('settingsExplainer.fromLearn') + ' ',
      h('a', { href: e.learn.url, target: '_blank', rel: 'noopener noreferrer', title: e.learn.url, textContent: e.learn.page + ' ↗' })));
    if (ms.length) kids.push(c ? h('details', {}, h('summary', { textContent: T('settingsExplainer.msDescription') }), ...ms) : h('div', {}, ...ms));
    if (x.notes) kids.push(h('p', { className: 'note', textContent: x.notes }));
    if (x.default !== null) kids.push(row(T('settingsExplainer.default'), x.default));
    if (x.range) kids.push(row(T('settingsExplainer.range'), x.range));
    if (x.options.length) kids.push(h('details', {}, h('summary', { textContent: T('settingsExplainer.values', { n: x.options.length }) }),
      h('ul', {}, ...x.options.map(o => h('li', { className: 'opt' }, h('b', { textContent: o.displayName }),
        o.value !== undefined ? h('span', { className: 'v', textContent: ` (${o.value})` }) : null,
        o.description && o.description !== o.displayName ? ' : ' + o.description : null)))));
    return h('div', { className: 'ex' }, ...kids);
  }

  function entry(e) {
    const title = h('div', { className: 'title' }, h('span', { textContent: e.displayName }));
    const kids = [title, explanation(e, title)];
    if (e.id) {
      const btn = h('button', { type: 'button', textContent: T('settingsExplainer.copy') });
      btn.addEventListener('click', () => copy(e.id, btn));
      kids.push(row('ID', h('code', { textContent: e.id, title: e.id }), btn));
    }
    const uri = omaUri(e);
    if (uri) {
      const btn = h('button', { type: 'button', textContent: T('settingsExplainer.copy') });
      btn.addEventListener('click', () => copy(uri, btn));
      kids.push(row(uri.startsWith('./') ? 'OMA-URI' : T('settingsExplainer.key'), h('code', { textContent: uri, title: uri }), btn)); // macOS/iOS: payload key, not an OMA-URI
    }
    const lic = licenseFor(e, licenseRules, tr);
    // Edition Pro not supported: struck "Windows Pro" badge right under the title.
    if (lic.proBlocked) title.append(h('span', { className: 'nopro', textContent: 'Windows Pro', title: T('settingsExplainer.noPro') }));
    const licRow = row(T('settingsExplainer.license'), lic.text);
    if (lic.source === 'rule') licRow.title = T('settingsExplainer.licenseSource', { date: lic.verified });
    kids.push(licRow);
    const min = e.applicability && e.applicability.minimumSupportedVersion;
    if (min) kids.push(row(T('settingsExplainer.minOs'), min));
    const g = e.gpo || learnGpo(e.learn && e.learn.gp);
    if (g) {
      kids.push(row('GPO', [g.path, g.name].filter(Boolean).join(' > ') + (g.admx ? ` (${g.admx})` : '')));
      if (g.registry) kids.push(row(T('settingsExplainer.registry'), h('code', { textContent: g.registry })));
    }
    const urls = (e.infoUrls || []).filter(u => /^https:\/\//i.test(u));
    if (urls.length) kids.push(row('Learn', h('span', { className: 'links' },
      ...urls.map((u, i) => h('a', { href: u, target: '_blank', rel: 'noopener noreferrer', title: u, textContent: urls.length > 1 ? T('settingsExplainer.docN', { n: i + 1 }) : T('settingsExplainer.doc') })))));
    return h('div', { className: 'entry' }, ...kids);
  }

  let shown = 0; // incremented by every show(): a late Learn answer only refreshes the card it was asked for
  function show(entries, anchor) {
    shown++;
    clearTimeout(hideTimer);
    if (!host.isConnected) document.documentElement.appendChild(host);
    box = h('div', { className: 'box' }, ...entries.slice(0, 2).map(entry));
    root.replaceChildren(h('style', { textContent: CSS }), box);
    // Always docked to the right edge of the window, vertically aligned with the hovered row and kept on screen.
    // ponytail: inside a portal iframe the window is the iframe, so the card docks to the iframe's right edge; relay to the top frame if needed.
    box.style.right = '8px';
    box.style.top = Math.max(4, Math.min(anchor.getBoundingClientRect().top, innerHeight - box.offsetHeight - 4)) + 'px';
  }

  function hideSoon() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => root.replaceChildren(), hideDelay);
  }

  // Level 2: the setting's Learn CSP documentation, fetched live by background.js (cached there 7 days).
  async function learnDoc(e) {
    const t = learnTarget(e);
    if (!t) return null;
    try {
      return await chrome.runtime.sendMessage({ type: 'learn', ...t, uri: omaUri(e), lang: __tenantCompassI18n.lang() });
    } catch { return null; } // extension reloaded: the old content script has no service worker any more
  }

  // ---------- events ----------

  let timer, lastTarget, misses = 0;
  document.addEventListener('mouseover', e => {
    if (e.target === host) { clearTimeout(hideTimer); clearTimeout(timer); lastTarget = host; return; }
    if (e.target === lastTarget) return;
    lastTarget = e.target;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const target = e.target;
      const hits = await find(target);
      if (target !== lastTarget) return;
      if (hits.length) {
        show(hits, target);
        const me = shown;
        const docs = await Promise.all(hits.slice(0, 2).map(learnDoc));
        if (me === shown && root.childElementCount && docs.some(Boolean)) show(hits.map((x, i) => (docs[i] ? { ...x, learn: docs[i] } : x)), target);
      }
      else {
        hideSoon();
        // Diagnostic: first unmatched hover texts, to tune detection (see README).⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
        const c = candidates(target).find(t => t.trim());
        if (c && misses++ < 20) console.info('[Settings Explainer] aucun paramètre pour :', JSON.stringify(c.slice(0, 120)));
      }
    }, DEBOUNCE);
  }, true);
  // The pointer can leave this frame without any mouseover here (into a portal iframe, out of the window) and the
  // portal can swap the view under a shown card: start the close delay in those cases too.
  const leave = () => { lastTarget = null; clearTimeout(timer); hideSoon(); };
  document.addEventListener('mouseout', e => { if (!e.relatedTarget || e.relatedTarget.tagName === 'IFRAME') leave(); }, true);
  addEventListener('blur', leave);
  addEventListener('hashchange', leave);
})();
