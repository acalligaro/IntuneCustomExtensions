// Pure helpers shared by page.js (MAIN world) and test.js. Wrapped to avoid clobbering portal globals.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
(() => {
  const GUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

  // Graph collections we can analyse. `peers` = families compared for overlaps. Labels: assignmentLens.family.<key> in i18n.js.
  const CONFIG = ['configurationPolicies', 'deviceConfigurations', 'groupPolicyConfigurations'];
  const FAMILIES = {
    configurationPolicies: { path: 'deviceManagement/configurationPolicies', peers: CONFIG },
    deviceConfigurations: { path: 'deviceManagement/deviceConfigurations', peers: CONFIG },
    groupPolicyConfigurations: { path: 'deviceManagement/groupPolicyConfigurations', peers: CONFIG },
    deviceCompliancePolicies: { path: 'deviceManagement/deviceCompliancePolicies', peers: ['deviceCompliancePolicies'] },
    mobileApps: { path: 'deviceAppManagement/mobileApps', peers: ['mobileApps'] },
  };

  // Matches absolute Graph URLs and the relative URLs found in $batch bodies; "/{id}" and "('{id}')" forms.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
  const REF = new RegExp(
    `^(?:https://graph\\.microsoft\\.com)?/?(?:(?:beta|v1\\.0)/)?(?:deviceManagement|deviceAppManagement)/(${Object.keys(FAMILIES).join('|')})(?:/|\\(')(${GUID})(?:'\\))?(?=[/?#]|$)`,
    'i');

  function parsePolicyRef(url) {
    if (typeof url !== 'string') return null;
    let u;
    try { u = decodeURIComponent(url); } catch { u = url; }
    const m = REF.exec(u);
    if (!m) return null;
    const family = Object.keys(FAMILIES).find(f => f.toLowerCase() === m[1].toLowerCase());
    return { family, id: m[2].toLowerCase() };
  }

  // Portal blade URL: ".../PolicySummaryBlade/policyId/{id}/..." or ".../appId/{id}/...". family null = unknown, probe Graph.
  const HASH = new RegExp(`/(policyId|appId)/(${GUID})(?=[/?]|$)`, 'i');
  function parseHashRef(hash) {
    let h;
    try { h = decodeURIComponent(String(hash || '')); } catch { h = String(hash || ''); }
    const m = HASH.exec(h);
    if (!m) return null;
    return { family: /^appId$/i.test(m[1]) ? 'mobileApps' : null, id: m[2].toLowerCase() };
  }

  // The shell hands tokens to its extension Web Worker over MessagePort. Returns "Bearer <jwt>" for a Graph token found
  // in a message (strings at most 6 levels deep), or null. Only the aud/exp claims are read, the signature is not checked.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
  function graphTokenIn(data, now = Date.now()) {
    let found = null;
    let budget = 2000; // ponytail: caps the walk on big data messages; tokens sit near the top of token replies
    (function walk(v, d) {
      if (found || d > 6 || v == null || --budget < 0) return;
      if (typeof v === 'string') {
        const m = /^(?:Bearer\s+)?(eyJ[\w-]+\.(eyJ[\w-]+)\.[\w-]+)$/.exec(v);
        if (!m) return;
        try {
          const b = m[2].replace(/-/g, '+').replace(/_/g, '/');
          const c = JSON.parse(atob(b + '='.repeat((4 - b.length % 4) % 4)));
          if (/^https:\/\/graph\.microsoft\.com\/?$/.test(c.aud) && c.exp * 1000 > now) found = 'Bearer ' + m[1];
        } catch {}
        return;
      }
      if (typeof v === 'object' && !ArrayBuffer.isView(v) && !(v instanceof ArrayBuffer)) for (const k in v) walk(v[k], d + 1);
    })(data, 0);
    return found;
  }

  const T = '#microsoft.graph.';

  // Group id, or a pseudo id for the virtual targets; null for targets we do not model (e.g. ConfigMgr collections).
  function targetKey(target) {
    const t = target?.['@odata.type'];
    if (t === T + 'allLicensedUsersAssignmentTarget') return 'allUsers';
    if (t === T + 'allDevicesAssignmentTarget') return 'allDevices';
    return target?.groupId || null;
  }

  function filterOf(target) {
    const id = target?.deviceAndAppManagementAssignmentFilterId;
    const mode = target?.deviceAndAppManagementAssignmentFilterType;
    if (!id || !mode || mode === 'none' || /^0{8}-/.test(id)) return null;
    return { id, mode };
  }

  function summarizeAssignments(assignments) {
    const out = { include: [], exclude: [], allUsers: false, allDevices: false, filters: [] };
    for (const a of assignments || []) {
      const t = a?.target;
      const key = targetKey(t);
      if (!key) continue;
      const filter = filterOf(t);
      if (filter) out.filters.push({ target: key, ...filter });
      if (key === 'allUsers' || key === 'allDevices') { out[key] = true; continue; }
      const entry = { groupId: key };
      if (a.intent) entry.intent = a.intent; // mobileApps only: required / available / uninstall...
      (t['@odata.type'] === T + 'exclusionGroupAssignmentTarget' ? out.exclude : out.include).push(entry);
    }
    return out;
  }

  // otherPolicies: [{ name|displayName, assignments: [...] }]. currentKeys may contain 'allUsers' / 'allDevices'.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
  function findOverlaps(currentKeys, otherPolicies) {
    const keys = new Set(currentKeys);
    const out = [];
    for (const p of otherPolicies || []) {
      for (const a of p?.assignments || []) {
        const key = targetKey(a?.target);
        if (!key || !keys.has(key)) continue;
        const mode = a.target['@odata.type'] === T + 'exclusionGroupAssignmentTarget' ? 'exclude' : 'include';
        out.push({ policyName: p.displayName || p.name || p.id || '?', groupId: key, mode });
      }
    }
    return out;
  }

  const api = { FAMILIES, parsePolicyRef, parseHashRef, graphTokenIn, targetKey, summarizeAssignments, findOverlaps };
  globalThis.AssignmentLensLib = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
