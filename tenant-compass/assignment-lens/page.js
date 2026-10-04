// MAIN world, every frame of intune.microsoft.com (top + *.portal.azure.net extension sandboxes).⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
// Each frame watches its own Graph traffic. The frame that saw a policy queries Graph with the portal's
// token (kept in this closure only) and posts a token-free result to the top frame, which draws the panel.
(() => {
  const L = globalThis.AssignmentLensLib;
  const TOP = 'https://intune.microsoft.com';
  const GRAPH = 'https://graph.microsoft.com/';
  const API = GRAPH + 'beta/';
  const MSG = 'assignment-lens:';
  const isTop = window === window.top;
  const T = (k, v) => globalThis.__tenantCompassI18n ? __tenantCompassI18n.t('assignmentLens.' + k, v) : k;
  const anc = location.ancestorOrigins;
  const topOrigin = isTop ? location.origin : anc?.[anc.length - 1];
  if (!L || topOrigin !== TOP) return;

  // ---------- observation of the portal's own Graph requests ----------

  let token = null; // "Bearer ..." — never stored, logged, or sent anywhere but graph.microsoft.com
  let ref = null;
  let seenAt = 0;
  let timer = null;
  const nativeFetch = window.fetch;

  const abs = u => { try { return new URL(u, location.href).href; } catch { return ''; } };

  function authOf(h) {
    if (!h) return null;
    if (h instanceof Headers) return h.get('authorization');
    if (Array.isArray(h)) return h.find(([k]) => /^authorization$/i.test(k))?.[1] || null;
    for (const k of Object.keys(h)) if (/^authorization$/i.test(k)) return h[k];
    return null;
  }

  function observe(url, auth, body) {
    if (!url || !url.startsWith(GRAPH)) return;
    if (typeof auth === 'string' && /^Bearer\s+\S/i.test(auth)) token = auth;
    let refs = [L.parsePolicyRef(url)];
    if (/\/\$batch\b/.test(url) && typeof body === 'string') {
      try { refs = JSON.parse(body).requests.map(r => L.parsePolicyRef(r.url)); } catch {}
    }
    setRef(refs.find(Boolean));
  }

  function setRef(r) {
    if (!r || (ref && r.id === ref.id)) return;
    ref = r;
    seenAt = Date.now();
    clearTimeout(timer);
    timer = setTimeout(analyse, 800); // let the portal finish its own burst of calls first
  }

  // The shell runs extension code (Intune included) in a Web Worker, where content scripts never run: its Graph calls
  // are invisible here. In the top frame, take the Graph token the shell hands to that worker over MessagePort and⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
  // the object id from the blade URL instead.
  if (isTop) {
    for (const P of [MessagePort.prototype, Worker.prototype]) {
      const send = P.postMessage;
      P.postMessage = function (data) {
        try {
          const t = L.graphTokenIn(data);
          if (t) { const first = !token; token = t; if (first && ref) setTimeout(analyse, 0); }
        } catch {}
        return send.apply(this, arguments);
      };
    }
    // The shell moves between blades with history.pushState, which fires no hashchange: poll. setRef ignores repeats.
    // A blade without a known object id empties the panel, so it never keeps showing the previous policy.
    let lastHash = null;
    const fromHash = () => {
      if (location.hash === lastHash) return;
      lastHash = location.hash;
      const r = L.parseHashRef(location.hash);
      if (r) return setRef(r);
      ref = null;
      navAt = Date.now() - 1000; // results seen up to 1 s before the poll noticed the change still count
      if (result) { result = null; render(); }
    };
    setInterval(fromHash, 1000);
    setTimeout(fromHash, 0); // after the whole script ran: fromHash uses `result` / `navAt`, declared further down
  }

  window.fetch = function (input, init) {
    try {
      const req = input instanceof Request ? input : null;
      observe(abs(req ? req.url : String(input)), authOf(init?.headers) || authOf(req?.headers), init?.body);
    } catch {}
    return nativeFetch.apply(this, arguments);
  };

  const X = XMLHttpRequest.prototype;
  const xOpen = X.open, xHeader = X.setRequestHeader, xSend = X.send;
  const xUrl = new WeakMap(), xAuth = new WeakMap();
  X.open = function (method, url) { xUrl.set(this, abs(String(url))); return xOpen.apply(this, arguments); };
  X.setRequestHeader = function (k, v) { if (/^authorization$/i.test(k)) xAuth.set(this, v); return xHeader.apply(this, arguments); };
  X.send = function (body) { try { observe(xUrl.get(this), xAuth.get(this), body); } catch {} return xSend.apply(this, arguments); };

  // ---------- our own read-only Graph queries ----------

  async function get(path, headers) {
    const url = path.startsWith(GRAPH) ? path : API + path;
    const r = await nativeFetch.call(window, url, {
      method: 'GET', credentials: 'omit', cache: 'no-store',
      headers: { Authorization: token, ...headers },
    });
    if (!r.ok) throw new Error(r.status === 401 ? T('err.expired') : `Graph HTTP ${r.status}`);
    return /json/.test(r.headers.get('content-type') || '') ? r.json() : r.text();
  }

  // ponytail: MAX_PAGES caps tenant-wide listings (~1000 objects/collection); raise it for very large tenants.
  const MAX_PAGES = 10;
  async function all(path) {
    const items = [];
    let next = API + path;
    for (let n = 0; next && n < MAX_PAGES; n++) {
      const j = await get(next);
      items.push(...(j.value || []));
      const link = j['@odata.nextLink'];
      next = typeof link === 'string' && link.startsWith(GRAPH) ? link : null;
    }
    return { items, truncated: !!next };
  }

  let run = 0;
  async function analyse() {
    if (!ref) return;
    const my = ++run, cur = ref, at = seenAt;
    let famKey = L.FAMILIES[cur.family] ? cur.family : null;
    let fam = L.FAMILIES[famKey];
    const post = data => { if (my === run) window.top.postMessage({ type: MSG + 'result', seenAt: at, family: famKey, ...data }, TOP); };
    post({ status: 'loading' });
    try {
      if (!token) throw new Error(T('err.noToken'));
      let policy = null;
      if (!fam) { // id from the blade URL: the collection is unknown, try each policy family in turn
        for (const f of ['configurationPolicies', 'deviceConfigurations', 'groupPolicyConfigurations', 'deviceCompliancePolicies']) {
          policy = await get(`${L.FAMILIES[f].path}/${cur.id}`).catch(() => null);
          if (policy) { famKey = f; fam = L.FAMILIES[f]; break; }
        }
        if (!fam) throw new Error(T('err.notFound'));
      }
      const [, asg, filters] = await Promise.all([
        policy || get(`${fam.path}/${cur.id}`).then(p => { policy = p; }),
        all(`${fam.path}/${cur.id}/assignments`),
        all('deviceManagement/assignmentFilters').catch(() => ({ items: [] })),
      ]);
      const s = L.summarizeAssignments(asg.items);

      const ids = [...new Set([...s.include, ...s.exclude].map(g => g.groupId))];
      const groups = Object.fromEntries(await Promise.all(ids.map(async id => {
        const [g, n] = await Promise.all([
          get(`groups/${id}?$select=displayName`).catch(() => null),
          get(`groups/${id}/members/$count`, { ConsistencyLevel: 'eventual' }).catch(() => null),
        ]);
        return [id, { name: g?.displayName || id, count: n == null || isNaN(n) ? null : Number(n) }];
      })));
      groups.allUsers = { name: T('allUsers'), virtual: true };
      groups.allDevices = { name: T('allDevices'), virtual: true };

      const filterName = Object.fromEntries(filters.items.map(f => [f.id, f.displayName]));
      const filterOf = key => {
        const f = s.filters.find(x => x.target === key);
        return f ? { name: filterName[f.id] || f.id, mode: f.mode } : null;
      };

      const lists = await Promise.all(fam.peers.map(f =>
        all(`${L.FAMILIES[f].path}?$expand=assignments${f === 'mobileApps' ? '&$filter=isAssigned eq true' : ''}`)
          .then(r => ({ f, ...r }), () => ({ f, items: [], failed: true }))));
      const keys = [...s.include.map(g => g.groupId), ...(s.allUsers ? ['allUsers'] : []), ...(s.allDevices ? ['allDevices'] : [])];
      const overlaps = lists.flatMap(l =>
        L.findOverlaps(keys, l.items.filter(p => String(p.id).toLowerCase() !== cur.id.toLowerCase()))
          .map(o => ({ policyName: o.policyName, family: l.f, group: groups[o.groupId]?.name || o.groupId, mode: o.mode })));

      const virtual = key => s[key] ? [{ ...groups[key], filter: filterOf(key) }] : [];
      post({
        status: 'ok',
        name: policy.displayName || policy.name || cur.id,
        include: [...virtual('allUsers'), ...virtual('allDevices'),
          ...s.include.map(g => ({ ...groups[g.groupId], intent: g.intent, filter: filterOf(g.groupId) }))],
        exclude: s.exclude.map(g => ({ ...groups[g.groupId] })),
        overlaps,
        truncated: asg.truncated || lists.some(l => l.truncated),
        failed: lists.filter(l => l.failed).map(l => l.f),
      });
    } catch (e) {
      post({ status: 'error', error: String(e?.message || e) });
    }
  }

  window.addEventListener('message', e => {
    if (e.source === window.top && e.origin === TOP && e.data?.type === MSG + 'refresh' && !isTop) analyse();
  });

  if (!isTop) return;

  // ---------- panel (top frame only) ----------⁣​​‌​‌​​​​​​‌​​‌​‍​⁣

  let result = null, navAt = 0;
  let collapsed = true; // Tenant Compass: stays a small button until clicked (no auto-open)
  // Opening Assignment Lens closes As-Built (and vice versa), see shared/drag.js.
  const openedExclusive = window.__tenantCompassExclusive ? window.__tenantCompassExclusive('assignment-lens', () => { if (!collapsed) { collapsed = true; render(); } }) : () => {};

  window.addEventListener('message', e => {
    if (e.data?.type !== MSG + 'result') return;
    if (e.origin !== TOP && !/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.portal\.azure\.net$/.test(e.origin)) return;
    if (result && e.data.seenAt < result.seenAt) return; // a stale blade answering a refresh
    if (e.data.seenAt < navAt) return; // seen before the user left that blade
    result = e.data;
    render();
  });

  function refresh() {
    analyse();
    (function walk(w) {
      for (let i = 0; i < w.frames.length; i++) {
        try { w.frames[i].postMessage({ type: MSG + 'refresh' }, '*'); walk(w.frames[i]); } catch {}
      }
    })(window);
  }

  // Family keys travel in the result message; labels are looked up at render time.
  const family = key => T('family.' + (key || 'unknown'));
  const INTENTS = ['required', 'available', 'uninstall', 'availableWithoutEnrollment'];
  const intent = i => INTENTS.includes(i) ? T('intent.' + i) : i;

  // Text only goes through append(string) / textContent: no HTML parsing of Graph data.
  const h = (tag, cls, ...kids) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    for (const k of kids) if (k != null && k !== false) n.append(k);
    return n;
  };

  // Tenant Compass: As-Built visual style; button bottom-left above As-Built's, card above both buttons.
  const CSS = `
    .p { position: fixed; left: 20px; bottom: 124px; z-index: 2147483001; width: 380px; max-height: 60vh;
         display: flex; flex-direction: column; background: #fff; color: #1b1a19; color-scheme: light;
         border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,.22), 0 0 0 1px rgba(0,0,0,.05);
         font: 13px/1.45 "Segoe UI Variable", "Segoe UI", system-ui, sans-serif; }
    header { display: flex; align-items: center; gap: 8px; padding: 10px 14px; color: #fff;
             background: linear-gradient(135deg, #0078d4, #5b5fc7); }
    header .t { flex: 1; font-weight: 600; font-size: 14px; }
    button { font: inherit; color: inherit; border: 0; cursor: pointer; }
    header button { background: rgba(255,255,255,.15); color: #fff; width: 28px; height: 28px; border-radius: 50%; font-size: 15px; }
    header button:hover { background: rgba(255,255,255,.3); }
    .b { overflow: auto; padding: 8px 14px 12px; }
    .fab { position: fixed; left: 20px; bottom: 72px; z-index: 2147483000; background: linear-gradient(135deg, #0078d4, #5b5fc7); color: #fff;
           border-radius: 999px; padding: 10px 18px; font: 600 13px/1.45 "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
           box-shadow: 0 6px 20px rgba(0,120,212,.35); transition: transform .15s ease, box-shadow .15s ease; }
    .fab:hover { transform: translateY(-2px); box-shadow: 0 10px 26px rgba(0,120,212,.45); }
    h3 { margin: 10px 0 4px; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #005a9e; font-weight: 600; }
    ul { margin: 0; padding: 0; list-style: none; }
    li { margin: 2px 0; padding: 6px 8px; border-radius: 10px; background: #f3f2f1; }
    .m { color: #605e5c; font-size: 12px; } .e { color: #a4262c; }`;

  let root;
  function render() {
    if (!root) {
      const host = h('div');
      host.id = 'assignment-lens';
      root = host.attachShadow({ mode: 'closed' });
      document.documentElement.appendChild(host);
    }
    const style = h('style');
    style.textContent = CSS;
    const drag = (el, handle, key) => window.__tenantCompassDrag && window.__tenantCompassDrag(el, handle, key);

    // Same behaviour as As-Built: the button always stays and toggles the card, shown above the buttons.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
    const toggle = () => { collapsed = !collapsed; render(); if (!collapsed) openedExclusive(); };
    const fab = h('button', 'fab', 'Assignment Lens');
    fab.title = T('fab.title');
    fab.setAttribute('aria-expanded', String(!collapsed));
    fab.onclick = toggle;
    if (collapsed) {
      root.replaceChildren(style, fab);
      drag(fab, fab, 'assignment-lens-fab');
      return;
    }

    const btn = (text, label, fn) => {
      const b = h('button', null, text);
      b.title = label;
      b.setAttribute('aria-label', label);
      b.onclick = fn;
      return b;
    };
    const close = () => { collapsed = true; render(); };
    const title = h('span', 't', 'Assignment Lens');
    title.onclick = close; // a drag of the header swallows this click (shared/drag.js)
    const header = h('header', null, title, btn('↻', T('refresh'), refresh), btn('×', T('collapse'), close));
    header.title = T('header.title');
    const panel = h('div', 'p', header, h('div', 'b', ...body()));
    root.replaceChildren(style, panel, fab);
    drag(fab, fab, 'assignment-lens-fab');
    drag(panel, header, 'assignment-lens-panel');
  }

  const count = g => g.virtual ? T('virtual') : g.count == null ? T('members.unknown') : T(g.count > 1 ? 'members.many' : 'members.one', { n: g.count });
  const filter = f => f && T('filter', { name: f.name, mode: ['include', 'exclude'].includes(f.mode) ? T('mode.' + f.mode) : f.mode });
  const meta = (...parts) => h('span', 'm', ' · ' + parts.filter(Boolean).join(' · '));

  function body() {
    const r = result;
    if (!r) return [h('p', 'm', T('empty'))];
    if (r.status === 'loading') return [h('p', 'm', T('loading', { family: family(r.family) }))];
    if (r.status === 'error') return [h('p', 'e', T('error', { error: r.error }))];
    const list = (items, line, empty) => items.length ? h('ul', null, ...items.map(i => h('li', null, ...line(i)))) : h('p', 'm', empty);
    return [
      h('div', null, h('strong', null, r.name), h('span', 'm', ` · ${family(r.family)}`)),
      h('h3', null, T('included', { n: r.include.length })),
      list(r.include, g => [g.name, meta(count(g), intent(g.intent), filter(g.filter))], T('noAssignment')),
      h('h3', null, T('excluded', { n: r.exclude.length })),
      list(r.exclude, g => [g.name, meta(count(g))], T('noExclusion')),
      h('h3', null, T('overlaps', { n: r.overlaps.length })),
      list(r.overlaps, o => [o.policyName, meta(family(o.family), T(o.mode === 'exclude' ? 'overlap.exclude' : 'overlap.include', { group: o.group }))], T('noOverlap')),
      r.truncated && h('p', 'm', T('truncated')),
      r.failed?.length > 0 && h('p', 'e', T('failed', { list: r.failed.map(family).join(', ') })),
    ];
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true });
  else render();
})();
