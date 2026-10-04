// Pure helpers shared by the MAIN-world hook, the content script, the journal page and test.js.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
// Wrapped in an IIFE: this file also runs in the portal's own JS realm, where top-level names could clash with the page's.
(() => {
  // Graph collections whose items are tracked as "policies".
  // ponytail: fixed list, extend when a policy type is reported missing from the journal.
  const COLLECTIONS = {
    deviceManagement: [
      'configurationPolicies', 'compliancePolicies', 'deviceConfigurations', 'deviceCompliancePolicies',
      'groupPolicyConfigurations', 'intents', 'deviceManagementScripts', 'deviceHealthScripts', 'deviceShellScripts',
      'windowsFeatureUpdateProfiles', 'windowsQualityUpdateProfiles', 'windowsDriverUpdateProfiles',
      'deviceEnrollmentConfigurations', 'windowsAutopilotDeploymentProfiles', 'assignmentFilters',
    ],
    deviceAppManagement: [
      'iosManagedAppProtections', 'androidManagedAppProtections', 'windowsManagedAppProtections',
      'targetedManagedAppConfigurations', 'mobileAppConfigurations',
    ],
  };

  // Sub-resources whose GET responses feed the "before" snapshot.
  const READ_SUBS = ['', 'settings', 'assignments', 'definitionValues', 'scheduledActionsForRule'];
  const NESTED = /^(\w+)\/([^/]+)\/(\w+)$/; // e.g. definitionValues/{id}/presentationValues

  // https://graph.microsoft.com/beta/deviceManagement/configurationPolicies/{id}/settings -> { type, id, sub }
  function parsePolicyRef(url) {
    let u;
    try { u = new URL(url); } catch { return null; }
    if (u.protocol !== 'https:' || u.hostname !== 'graph.microsoft.com') return null;
    // OData key syntax used by the portal: configurationPolicies('id') -> configurationPolicies/id⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
    const path = u.pathname.replace(/\/(\w+)\((?:'|%27)([^'/%]+)(?:'|%27)\)/g, '/$1/$2');
    const m = /^\/(?:beta|v1\.0)\/(deviceManagement|deviceAppManagement)\/(\w+)(?:\/([^/]+))?(?:\/(.*))?$/.exec(path);
    if (!m || !COLLECTIONS[m[1]].includes(m[2])) return null;
    let id = null;
    if (m[3]) {
      try { id = decodeURIComponent(m[3]); } catch { return null; }
      if (/[()$]|^microsoft\.graph\./i.test(id)) return null; // functions, casts, $count
    }
    const sub = (m[4] || '').replace(/\/+$/, '').replace(/(^|\/)microsoft\.graph\./g, '$1');
    return { type: m[2], id, sub };
  }

  // JSON $batch call -> one observation per sub-request, URLs made absolute against the batch endpoint version.
  function expandBatch(batchUrl, reqBody, resBody) {
    const m = /^https:\/\/graph\.microsoft\.com\/(beta|v1\.0)\/\$batch\b/i.exec(batchUrl || '');
    const reqs = reqBody && Array.isArray(reqBody.requests) ? reqBody.requests : [];
    const ress = resBody && Array.isArray(resBody.responses) ? resBody.responses : [];
    if (!m) return [];
    const out = [];
    for (const r of reqs) {
      if (!r || typeof r.url !== 'string' || typeof r.method !== 'string') continue;
      const res = ress.find(x => x && String(x.id) === String(r.id));
      if (!res || !Number.isInteger(res.status)) continue;
      const url = /^https:/i.test(r.url) ? r.url : `https://graph.microsoft.com/${m[1]}/${r.url.replace(/^\/+/, '')}`;
      const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : null;
      out.push({ method: r.method.toUpperCase(), url, status: res.status, reqBody: obj(r.body), resBody: obj(res.body) });
    }
    return out;
  }

  function isTrackedRead(ref) {
    return !!ref && !!ref.id && (READ_SUBS.includes(ref.sub) || /^definitionValues\/[^/]+\/presentationValues$/.test(ref.sub));
  }

  // Fields that change on every save, read-only expansions, and OData annotations (except type and bind).
  const VOLATILE = new Set(['lastModifiedDateTime', 'version', 'settingCount', 'settingDefinitions']);
  const SECRET_KEY = /(password|secret|presharedkey|passphrase)$/i;

  // Returns a copy without volatile fields. Also masks secret-looking string values so they never reach storage.
  function stripVolatile(v) {
    if (Array.isArray(v)) return v.map(stripVolatile);
    if (!v || typeof v !== 'object') return v;
    const secretValue = typeof v['@odata.type'] === 'string' && /SecretSettingValue$/.test(v['@odata.type']);
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (VOLATILE.has(k) || /@odata\.(?!type$|bind$)/.test(k)) continue;
      const secret = SECRET_KEY.test(k) || (secretValue && k === 'value');
      out[k] = secret && typeof x === 'string' && x ? '[masqué]' : stripVolatile(x);
    }
    return out;
  }

  // Merges a GET response into the cached snapshot of a policy.
  function applyRead(snap, ref, body, url) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return snap;
    if (ref.sub === '') return { ...snap, ...body };
    if (!Array.isArray(body.value)) return snap;
    const nested = NESTED.exec(ref.sub);
    if (nested) {
      const [, coll, iid, prop] = nested;
      const list = snap && snap[coll];
      if (!Array.isArray(list)) return snap;
      return { ...snap, [coll]: list.map(x => x && x.id === iid ? { ...x, [prop]: body.value } : x) };
    }
    const paged = /[?&]\$skip(token)?=/i.test(url || '');
    const prev = paged && snap && Array.isArray(snap[ref.sub]) ? snap[ref.sub] : [];
    return { ...snap, [ref.sub]: [...prev, ...body.value] };
  }

  function upsert(list, items, keyOf) {
    const out = [...(list || [])];
    for (const it of items || []) {
      const i = out.findIndex(x => x && keyOf(x) != null && keyOf(x) === keyOf(it));
      if (i >= 0) out[i] = { ...out[i], ...it }; else out.push(it);
    }
    return out;
  }

  // Predicts the policy state after a successful write, from the state before and the request body.
  // Returns null for a deletion, undefined when the call is not a policy write.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
  function applyWrite(base, ref, method, body) {
    const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const s = base || {};
    const { sub } = ref;
    if (!ref.id) return method === 'POST' && sub === '' ? b : undefined; // creation
    if (sub === '') return method === 'DELETE' ? null : { ...s, ...b }; // PATCH/PUT
    if (sub === 'assign') {
      // { assignments } for most types, { deviceHealthScriptAssignments } etc. for scripts: take the shortest *assignments key.
      const k = Object.keys(b).filter(x => /assignments$/i.test(x) && Array.isArray(b[x])).sort((x, y) => x.length - y.length)[0];
      return { ...s, assignments: k ? b[k] : [] };
    }
    if (sub === 'updateSettings') return { ...s, settings: upsert(s.settings, b.settings, x => x.definitionId) };
    if (sub === 'updateDefinitionValues') {
      const del = new Set(b.deletedIds || []);
      const kept = (s.definitionValues || []).filter(x => !(x && del.has(x.id)));
      return { ...s, definitionValues: [...upsert(kept, b.updated, x => x.id), ...(b.added || [])] };
    }
    const item = /^(\w+)\/([^/]+)$/.exec(sub);
    if (item) {
      const [, coll, iid] = item;
      const list = Array.isArray(s[coll]) ? s[coll] : [];
      if (method === 'DELETE') return { ...s, [coll]: list.filter(x => !(x && x.id === iid)) };
      return { ...s, [coll]: list.some(x => x && x.id === iid) ? list.map(x => x && x.id === iid ? { ...x, ...b } : x) : [...list, { id: iid, ...b }] };
    }
    if (method === 'POST' && READ_SUBS.includes(sub)) return { ...s, [sub]: [...(Array.isArray(s[sub]) ? s[sub] : []), b] };
    if (method === 'DELETE') return undefined;
    return { ...s, [sub]: b }; // other actions (e.g. scheduleActionsForRules): record the action body as a pseudo-field
  }

  // Identity of an array item across before/after: Settings Catalog setting, intent setting, assignment target, id.
  function arrayKey(x) {
    if (!x || typeof x !== 'object') return undefined;
    if (x.settingInstance && x.settingInstance.settingDefinitionId) return x.settingInstance.settingDefinitionId;
    if (x.definitionId) return x.definitionId;
    if (x.target && typeof x.target === 'object') return x.target.groupId || x.target['@odata.type'];
    return x.id;
  }

  // Map key -> item, or null when an item has no key or keys collide (then arrays are compared by index).
  function keyed(arr) {
    const m = new Map();
    for (const x of arr) {
      const k = arrayKey(x);
      if (k == null || m.has(String(k))) return null;
      m.set(String(k), x);
    }
    return m;
  }

  const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v);

  // Server-side fields of an assignment: present in GET, absent or blank in the portal's /assign body.
  const ASSIGNMENT_SERVER_KEYS = ['id', 'source', 'sourceId'];
  const ASSIGNMENT_ITEM = /(^|\.)assignments\[[^\]]*\]$/;

  function jsonDiff(before, after, path = '', out = []) {
    if (before === after) return out;
    if (before == null && after == null) return out; // null vs missing: same thing in Graph
    if (Array.isArray(before) && Array.isArray(after)) {
      const a = keyed(before), b = keyed(after);
      if (a && b) {
        for (const [k, v] of a) jsonDiff(v, b.get(k), `${path}[${k}]`, out);
        for (const [k, v] of b) if (!a.has(k)) jsonDiff(undefined, v, `${path}[${k}]`, out);
      } else {
        for (let i = 0; i < Math.max(before.length, after.length); i++) jsonDiff(before[i], after[i], `${path}[${i}]`, out);
      }
      return out;
    }
    if (isPlain(before) && isPlain(after)) {
      const skip = ASSIGNMENT_ITEM.test(path) ? ASSIGNMENT_SERVER_KEYS : [];
      for (const k of new Set([...Object.keys(before), ...Object.keys(after)]))
        if (!skip.includes(k)) jsonDiff(before[k], after[k], path ? `${path}.${k}` : k, out);
      return out;
    }
    if (before === undefined) out.push({ path, op: 'add', to: after });
    else if (after === undefined) out.push({ path, op: 'remove', from: before });
    else out.push({ path, op: 'change', from: before, to: after });
    return out;
  }

  // Reads the actor claims of a bearer token. Decoding only: the signature is not (and need not be) verified.
  function jwtClaims(token) {
    try {
      const p = String(token).replace(/^Bearer\s+/i, '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const bin = atob(p.padEnd(Math.ceil(p.length / 4) * 4, '='));
      const c = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, ch => ch.charCodeAt(0))));
      const s = v => typeof v === 'string' && v ? v : null;
      return { upn: s(c.upn) || s(c.unique_name) || s(c.preferred_username), tid: s(c.tid) };
    } catch {
      return null;
    }
  }

  function formatValue(v, max = 200) {
    if (v === undefined) return '∅';
    const s = JSON.stringify(v);
    return s.length > max ? s.slice(0, max) + '…' : s;
  }

  const CSV_COLS = ['ts', 'tenantId', 'user', 'policyType', 'policyId', 'policyName', 'method', 'url', 'ticket', 'comment', 'diff', 'env'];

  function csvCell(v) {
    let s = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // keep spreadsheets from evaluating formulas
    return /[";,\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  // Semicolon-separated: the default list separator of French Excel.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
  function toCsv(entries) {
    return [CSV_COLS, ...entries.map(e => CSV_COLS.map(c => e[c]))].map(r => r.map(csvCell).join(';')).join('\r\n');
  }

  // Auto-delete: entries older than `days` (setting snapshot.retentionDays, default 14) are removed when the journal is purged.
  const RETENTION_DAYS = 14;
  const retentionDays = v => Number.isInteger(v) && v >= 1 && v <= 3650 ? v : RETENTION_DAYS;
  const isExpired = (ts, now = Date.now(), days = RETENTION_DAYS) => !(now - Date.parse(ts) < retentionDays(days) * 864e5); // unreadable ts: expired too

  const api = { RETENTION_DAYS, retentionDays, isExpired, parsePolicyRef, expandBatch, isTrackedRead, stripVolatile, applyRead, applyWrite, jsonDiff, jwtClaims, formatValue, toCsv };
  if (typeof module === 'object' && module && typeof module.exports === 'object') module.exports = api; // node (test.js)
  globalThis.__changeSnapshotLib = api; // always: a stray `module` global must not hide the lib from the page
})();
