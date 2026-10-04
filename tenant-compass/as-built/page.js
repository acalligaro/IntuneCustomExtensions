// MAIN world, every frame of the Intune portal.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
// All frames: observe the bearer token the portal sends to graph.microsoft.com (memory only) and answer read-only GET relays.
// Top frame (intune/endpoint.microsoft.com): floating button, picker, exports.
(() => {
  const L = globalThis.AsBuiltLib;
  const T = (k, v) => (globalThis.__tenantCompassI18n ? globalThis.__tenantCompassI18n.t(k, v) : k);
  const GRAPH_RE = /^https:\/\/graph\.microsoft\.com\/(beta|v1\.0)\//;
  const UI_ORIGINS = ['https://intune.microsoft.com', 'https://endpoint.microsoft.com'];
  const WORKER_ORIGIN = /^https:\/\/((intune|endpoint)\.microsoft\.com|([\w-]+\.)*portal\.azure\.net)$/;
  const isTop = window === window.top;
  const nativeFetch = window.fetch.bind(window);
  let token = null; // never persisted, never logged, never posted to another frame

  // ---------- token observation ----------⁣​​‌​‌​​​​​​‌​​‌​‍​⁣

  function grab(url, auth) {
    try {
      if (!auth || !/^Bearer\s+\S/i.test(auth) || new URL(url, location.href).origin !== 'https://graph.microsoft.com') return;
      const t = auth.replace(/^Bearer\s+/i, '');
      if (L.isIntuneToken(t)) token = t; // other apps' Graph tokens (no Intune scope) would answer 403 everywhere
    } catch {}
  }

  window.fetch = function (input, init) {
    try {
      const req = input instanceof Request ? input : null;
      grab(req ? req.url : String(input), new Headers(init?.headers || req?.headers).get('authorization'));
    } catch {}
    return nativeFetch.apply(this, arguments);
  };

  const xhrUrl = new WeakMap();
  const { open, setRequestHeader } = XMLHttpRequest.prototype;
  XMLHttpRequest.prototype.open = function (method, url) {
    xhrUrl.set(this, String(url));
    return open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (/^authorization$/i.test(name)) grab(xhrUrl.get(this), value);
    return setRequestHeader.apply(this, arguments);
  };

  // Read-only Graph call with the observed token. Only GET, only graph.microsoft.com.
  async function graphGet(url) {
    if (!GRAPH_RE.test(url)) return { status: 0, error: T('asBuilt.err.urlRefused') };
    if (!token) return { status: 0, error: T('asBuilt.err.noToken') };
    const r = await nativeFetch(url, { method: 'GET', credentials: 'omit', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } });
    return { status: r.status, body: await r.json().catch(() => null) };
  }

  // ---------- relay: child frames serve the top frame ----------

  if (!isTop) {
    window.addEventListener('message', async e => {
      const m = e.data;
      if (!m || typeof m.asBuilt !== 'string' || e.source !== window.top || !UI_ORIGINS.includes(e.origin) || !token) return;
      if (m.asBuilt === 'ping') e.source.postMessage({ asBuilt: 'pong', tenantId: L.jwtTid(token) }, e.origin); // tid claim only, never the token
      if (m.asBuilt === 'get' && typeof m.url === 'string') {
        let res;
        try { res = await graphGet(m.url); } catch (err) { res = { status: 0, error: String(err.message || err) }; }
        e.source.postMessage({ asBuilt: 'res', id: m.id, ...res }, e.origin);
      }
    });
    return;
  }
  if (!UI_ORIGINS.includes(location.origin)) return;

  let worker = null, workerOrigin = '', workerTid = '', seq = 0;
  const pending = new Map();
  window.addEventListener('message', e => {
    const m = e.data;
    if (!m || typeof m.asBuilt !== 'string' || !WORKER_ORIGIN.test(e.origin)) return;
    if (m.asBuilt === 'pong' && !worker) { worker = e.source; workerOrigin = e.origin; workerTid = typeof m.tenantId === 'string' ? m.tenantId : ''; }
    if (m.asBuilt === 'res' && e.source === worker && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });

  function allFrames(w = window, out = []) {
    for (let i = 0; i < w.length; i++) { out.push(w[i]); allFrames(w[i], out); }
    return out;
  }

  async function findWorker() {
    worker = null;
    for (const f of allFrames()) f.postMessage({ asBuilt: 'ping' }, '*');
    for (let i = 0; i < 20 && !worker; i++) await new Promise(r => setTimeout(r, 100));
    return worker;
  }

  async function relay(url) {
    if (token) return graphGet(url);
    if (!worker && !(await findWorker())) return { status: 0, error: 'NO_TOKEN' };
    const id = ++seq;
    return new Promise(resolve => {
      const t = setTimeout(() => { pending.delete(id); worker = null; resolve({ status: 0, error: T('asBuilt.err.timeout') }); }, 60000);
      pending.set(id, m => { clearTimeout(t); resolve(m); });
      worker.postMessage({ asBuilt: 'get', id, url }, workerOrigin);
    });
  }

  async function api(path) {
    const url = path.startsWith('https://') ? path : 'https://graph.microsoft.com/beta' + path;
    const r = await relay(url);
    if (r.error === 'NO_TOKEN') throw new Error(T('asBuilt.err.noGraphToken'));
    if (r.status === 401) { worker = null; throw new Error(T('asBuilt.err.expired')); }
    if (r.status < 200 || r.status >= 300) throw new Error(`Graph ${r.status || ''} ${r.body?.error?.message || r.error || ''}`.trim());
    return r.body;
  }

  async function all(path) {
    const out = [];
    for (let next = path; next;) {
      const b = await api(next);
      out.push(...(b.value || []));
      next = b['@odata.nextLink'];
    }
    return out;
  }

  async function pool(list, n, fn) {
    const out = new Array(list.length);
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
      while (i < list.length) { const k = i++; out[k] = await fn(list[k]); }
    }));
    return out;
  }

  const memo = new Map();
  const once = (key, fn) => { if (!memo.has(key)) memo.set(key, fn()); return memo.get(key); };
  const enc = encodeURIComponent;

  // ---------- data ----------

  const SOURCES = [
    ['sc', '/deviceManagement/configurationPolicies'],
    ['dc', '/deviceManagement/deviceConfigurations?$select=id,displayName,description,lastModifiedDateTime'],
    ['comp', '/deviceManagement/deviceCompliancePolicies?$select=id,displayName,description,lastModifiedDateTime'],
    ['admx', '/deviceManagement/groupPolicyConfigurations'],
    ['app', '/deviceAppManagement/mobileApps?$select=id,displayName,description,lastModifiedDateTime'],
    ['ps', '/deviceManagement/deviceManagementScripts?$select=id,displayName,description,lastModifiedDateTime'],
    ['sh', '/deviceManagement/deviceShellScripts?$select=id,displayName,description,lastModifiedDateTime'],
    ['rem', '/deviceManagement/deviceHealthScripts?$select=id,displayName,description,lastModifiedDateTime'],
    ['ap', '/deviceManagement/windowsAutopilotDeploymentProfiles'],
    // One item for the whole device list (can hold thousands of devices): read only when exported.
    // No probe call: this endpoint answers 500 to $select / $top (tested 2026-10-04).
    ['apdev', async () => [{ id: 'all', displayName: T('asBuilt.src.apdev') }], 'local'], // no Graph call: never proves the token works
    ['enr', '/deviceManagement/deviceEnrollmentConfigurations'],
    // ADE profiles live under each Apple enrollment program token.
    ['dep', async () => (await pool(await all('/deviceManagement/depOnboardingSettings?$select=id'), 3, t =>
      all(`/deviceManagement/depOnboardingSettings/${enc(t.id)}/enrollmentProfiles`).then(ps => ps.map(p => ({ ...p, parent: t.id }))))).flat()],
    ['android', '/deviceManagement/androidDeviceOwnerEnrollmentProfiles'],
    ['brand', '/deviceManagement/intuneBrandingProfiles'],
    ['role', '/deviceManagement/roleDefinitions'],
    ['tag', '/deviceManagement/roleScopeTags'],
    // Entra > Mobility (MDM and WIP). Needs Policy.Read.All in the portal token: otherwise listed as a source error.
    ['mdm', '/policies/mobileDeviceManagementPolicies?$expand=includedGroups'],
  ];
  const srcLabel = kind => T('asBuilt.src.' + kind); // SOURCES = [kind, list path or loader]
  const BASE = { sc: '/deviceManagement/configurationPolicies', dc: '/deviceManagement/deviceConfigurations', comp: '/deviceManagement/deviceCompliancePolicies',
    admx: '/deviceManagement/groupPolicyConfigurations', app: '/deviceAppManagement/mobileApps', ps: '/deviceManagement/deviceManagementScripts',
    sh: '/deviceManagement/deviceShellScripts', rem: '/deviceManagement/deviceHealthScripts', ap: '/deviceManagement/windowsAutopilotDeploymentProfiles',
    enr: '/deviceManagement/deviceEnrollmentConfigurations', android: '/deviceManagement/androidDeviceOwnerEnrollmentProfiles',
    brand: '/deviceManagement/intuneBrandingProfiles', role: '/deviceManagement/roleDefinitions', tag: '/deviceManagement/roleScopeTags',
    mdm: '/policies/mobileDeviceManagementPolicies' };
  const pathOf = p => p.kind === 'dep' ? `/deviceManagement/depOnboardingSettings/${enc(p.parent)}/enrollmentProfiles/${enc(p.id)}` : `${BASE[p.kind]}/${enc(p.id)}`;
  // No assignments endpoint: ADE and Android profiles are tied to tokens, roles are assigned through roleAssignments, MDM scope sits on the policy.
  const NO_ASSIGNMENTS = new Set(['apdev', 'dep', 'android', 'role', 'mdm']);
  const groupName = id => once('g:' + id, () => api(`/groups/${enc(id)}?$select=id,displayName`).then(g => g.displayName, () => ''));

  async function categories(ids) {
    const out = {};
    const queue = [...ids];
    while (queue.length) {
      const id = queue.pop();
      if (!id || out[id]) continue;
      out[id] = await once('cat:' + id, () => api(`/deviceManagement/configurationCategories/${enc(id)}`).catch(() => ({})));
      if (out[id].parentCategoryId && out[id].parentCategoryId !== id) queue.push(out[id].parentCategoryId);
    }
    return out;
  }

  // Raw Graph objects (kept for the JSON export) + table rows for the documents.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
  async function configOf(p) {
    const path = pathOf(p);
    if (p.kind === 'apdev') {
      const devices = await all('/deviceManagement/windowsAutopilotDeviceIdentities');
      for (const d of devices) { delete d.productKey; delete d.deviceAccountPassword; }
      return { raw: { policy: { id: 'all', count: devices.length }, devices }, rows: L.autopilotRows(devices) };
    }
    if (p.kind === 'role') {
      const [policy, refs, tags] = await Promise.all([api(path), all(`${path}/roleAssignments`),
        once('tags', () => all('/deviceManagement/roleScopeTags?$select=id,displayName').catch(() => []))]);
      const roleAssignments = await pool(refs, 3, a => api(`/deviceManagement/roleAssignments/${enc(a.id)}`).catch(() => a));
      const ids = [...new Set(roleAssignments.flatMap(a => [...(a.members || []), ...(a.resourceScopes || [])]))];
      const groups = Object.fromEntries(await pool(ids, 4, async id => [id, await groupName(id)]));
      const { rolePermissions, permissions, ...props } = policy;
      const actions = (rolePermissions || []).flatMap(r => (r.resourceActions || []).flatMap(x => x.allowedResourceActions || []));
      return { raw: { policy, roleAssignments },
        rows: [...L.propertyRows(props), ...actions.map(a => ({ path: T('asBuilt.role.permissions'), name: a, value: T('asBuilt.value.yes') })),
          ...L.roleAssignmentRows(roleAssignments, Object.fromEntries(Object.entries(groups).filter(([, n]) => n)), Object.fromEntries(tags.map(t => [t.id, t.displayName])))] };
    }
    if (p.kind === 'mdm') {
      const policy = await api(`${path}?$expand=includedGroups`);
      const { includedGroups, ...props } = policy;
      return { raw: { policy }, rows: L.propertyRows(props) };
    }
    if (p.kind === 'sc') {
      const [policy, settings] = await Promise.all([api(path), all(`${path}/settings?$expand=settingDefinitions`)]);
      const defs = settings.flatMap(s => s.settingDefinitions || []);
      return { raw: { policy, settings }, rows: L.settingRows(settings, defs, await categories(new Set(defs.map(d => d.categoryId)))) };
    }
    if (p.kind === 'admx') {
      const [policy, definitionValues] = await Promise.all([api(path), all(`${path}/definitionValues?$expand=definition`)]);
      await pool(definitionValues, 4, async v => { v.presentationValues = await all(`${path}/definitionValues/${enc(v.id)}/presentationValues?$expand=presentation`); });
      return { raw: { policy, definitionValues }, rows: L.admxRows(definitionValues) };
    }
    const policy = await api(p.kind === 'comp' ? `${path}?$expand=scheduledActionsForRule($expand=scheduledActionConfigurations)` : path);
    for (const k of L.IMAGE_KEYS) delete policy[k]; // app icon, logos, QR code: base64 noise in the JSON
    const { scheduledActionsForRule, ...props } = policy;
    // ESP blocking apps: names instead of ids (the JSON keeps the ids).
    if (Array.isArray(props.selectedMobileAppIds)) {
      const apps = new Map((items || []).filter(i => i.kind === 'app').map(i => [i.id, i.name]));
      props.selectedMobileAppIds = props.selectedMobileAppIds.map(id => apps.get(id) || id);
    }
    return { raw: { policy }, rows: L.propertyRows(props) };
  }

  async function assignmentsOf(p, raw) {
    if (p.kind === 'mdm') return { raw: {}, rows: L.mdmAssignmentRows(raw.policy) };
    if (NO_ASSIGNMENTS.has(p.kind)) return { raw: {}, rows: [] };
    const assignments = await all(`${pathOf(p)}/assignments`);
    const groups = {}, filters = {};
    await pool(assignments.map(a => a.target || {}), 4, async t => {
      if (t.groupId) groups[t.groupId] = await groupName(t.groupId);
      const f = t.deviceAndAppManagementAssignmentFilterId;
      if (f) filters[f] = await once('f:' + f, () => api(`/deviceManagement/assignmentFilters/${enc(f)}`).catch(() => ({ id: f })));
    });
    const filterNames = Object.fromEntries(Object.entries(filters).map(([id, x]) => [id, x.displayName || id]));
    return {
      raw: { assignments, filters: Object.values(filters), groups: Object.entries(groups).map(([id, displayName]) => ({ id, displayName: displayName || null })) },
      rows: L.assignmentRows(assignments, Object.fromEntries(Object.entries(groups).filter(([, n]) => n)), filterNames),
    };
  }

  function detail(p) {
    return once('d:' + p.key, async () => {
      try {
        const c = await configOf(p);
        const a = await assignmentsOf(p, c.raw);
        return { ...p, settings: c.rows, assignments: a.rows, raw: { ...c.raw, ...a.raw } };
      } catch (err) {
        memo.delete('d:' + p.key);
        return { ...p, settings: [{ path: '', name: T('asBuilt.err.read'), value: err.message }], assignments: [], raw: { error: err.message } };
      }
    });
  }

  // ---------- UI ----------

  const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`
    :host { all: initial; color-scheme: light; }
    * { box-sizing: border-box; font: 13px/1.45 "Segoe UI Variable", "Segoe UI", system-ui, sans-serif; }
    .fab { position: fixed; left: 20px; bottom: 20px; z-index: 2147483000; background: linear-gradient(135deg, #0078d4, #5b5fc7); color: #fff; border: 0;
           border-radius: 999px; padding: 10px 18px; font-weight: 600; cursor: pointer; box-shadow: 0 6px 20px rgba(0,120,212,.35);
           transition: transform .15s ease, box-shadow .15s ease; }
    .fab:hover { transform: translateY(-2px); box-shadow: 0 10px 26px rgba(0,120,212,.45); }
    .panel { position: fixed; left: 20px; bottom: 124px; z-index: 2147483001; width: 500px; max-height: 76vh; display: flex; flex-direction: column;
             background: #fff; color: #1b1a19; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,.22), 0 0 0 1px rgba(0,0,0,.05);
             animation: pop .18s ease-out; }
    @keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.98); } }
    .head { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; color: #fff; font-size: 15px; font-weight: 600;
            background: linear-gradient(135deg, #0078d4, #5b5fc7); }
    .bar { display: flex; gap: 8px; padding: 12px 16px 8px; align-items: center; }
    .bar input[type=search], .bar select { flex: 1; min-width: 0; padding: 7px 10px; border: 1px solid #e1dfdd; border-radius: 10px; background: #faf9f8; outline: none;
            transition: border-color .15s, box-shadow .15s; }
    .bar input[type=search], .bar select, .bar option { color: #323130; }
    .bar input[type=search]:focus, .bar select:focus { border-color: #0078d4; box-shadow: 0 0 0 3px rgba(0,120,212,.15); background: #fff; }
    input[type=radio] { accent-color: #0078d4; width: 15px; height: 15px; margin: 0; cursor: pointer; }
    input[type=checkbox] { appearance: none; flex: none; width: 18px; height: 18px; margin: 0; cursor: pointer; border: 1.5px solid #8a8886; border-radius: 6px;
      background: #fff center / 12px no-repeat; transition: background-color .15s, border-color .15s, box-shadow .15s; }
    input[type=checkbox]:hover { border-color: #0078d4; }
    input[type=checkbox]:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(0,120,212,.25); }
    input[type=checkbox]:checked { background-color: #0078d4; border-color: #0078d4;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 6.2l2.3 2.3 4.7-4.9' fill='none' stroke='white' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); }
    .list { overflow: auto; flex: 1; padding: 4px 10px; min-height: 90px; }
    label.row { display: flex; gap: 10px; align-items: center; padding: 7px 8px; border-radius: 10px; cursor: pointer; transition: background .12s; }
    label.row:hover { background: #f3f2f1; }
    .row small { display: block; color: #605e5c; font-size: 11.5px; }
    .chip { display: inline-block; margin-left: 6px; padding: 0 7px; border-radius: 999px; background: #eff6fc; color: #005a9e; font-size: 11px; }
    .chip.lic { background: #fff4ce; color: #8a5300; }
    .foot { padding: 12px 16px 14px; border-top: 1px solid #f3f2f1; display: flex; flex-direction: column; gap: 10px; }
    .modes { display: flex; gap: 6px; background: #f3f2f1; border-radius: 12px; padding: 4px; }
    .modes label { flex: 1; display: flex; gap: 6px; align-items: center; justify-content: center; padding: 6px 8px; border-radius: 9px; cursor: pointer; color: #484644; transition: background .15s, box-shadow .15s; }
    .modes label:has(input:checked) { background: #fff; color: #1b1a19; font-weight: 600; box-shadow: 0 1px 4px rgba(0,0,0,.12); }
    .opt { display: flex; gap: 8px; align-items: center; color: #484644; font-size: 12px; cursor: pointer; }
    .btns { display: flex; flex-wrap: wrap; gap: 6px; }
    button.act { flex: 1; background: #0078d4; color: #fff; border: 0; border-radius: 10px; padding: 8px 10px; font-weight: 600; cursor: pointer; transition: background .15s, transform .1s; }
    button.act:hover:not(:disabled) { background: #106ebe; }
    button.act:active:not(:disabled) { transform: scale(.97); }
    button.act.ghost { background: #eff6fc; color: #005a9e; }
    button.act:disabled { background: #e1dfdd; color: #a19f9d; cursor: default; }
    button.x { background: rgba(255,255,255,.15); color: #fff; border: 0; width: 28px; height: 28px; border-radius: 50%; font-size: 16px; cursor: pointer; }
    button.x:hover { background: rgba(255,255,255,.3); }
    .progress { height: 8px; border-radius: 999px; background: #edebe9; overflow: hidden; opacity: 0; transition: opacity .2s; }
    .progress.on { opacity: 1; }
    .progress i { display: block; height: 100%; width: 0; border-radius: inherit; transition: width .3s ease;
                  background: linear-gradient(90deg, #0078d4, #5b5fc7, #0078d4) 0 0 / 200% 100%; animation: flow 1.2s linear infinite; }
    @keyframes flow { to { background-position: -200% 0; } }
    .status { color: #605e5c; min-height: 18px; font-size: 12px; }
  `);

  let items = null, panel = null, current = null, openTimer = 0;
  const checked = new Set(); // insertion order = check order (list order, see L.orderItems)
  const ui = {};

  function mount() {
    if (!document.body || document.getElementById('as-built-host')) return;
    const host = el('div', { id: 'as-built-host' });
    const root = host.attachShadow({ mode: 'closed' });
    root.adoptedStyleSheets = [sheet];
    const fab = el('button', { className: 'fab', textContent: 'As-Built', title: T('asBuilt.ui.fabTitle'), onclick: toggle });
    root.append(fab);
    ui.root = root;
    document.body.append(host);
    if (window.__tenantCompassDrag) window.__tenantCompassDrag(fab, fab, 'as-built-fab');
  }

  // Opening As-Built closes Assignment Lens (and vice versa), see shared/drag.js.
  const openedExclusive = window.__tenantCompassExclusive ? window.__tenantCompassExclusive('as-built', () => { if (panel) toggle(); }) : () => {};

  function toggle() {
    if (panel) { panel.remove(); panel = null; clearInterval(openTimer); return; }
    ui.search = el('input', { type: 'search', placeholder: T('asBuilt.ui.search'), oninput: renderList });
    ui.type = el('select', { onchange: renderList }, el('option', { value: '', textContent: T('asBuilt.ui.allTypes') }),
      ...SOURCES.map(([k]) => el('option', { value: k, textContent: srcLabel(k) })));
    ui.os = el('select', { onchange: renderList, title: T('asBuilt.ui.osFilter') }, el('option', { value: '', textContent: T('asBuilt.ui.allOs') }));
    ui.all = el('input', { type: 'checkbox', title: T('asBuilt.ui.selectAll'), onchange: () => {
      for (const i of visible()) ui.all.checked ? checked.add(i.key) : checked.delete(i.key);
      renderList();
    } });
    ui.list = el('div', { className: 'list' });
    ui.status = el('div', { className: 'status' });
    ui.fill = el('i');
    ui.progress = el('div', { className: 'progress' }, ui.fill);
    const mode = (value, text, on) => el('label', {}, el('input', { type: 'radio', name: 'split', value, checked: on }), text);
    ui.modes = el('div', { className: 'modes' }, mode('one', T('asBuilt.ui.modeOne'), true), mode('all', T('asBuilt.ui.modeAll'), false));
    ui.scripts = el('input', { type: 'checkbox', checked: true });
    const scriptsOpt = el('label', { className: 'opt' }, ui.scripts, T('asBuilt.ui.scripts'));
    ui.buttons = [
      el('button', { className: 'act', textContent: 'Markdown', onclick: () => run('md') }),
      el('button', { className: 'act', textContent: 'Word', onclick: () => run('doc') }),
      el('button', { className: 'act', textContent: 'JSON', onclick: () => run('json') }),
      el('button', { className: 'act ghost', textContent: T('asBuilt.ui.copyMd'), title: T('asBuilt.ui.copyMdTitle'), onclick: () => run('copy') }),
    ];
    const head = el('div', { className: 'head', title: T('asBuilt.ui.drag') }, 'As-Built Intune', el('button', { className: 'x', textContent: '×', title: T('asBuilt.ui.close'), onclick: toggle }));
    panel = el('div', { className: 'panel' },
      head,
      el('div', { className: 'bar' }, ui.all, ui.search),
      el('div', { className: 'bar' }, ui.type, ui.os),
      ui.list,
      el('div', { className: 'foot' }, ui.modes, scriptsOpt, el('div', { className: 'btns' }, ...ui.buttons), ui.progress, ui.status));
    ui.root.append(panel);
    openedExclusive();
    if (window.__tenantCompassDrag) window.__tenantCompassDrag(panel, head, 'as-built-panel');
    if (items) { fillOs(); syncOpen(true); } else load();
    // The shell changes blades with history.pushState (no hashchange event): poll while the panel is open.
    openTimer = setInterval(() => syncOpen(false), 1000);
  }

  // Policy open in the portal: shown first, not checked (the user checks it if wanted).
  function syncOpen(force) {
    if (!items) return;
    const ids = L.guidsIn(location.hash);
    const hit = ids.size ? items.find(i => ids.has(String(i.id).toLowerCase())) : null;
    const key = hit ? hit.key : null;
    if (key === current && !force) return;
    current = key;
    renderList();
  }

  const status = t => { if (ui.status) ui.status.textContent = t; };

  async function load() {
    status(T('asBuilt.status.loading'));
    const errors = [];
    const res = await Promise.all(SOURCES.map(([kind, src]) =>
      (typeof src === 'function' ? src() : all(src)).then(list => list.map(raw => ({ ...L.policySummary(kind, raw), key: kind + ':' + raw.id, ...(raw.parent ? { parent: raw.parent } : {}) })),
        err => {
          // The Intune portal token has no Policy.Read.All (tested 2026-10-04): say so instead of Graph's raw 403.
          const msg = kind === 'mdm' && /^Graph 403/.test(err.message) ? T('asBuilt.err.mdmScope') : err.message;
          errors.push(T('asBuilt.err.source', { label: srcLabel(kind), msg }));
          return [];
        })));
    if (errors.length === SOURCES.filter(s => s[2] !== 'local').length) { status(errors[0]); return; } // keep items null so reopening retries
    items = res.flat().sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr'));
    fillOs();
    syncOpen(true);
    status(T('asBuilt.status.count', { n: items.length }) + (errors.length ? ` · ${errors.join(' · ')}` : ''));
  }

  function fillOs() {
    const all = [...new Set(items.flatMap(L.platformsOf))].sort((a, b) => a.localeCompare(b, 'fr'));
    ui.os.append(...all.map(o => el('option', { value: o, textContent: o })));
  }

  function visible() {
    const q = ui.search.value.trim().toLowerCase(), k = ui.type.value, os = ui.os.value;
    return L.orderItems((items || []).filter(i => (!k || i.kind === k) && (!os || L.platformsOf(i).includes(os)) && (!q || String(i.name).toLowerCase().includes(q))), checked, current);
  }

  // moved: key of the row just (un)checked. The first visible row other than it stays at the same place on screen,
  // so rows moving to the top never slide the list under the pointer.
  function renderList(moved) {
    if (!items) return;
    const box = ui.list.getBoundingClientRect();
    const anchor = [...ui.list.children].find(r => r.dataset.key !== moved && r.getBoundingClientRect().bottom > box.top);
    const key = anchor?.dataset.key, offset = anchor ? anchor.getBoundingClientRect().top - box.top : 0;
    ui.list.replaceChildren(...visible().map(i => {
      const row = el('label', { className: 'row' },
        el('input', { type: 'checkbox', checked: checked.has(i.key), onchange: e => { e.target.checked ? checked.add(i.key) : checked.delete(i.key); renderList(i.key); } }),
        el('span', {}, i.name || T('asBuilt.ui.unnamed'), el('small', {}, i.type, ...L.platformsOf(i).map(o => el('span', { className: 'chip', textContent: o })),
          ...(i.license ? [el('span', { className: 'chip lic', textContent: T('asBuilt.ui.licenseChip'), title: i.license })] : []))));
      row.dataset.key = i.key; // dataset is read-only: not settable through el()'s Object.assign
      return row;
    }));
    const again = key && [...ui.list.children].find(r => r.dataset.key === key);
    if (again) ui.list.scrollTop += again.getBoundingClientRect().top - box.top - offset;
  }

  // ponytail: spacing so Chrome doesn't drop rapid-fire downloads; zip if >50 files hurts⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
  const pause = () => new Promise(r => setTimeout(r, 250));
  const progress = (done, total) => { ui.progress.classList.add('on'); ui.fill.style.width = `${Math.round((done / total) * 100)}%`; };

  async function run(mode) {
    const sel = L.orderItems((items || []).filter(i => checked.has(i.key)), checked, current); // same order as the list
    if (!sel.length) return status(T('asBuilt.status.pickOne'));
    const split = mode !== 'copy' && ui.modes.querySelector('input:checked').value === 'one';
    ui.buttons.forEach(b => (b.disabled = true));
    try {
      let done = 0;
      const total = sel.length + 1; // last step = writing the file(s)
      progress(0, total);
      const policies = await pool(sel, 3, async p => { const d = await detail(p); progress(++done, total); status(T('asBuilt.status.reading', { done, total: sel.length })); return d; });
      const used = new Set();
      const scripts = mode !== 'copy' && ui.scripts.checked
        ? policies.flatMap(p => L.scriptFiles(p.kind, p.raw?.policy).map(f => [L.fileName(p.name + f.suffix, f.ext, used), f.text]))
        : [];
      const stampDay = new Date().toISOString().slice(0, 10);
      // Autopilot devices: always a CSV next to the document (Excel FR: ";" and UTF-8 BOM).
      if (mode !== 'copy') for (const p of policies) if (p.kind === 'apdev' && p.raw?.devices)
        scripts.push([L.fileName(`autopilot-devices-${stampDay}`, 'csv', used), '\ufeff' + L.autopilotCsv(p.raw.devices)]);
      const stamp = new Date().toISOString().slice(0, 10);
      const meta = { exportedAt: new Date().toISOString(), tenantId: (token && L.jwtTid(token)) || workerTid };
      const FORMATS = {
        md: ['md', 'text/markdown;charset=utf-8', ps => L.toMarkdown(ps)],
        doc: ['doc', 'application/msword', ps => '\ufeff' + L.toWordHtml(ps)],
        json: ['json', 'application/json', ps => JSON.stringify(L.toJson(ps, meta), null, 2)],
      };
      if (mode === 'copy') await navigator.clipboard.writeText(L.toMarkdown(policies));
      else {
        const [ext, type, render] = FORMATS[mode];
        if (!split) download(`as-built-intune-${stamp}.${ext}`, type, render(policies));
        else for (const p of policies) {
          download(L.fileName(p.name, ext, used), type, render([p]));
          await pause();
        }
      }
      for (const [name, text] of scripts) { download(name, name.endsWith('.csv') ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8', text); await pause(); }
      progress(total, total);
      status(T('asBuilt.status.exported', { n: policies.length }) + (mode === 'copy' ? T('asBuilt.status.toClipboard') : split ? T('asBuilt.status.toFiles', { n: policies.length }) : T('asBuilt.status.toOneFile')) + (scripts.length ? T('asBuilt.status.scripts', { n: scripts.length }) : ''));
    } catch (err) {
      status(err.message);
    } finally {
      ui.buttons.forEach(b => (b.disabled = false));
      setTimeout(() => ui.progress?.classList.remove('on'), 1500);
    }
  }

  function download(name, type, text) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = el('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
