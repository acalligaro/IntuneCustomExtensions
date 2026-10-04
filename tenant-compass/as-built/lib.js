// Pure helpers shared by page.js (MAIN world) and test.js. Wrapped so nothing leaks into the portal's globals except AsBuiltLib.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
(function () {
  // i18n: __tenantCompassI18n (page) read at call time; without it (Node tests) the inline French default. Keep in sync with i18n.js fr.
  const T = (key, fr, vars) => {
    const s = globalThis.__tenantCompassI18n ? globalThis.__tenantCompassI18n.t(key) : fr;
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
  };

  function htmlEscape(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  // Markdown table cell: escape backslash and pipe, neutralise inline HTML (& and < suffice), newlines become <br>.
  function mdEscapeCell(s) {
    return String(s ?? '')
      .replace(/\\/g, '\\\\').replace(/\|/g, '\\|')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/\r?\n|\r/g, '<br>');
  }

  function fmtDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
  }

  // ---------- policy summaries (list endpoints) ----------

  const PLATFORMS = { windows10: 'Windows', windows10X: 'Windows', macOS: 'macOS', iOS: 'iOS/iPadOS', android: 'Android', androidEnterprise: 'Android Enterprise', aosp: 'Android (AOSP)', linux: 'Linux', visionOS: 'visionOS', tvOS: 'tvOS' };

  function odataName(o) {
    return String(o?.['@odata.type'] || '').replace(/^#?microsoft\.graph\./, '');
  }

  // ponytail: prefix heuristic on the derived type name, extend if a new platform family shows up as "?".
  function platformFromType(name) {
    const n = name.toLowerCase().replace(/^(managed|dep)/, ''); // depIOSEnrollmentProfile, depMacOSEnrollmentProfile
    if (n.startsWith('win') || n === 'officesuiteapp' || n === 'microsoftstoreforbusinessapp') return 'Windows';
    if (n.startsWith('ios')) return 'iOS/iPadOS';
    if (n.startsWith('macos')) return 'macOS';
    if (n.startsWith('aosp')) return 'Android (AOSP)';
    if (n.startsWith('android')) return 'Android';
    if (n === 'webapp') return 'Web';
    return '?';
  }

  const SCRIPT_KINDS = { ps: 'Windows', sh: 'macOS', rem: 'Windows' };
  const scriptType = k => ({ ps: () => T('asBuilt.type.ps', 'Script PowerShell'), sh: () => T('asBuilt.type.sh', 'Script shell'), rem: () => T('asBuilt.type.rem', 'Remédiation') })[k]();

  // kind: 'sc' Settings Catalog, 'dc' deviceConfigurations, 'comp' compliance, 'admx' groupPolicyConfigurations,
  // 'app' mobileApps, 'ps' deviceManagementScripts, 'sh' deviceShellScripts, 'rem' deviceHealthScripts,
  // 'ap' Autopilot deployment profiles, 'apdev' Autopilot devices (one item for all), 'enr' deviceEnrollmentConfigurations (ESP...),
  // 'dep' Apple ADE (DEP) enrollment profiles, 'android' Android Enterprise / AOSP enrollment profiles, 'brand' Intune branding profiles
  // (Tenant administration > Customization), 'role' Intune role definitions, 'tag' scope tags, 'mdm' Windows MDM auto-enrollment (Entra mobility).
  function policySummary(kind, raw) {
    const base = { kind, id: raw.id, description: raw.description || '', modified: raw.lastModifiedDateTime || '' };
    const name = raw.displayName || raw.profileName || raw.name;
    if (kind === 'ap') return { ...base, name, type: T('asBuilt.type.ap', 'Profil de déploiement Autopilot'), platform: 'Windows' };
    if (kind === 'apdev') return { ...base, name, type: T('asBuilt.type.apdev', 'Appareils Autopilot (inventaire, CSV)'), platform: 'Windows' };
    if (kind === 'enr') {
      const t = odataName(raw);
      const esp = t === 'windows10EnrollmentCompletionPageConfiguration';
      const os = platformFromType(t);
      return { ...base, name, platform: os === '?' ? '' : os, // device limit, restrictions, WHfB: every platform
        type: esp ? T('asBuilt.type.esp', "Page d'état d'inscription (ESP)") : T('asBuilt.type.enr', "Configuration d'inscription") + (t ? ` (${t})` : '') };
    }
    if (kind === 'dep') return { ...base, name, type: T('asBuilt.type.dep', "Profil d'inscription Apple (ADE)"), platform: platformFromType(odataName(raw)) };
    if (kind === 'android') return { ...base, name, type: T('asBuilt.type.android', "Profil d'inscription Android") + (raw.enrollmentMode ? ` (${raw.enrollmentMode})` : ''),
      platform: /aosp/i.test(raw.enrollmentMode || '') ? 'Android (AOSP)' : 'Android Enterprise' };
    if (kind === 'brand') return { ...base, name, type: T('asBuilt.type.brand', 'Personnalisation (profil de marque)'), platform: '' };
    if (kind === 'role') return { ...base, name, platform: '',
      type: raw.isBuiltIn ? T('asBuilt.type.roleBuiltIn', 'Rôle Intune (intégré)') : T('asBuilt.type.role', 'Rôle Intune (personnalisé)') };
    if (kind === 'tag') return { ...base, name, type: T('asBuilt.type.tag', "Balise d'étendue"), platform: '' };
    if (kind === 'mdm') return { ...base, name, type: T('asBuilt.type.mdm', 'Inscription automatique MDM (Entra)'), platform: 'Windows' };
    if (kind === 'mam') return { ...base, name, type: T('asBuilt.type.mam', 'Inscription automatique MAM (Entra)'), platform: 'Windows' };
    // Entra console
    if (kind === 'ca') return { ...base, name, modified: raw.modifiedDateTime || raw.createdDateTime || '', platform: '',
      type: T('asBuilt.type.ca', 'Accès conditionnel') + ` (${caState(raw.state)})` };
    if (kind === 'loc') return { ...base, name, modified: raw.modifiedDateTime || '', platform: '',
      type: odataName(raw) === 'countryNamedLocation' ? T('asBuilt.type.locCountry', 'Emplacement nommé (pays)') : T('asBuilt.type.locIp', 'Emplacement nommé (IP)') };
    if (kind === 'auths') return { ...base, name, modified: raw.modifiedDateTime || '', platform: '',
      type: raw.policyType === 'builtIn' ? T('asBuilt.type.authsBuiltIn', "Niveau d'authentification (intégré)") : T('asBuilt.type.auths', "Niveau d'authentification (personnalisé)") };
    if (kind === 'authm') return { ...base, name: name || raw.id, platform: '',
      type: T('asBuilt.type.authm', "Méthode d'authentification") + (raw.state ? ` (${raw.state === 'enabled' ? T('asBuilt.ca.enabled', 'Activée') : T('asBuilt.ca.disabled', 'Désactivée')})` : '') };
    if (kind === 'sc') {
      const tpl = raw.templateReference?.templateDisplayName;
      return { ...base, name: raw.name, type: tpl ? T('asBuilt.type.scTpl', 'Catalogue de paramètres (modèle {tpl})', { tpl }) : T('asBuilt.type.sc', 'Catalogue de paramètres'),
        platform: String(raw.platforms || '').split(',').map(p => PLATFORMS[p.trim()] || p.trim()).join(', ') };
    }
    if (kind === 'admx') return { ...base, name: raw.displayName, type: T('asBuilt.type.admx', "Modèle d'administration (ADMX)"), platform: 'Windows' };
    // Remediations: Windows Pro devices work, but users need a Windows E3/E5, A3/A5 or VDA licence (Learn, deploy-remediations#licensing).
    if (kind === 'rem') return { ...base, name: raw.displayName, type: scriptType('rem'), platform: 'Windows', license: T('asBuilt.license.rem', 'Windows Enterprise E3/E5, Education A3/A5 ou VDA (par utilisateur)') };
    if (SCRIPT_KINDS[kind]) return { ...base, name: raw.displayName, type: scriptType(kind), platform: SCRIPT_KINDS[kind] };
    const t = odataName(raw);
    if (kind === 'app') return { ...base, name: raw.displayName, type: T('asBuilt.type.app', 'Application') + (t ? ` (${t})` : ''), platform: platformFromType(t) };
    return { ...base, name: raw.displayName, platform: platformFromType(t),
      type: (kind === 'comp' ? T('asBuilt.type.comp', 'Stratégie de conformité') : T('asBuilt.type.dc', 'Profil de configuration')) + (t ? ` (${t})` : '') };
  }

  // ---------- Settings Catalog ----------

  function categoryPath(id, categories) {
    const names = [];
    for (let i = 0; id && categories[id] && i < 10; i++) {
      const c = categories[id];
      if (c.displayName) names.unshift(c.displayName);
      if (!c.parentCategoryId || c.parentCategoryId === id) break;
      id = c.parentCategoryId;
    }
    return names.join(' > ');
  }

  const mask = () => T('asBuilt.value.secret', '(secret masqué)');

  function simpleValue(v) {
    if (/SecretSettingValue/.test(v?.['@odata.type'] || '')) return mask();
    return String(v?.value ?? '');
  }

  // settings: items of GET configurationPolicies/{id}/settings (or bare setting instances).⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
  // definitions: every settingDefinitions entry from $expand=settingDefinitions. categories: id -> configurationCategory.
  function settingRows(settings, definitions, categories = {}) {
    const defs = new Map((definitions || []).map(d => [d.id, d]));
    const rows = [];
    const walk = (inst, parentPath) => {
      const def = defs.get(inst.settingDefinitionId) || {};
      const name = def.displayName || def.name || inst.settingDefinitionId;
      const path = parentPath ?? categoryPath(def.categoryId, categories);
      const sub = path ? `${path} > ${name}` : name;
      const label = v => (def.options || []).find(o => o.itemId === v)?.displayName ?? String(v ?? '');
      const t = (inst['@odata.type'] || '').replace(/^#?microsoft\.graph\.deviceManagementConfiguration/, '');
      const push = value => rows.push({ path, name, value });
      const kids = (list, p = sub) => (list || []).forEach(c => walk(c, p));
      switch (t) {
        case 'ChoiceSettingInstance':
          push(label(inst.choiceSettingValue?.value));
          kids(inst.choiceSettingValue?.children);
          break;
        case 'ChoiceSettingCollectionInstance': {
          const vals = inst.choiceSettingCollectionValue || [];
          push(vals.map(v => label(v.value)).join(', '));
          vals.forEach(v => kids(v.children));
          break;
        }
        case 'SimpleSettingInstance':
          push(simpleValue(inst.simpleSettingValue));
          break;
        case 'SimpleSettingCollectionInstance':
          push((inst.simpleSettingCollectionValue || []).map(simpleValue).join(', '));
          break;
        case 'GroupSettingInstance':
          kids(inst.groupSettingValue?.children);
          break;
        case 'GroupSettingCollectionInstance': {
          const vals = inst.groupSettingCollectionValue || [];
          vals.forEach((g, i) => kids(g.children, vals.length > 1 ? `${sub} [${i + 1}]` : sub));
          break;
        }
        default:
          push(T('asBuilt.value.unsupported', '(type non pris en charge : {type})', { type: t || T('asBuilt.value.unknown', 'inconnu') }));
      }
    };
    for (const s of settings || []) walk(s.settingInstance || s);
    return rows;
  }

  // ---------- templates (deviceConfigurations / compliance) ----------

  const SKIP = new Set(['id', 'displayName', 'description', 'createdDateTime', 'lastModifiedDateTime', 'version', 'roleScopeTagIds', 'supportsScopeTags', 'deviceManagementApplicabilityRuleOsEdition', 'deviceManagementApplicabilityRuleOsVersion', 'deviceManagementApplicabilityRuleDeviceMode', 'largeIcon']);
  // Images (base64), removed from the policy before export by page.js: branding logos, Android QR code.
  const IMAGE_KEYS = ['largeIcon', 'themeColorLogo', 'lightBackgroundLogo', 'landingPageCustomizedImage', 'qrCodeImage'];
  // Values that grant access (Android enrollment token and its QR code content, Surface Hub password): masked everywhere.
  const SECRET_KEYS = new Set(['tokenValue', 'qrCodeContent', 'deviceAccountPassword', 'productKey']);
  // Base64 script bodies: exported as separate files (scriptFiles), not dumped into the document.
  const SCRIPT_KEYS = new Set(['scriptContent', 'detectionScriptContent', 'remediationScriptContent']);

  const yes = () => T('asBuilt.value.yes', 'Oui'), no = () => T('asBuilt.value.no', 'Non');

  function humanize(k) {
    const s = k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Flattens a template object into rows. null, empty and "notConfigured" are skipped (not configured in the portal).
  function propertyRows(obj, path = '') {
    const rows = [];
    for (const [k, v] of Object.entries(obj || {})) {
      if (k.includes('@odata') || (!path && SKIP.has(k))) continue;
      if (v === null || v === '' || v === 'notConfigured' || (Array.isArray(v) && !v.length)) continue;
      const name = humanize(k);
      const sub = path ? `${path} > ${name}` : name;
      if (SECRET_KEYS.has(k)) { rows.push({ path, name, value: mask() }); continue; }
      if (SCRIPT_KEYS.has(k)) { rows.push({ path, name, value: T('asBuilt.value.scriptFile', '(script exporté dans un fichier séparé)') }); continue; }
      if (Array.isArray(v) && typeof v[0] === 'object') v.forEach((o, i) => rows.push(...propertyRows(o, `${sub} [${i + 1}]`)));
      else if (Array.isArray(v)) rows.push({ path, name, value: v.join(', ') });
      else if (typeof v === 'object') rows.push(...propertyRows(v, sub));
      else rows.push({ path, name, value: v === true ? yes() : v === false ? no() : String(v) });
    }
    return rows;
  }

  // ---------- ADMX ----------

  // values: definitionValues ($expand=definition) each with presentationValues ($expand=presentation).
  function admxRows(values) {
    const rows = [];
    for (const dv of values || []) {
      const d = dv.definition || {};
      const name = d.displayName || dv.id;
      const path = [d.categoryPath, d.classType === 'user' ? T('asBuilt.admx.user', '(Utilisateur)') : ''].filter(Boolean).join(' ');
      rows.push({ path, name, value: dv.enabled ? T('asBuilt.admx.enabled', 'Activé') : T('asBuilt.admx.disabled', 'Désactivé') });
      for (const pv of dv.presentationValues || []) {
        let value = pv.value;
        if (Array.isArray(pv.values)) value = pv.values.map(x => (typeof x === 'object' ? (x.name && x.value ? `${x.name} = ${x.value}` : x.name || x.value) : x)).join(', ');
        if (typeof value === 'boolean') value = value ? yes() : no();
        rows.push({ path: path ? `${path} > ${name}` : name, name: pv.presentation?.label || T('asBuilt.admx.value', '(valeur)'), value: String(value ?? '') });
      }
    }
    return rows;
  }

  // ---------- assignments ----------

  const TARGETS = { allLicensedUsersAssignmentTarget: () => T('asBuilt.target.allUsers', 'Tous les utilisateurs'), allDevicesAssignmentTarget: () => T('asBuilt.target.allDevices', 'Tous les appareils') };

  function assignmentRows(assignments, groupNames = {}, filterNames = {}) {
    return (assignments || []).map(a => {
      const t = a.target || {};
      const type = odataName(t);
      const fid = t.deviceAndAppManagementAssignmentFilterId;
      const ftype = t.deviceAndAppManagementAssignmentFilterType;
      return {
        group: TARGETS[type]?.() || groupNames[t.groupId] || t.groupId || type,
        mode: type === 'exclusionGroupAssignmentTarget' ? T('asBuilt.mode.exclude', 'Exclure') : T('asBuilt.mode.include', 'Inclure'),
        filter: fid && ftype && ftype !== 'none' ? `${filterNames[fid] || fid} (${ftype === 'exclude' ? T('asBuilt.filter.exclude', 'exclure') : T('asBuilt.filter.include', 'inclure')})` : '',
      };
    });
  }

  // ---------- documents ----------

  // Document labels, resolved per export (language read at call time).
  const docText = () => ({
    title: T('asBuilt.doc.title', "Dossier d'architecture détaillée – Stratégies Intune"),
    name: T('asBuilt.doc.name', 'Nom'), type: T('asBuilt.doc.type', 'Type'), platform: T('asBuilt.doc.platform', 'Plateforme'),
    license: T('asBuilt.doc.license', 'Licence requise'), description: T('asBuilt.doc.description', 'Description'), modified: T('asBuilt.doc.modified', 'Date de modification'),
    property: T('asBuilt.doc.property', 'Propriété'), value: T('asBuilt.doc.value', 'Valeur'),
    settings: T('asBuilt.doc.settings', 'Paramètres'), setting: T('asBuilt.doc.setting', 'Paramètre'), noSettings: T('asBuilt.doc.noSettings', 'Aucun paramètre configuré.'),
    assignments: T('asBuilt.doc.assignments', 'Affectations'), group: T('asBuilt.doc.group', 'Groupe'), mode: T('asBuilt.doc.mode', 'Mode'), filter: T('asBuilt.doc.filter', 'Filtre'),
    noAssignments: T('asBuilt.doc.noAssignments', 'Aucune affectation.'),
  });
  const meta = (p, x) => [[x.name, p.name], [x.type, p.type], [x.platform, p.platform], ...(p.license ? [[x.license, p.license]] : []), [x.description, p.description], [x.modified, fmtDate(p.modified)]];
  const param = r => (r.path ? `${r.path} > ${r.name}` : r.name);

  function toMarkdown(policies, title) {
    const x = docText();
    if (title) x.title = title;
    const out = [`# ${x.title}`, ''];
    const table = (head, rows) => {
      out.push(`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`);
      for (const r of rows) out.push(`| ${r.map(mdEscapeCell).join(' | ')} |`);
      out.push('');
    };
    for (const p of policies) {
      out.push(`## ${String(p.name ?? '').replace(/\s+/g, ' ')}`, '');
      table([x.property, x.value], meta(p, x));
      out.push(`### ${x.settings}`, '');
      if (p.settings.length) table([x.setting, x.value], p.settings.map(r => [param(r), r.value]));
      else out.push(`_${x.noSettings}_`, '');
      out.push(`### ${x.assignments}`, '');
      if (p.assignments.length) table([x.group, x.mode, x.filter], p.assignments.map(a => [a.group, a.mode, a.filter]));
      else out.push(`_${x.noAssignments}_`, '');
    }
    return out.join('\n');
  }

  // Word-compatible HTML (saved as .doc): h1-h3 map to Word's Heading styles.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
  function toWordHtml(policies, title) {
    const e = htmlEscape, x = docText();
    if (title) x.title = title;
    const cell = (tag, v) => `<${tag}>${e(v).replace(/\r?\n/g, '<br>')}</${tag}>`;
    const table = (head, rows) => `<table><tr>${head.map(h => cell('th', h)).join('')}</tr>${rows.map(r => `<tr>${r.map(v => cell('td', v)).join('')}</tr>`).join('')}</table>`;
    const body = policies.map(p => [
      `<h2>${e(p.name)}</h2>`,
      `<table>${meta(p, x).map(([k, v]) => `<tr>${cell('th', k)}${cell('td', v)}</tr>`).join('')}</table>`,
      `<h3>${e(x.settings)}</h3>`,
      p.settings.length ? table([x.setting, x.value], p.settings.map(r => [param(r), r.value])) : `<p><i>${e(x.noSettings)}</i></p>`,
      `<h3>${e(x.assignments)}</h3>`,
      p.assignments.length ? table([x.group, x.mode, x.filter], p.assignments.map(a => [a.group, a.mode, a.filter])) : `<p><i>${e(x.noAssignments)}</i></p>`,
    ].join('\n')).join('\n');
    return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${e(x.title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
body { font-family: Calibri, sans-serif; font-size: 10pt; }
table { border-collapse: collapse; width: 100%; margin-bottom: 8pt; }
th, td { border: 1px solid #8eaadb; padding: 3pt 5pt; vertical-align: top; text-align: left; font-size: 9pt; }
th { background: #d9e2f3; }
</style></head>
<body>
<h1>${e(x.title)}</h1>
${body}
</body></html>`;
  }

  // ---------- JSON backup ----------

  function jwtClaims(token) {
    try {
      const b = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(b + '='.repeat((4 - b.length % 4) % 4))) || {};
    } catch { return {}; }
  }

  // tid claim of a JWT access token, '' if absent or malformed. The token itself is not kept or returned.
  function jwtTid(token) {
    const tid = jwtClaims(token).tid;
    return /^[0-9a-f-]{36}$/i.test(tid || '') ? tid : '';
  }

  // The portal also sends Graph tokens of other apps: keep only one that can read the console's objects.
  const isIntuneToken = token => /\bDeviceManagement(Configuration|Apps|ServiceConfig|ManagedDevices|RBAC)\.Read/.test(jwtClaims(token).scp || '');
  const isEntraToken = token => /(^|\s)Policy\.Read\.All(\s|$)/.test(jwtClaims(token).scp || ''); // tested 2026-10-04: Entra portal token
  // Console(s) a Graph token can serve: 'intune', 'entra'. Expired or other audience: none.
  function tokenKinds(token, now = Date.now()) {
    const c = jwtClaims(token);
    if (!/^https:\/\/graph\.microsoft\.com\/?$/.test(c.aud || '') || !(c.exp * 1000 > now)) return [];
    return [isIntuneToken(token) && 'intune', isEntraToken(token) && 'entra'].filter(Boolean);
  }

  // JWT strings in a message (the shell hands tokens to its extension Web Worker over MessagePort), at most 6 levels deep.
  function jwtsIn(data) {
    const out = [];
    let budget = 2000; // ponytail: caps the walk on big data messages; tokens sit near the top of token replies
    (function walk(v, d) {
      if (d > 6 || v == null || --budget < 0) return;
      if (typeof v === 'string') { const m = /^(?:Bearer\s+)?(eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+)$/.exec(v); if (m) out.push(m[1]); return; }
      if (typeof v === 'object' && !ArrayBuffer.isView(v) && !(v instanceof ArrayBuffer)) for (const k in v) walk(v[k], d + 1);
    })(data, 0);
    return out;
  }

  // Deep copy with secret values masked: Settings Catalog secret values and encrypted OMA-URI values.
  function maskSecrets(x) {
    if (Array.isArray(x)) return x.map(maskSecrets);
    if (!x || typeof x !== 'object') return x;
    const out = Object.fromEntries(Object.entries(x).map(([k, v]) => [k, SECRET_KEYS.has(k) && v ? mask() : maskSecrets(v)]));
    if ('value' in out && (/SecretSettingValue/.test(out['@odata.type'] || '') || out.isEncrypted === true)) out.value = mask();
    return out;
  }

  const JSON_TYPES = { sc: 'settingsCatalog', dc: 'deviceConfiguration', comp: 'compliancePolicy', admx: 'groupPolicyConfiguration',
    app: 'mobileApp', ps: 'deviceManagementScript', sh: 'deviceShellScript', rem: 'deviceHealthScript',
    ap: 'windowsAutopilotDeploymentProfile', apdev: 'windowsAutopilotDeviceIdentities', enr: 'deviceEnrollmentConfiguration',
    dep: 'depEnrollmentProfile', android: 'androidDeviceOwnerEnrollmentProfile', brand: 'intuneBrandingProfile',
    role: 'roleDefinition', tag: 'roleScopeTag', mdm: 'mobileDeviceManagementPolicy', mam: 'mobileAppManagementPolicy',
    ca: 'conditionalAccessPolicy', loc: 'namedLocation', auths: 'authenticationStrengthPolicy', authm: 'authenticationMethodConfiguration' };

  // ---------- script files ----------

  function b64Text(b64) {
    try { return new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0))); } catch { return ''; }
  }

  // Script bodies attached to a policy: [{ suffix, ext, text }] (text decoded from Graph's base64). File name = policy name + suffix.
  // App rules: beta `rules` (win32LobAppPowerShellScriptRule, ruleType detection|requirement) and legacy `detectionRules`.
  function scriptFiles(kind, policy) {
    if (!policy) return [];
    const out = [];
    const add = (b64, suffix, ext) => { const text = b64 && b64Text(b64); if (text) out.push({ suffix, ext, text }); };
    const ext = (policy.fileName || '').match(/\.(\w+)$/)?.[1];
    if (kind === 'ps') add(policy.scriptContent, '', ext || 'ps1');
    if (kind === 'sh') add(policy.scriptContent, '', ext || 'sh');
    if (kind === 'rem') {
      add(policy.detectionScriptContent, ' - detection', 'ps1');
      add(policy.remediationScriptContent, ' - remediation', 'ps1');
    }
    if (kind === 'app') {
      const rules = [...(policy.rules || []), ...(policy.detectionRules || []).map(r => ({ ...r, ruleType: 'detection' }))]
        .filter(r => /PowerShellScript/.test(r['@odata.type'] || '') && r.scriptContent);
      const n = {};
      for (const r of rules) {
        const t = r.ruleType === 'requirement' ? 'requirement' : 'detection';
        n[t] = (n[t] || 0) + 1;
        add(r.scriptContent, ` - ${t}${n[t] > 1 ? ' ' + n[t] : ''}`, 'ps1');
      }
    }
    return out;
  }

  // policies: detail objects from page.js ({kind, id, name, raw: {policy, settings|definitionValues, assignments, filters, groups} | {error}}).
  function toJson(policies, { exportedAt, tenantId } = {}) {
    return {
      exportedAt,
      ...(tenantId ? { tenantId } : {}),
      policies: policies.map(p => {
        const r = p.raw || {};
        const type = JSON_TYPES[p.kind] || p.kind;
        if (r.error) return { type, id: p.id, name: p.name, error: r.error };
        const t = r.policy?.['@odata.type'];
        return maskSecrets({
          type,
          base: p.kind === 'sc' ? r.policy?.templateReference ?? null : t ? { '@odata.type': t } : null,
          policy: r.policy,
          ...(p.kind === 'sc' ? { settings: r.settings || [] } : {}),
          ...(p.kind === 'admx' ? { definitionValues: r.definitionValues || [] } : {}),
          ...(p.kind === 'apdev' ? { devices: r.devices || [] } : {}),
          ...(p.kind === 'role' ? { roleAssignments: r.roleAssignments || [] } : {}),
          assignments: r.assignments || [],
          filters: r.filters || [],
          groups: r.groups || [],
        });
      }),
    };
  }

  // ---------- Entra: Conditional Access, authentication methods ----------

  const caState = s => ({ enabled: T('asBuilt.ca.enabled', 'Activée'), disabled: T('asBuilt.ca.disabled', 'Désactivée'),
    enabledForReportingButNotEnforced: T('asBuilt.ca.report', 'Rapport seul') })[s] || s || '';

  // Keyword values of Conditional Access and authentication method targets, shown in words.
  const CA_WORDS = () => ({ All: T('asBuilt.ca.all', 'Tous'), None: T('asBuilt.ca.none', 'Aucun'),
    GuestsOrExternalUsers: T('asBuilt.ca.guests', 'Invités ou utilisateurs externes'), Office365: 'Office 365',
    MicrosoftAdminPortals: T('asBuilt.ca.adminPortals', "Portails d'administration Microsoft"),
    AllTrusted: T('asBuilt.ca.allTrusted', 'Tous les emplacements approuvés'), all_users: T('asBuilt.target.allUsers', 'Tous les utilisateurs') });

  const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const pick = (o, path) => path.reduce((x, k) => (x == null ? x : x[k]), o) || [];

  // Ids to resolve in a policy, by lookup: directory objects (users, groups, roles), apps (appId), named locations.
  // kind 'ca' (Conditional Access) or 'authm' (authentication method configuration: includeTargets / excludeTargets).
  function caIds(kind, p) {
    const guids = list => (Array.isArray(list) ? list : []).filter(v => GUID_RE.test(v));
    if (kind === 'authm') return { dir: guids([...(p.includeTargets || []), ...(p.excludeTargets || [])].map(t => t.id)), apps: [], locations: [] };
    const u = ['includeUsers', 'excludeUsers', 'includeGroups', 'excludeGroups', 'includeRoles', 'excludeRoles'];
    return {
      dir: guids(u.flatMap(k => pick(p, ['conditions', 'users', k]))),
      apps: guids(['includeApplications', 'excludeApplications'].flatMap(k => pick(p, ['conditions', 'applications', k]))),
      locations: guids(['includeLocations', 'excludeLocations'].flatMap(k => pick(p, ['conditions', 'locations', k]))),
    };
  }

  // Deep copy where every string that is a known id or keyword is replaced by its name.
  function withNames(x, names) {
    const words = CA_WORDS();
    const walk = v => Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, y]) => [k, walk(y)]))
      : typeof v === 'string' ? names[v] || names[v.toLowerCase()] || words[v] || v : v;
    return walk(x);
  }

  // Who a Conditional Access policy or an authentication method targets, as assignment rows (Include / Exclude).
  function caAssignmentRows(kind, policy, names = {}) {
    const n = v => (GUID_RE.test(v) && names[v.toLowerCase()]) || CA_WORDS()[v] || v;
    const inc = T('asBuilt.mode.include', 'Inclure'), exc = T('asBuilt.mode.exclude', 'Exclure');
    if (kind === 'authm') return [...(policy.includeTargets || []).map(t => ({ group: n(t.id), mode: inc, filter: '' })),
      ...(policy.excludeTargets || []).map(t => ({ group: n(t.id), mode: exc, filter: '' }))];
    const u = policy.conditions?.users || {};
    const of = (list, label) => (list || []).map(v => label ? `${n(v)} (${label})` : n(v));
    const role = T('asBuilt.ca.role', 'rôle');
    return [...of(u.includeUsers), ...of(u.includeGroups), ...of(u.includeRoles, role)].map(group => ({ group, mode: inc, filter: '' }))
      .concat([...of(u.excludeUsers), ...of(u.excludeGroups), ...of(u.excludeRoles, role)].map(group => ({ group, mode: exc, filter: '' })));
  }

  // Conditional Access policy as readable rows: state, then conditions, grant and session controls (keys humanised).
  // Users, groups and roles are in the assignments table (caAssignmentRows), not repeated here.
  function caRows(policy, names = {}) {
    const p = withNames(policy, names);
    if (p.conditions) delete p.conditions.users;
    const strength = p.grantControls?.authenticationStrength;
    if (strength && typeof strength === 'object') p.grantControls.authenticationStrength = strength.displayName || strength.id; // the whole policy is a separate item
    return [
      { path: '', name: T('asBuilt.ca.state', 'État'), value: caState(policy.state) },
      ...propertyRows(p.conditions, T('asBuilt.ca.conditions', 'Conditions')),
      ...propertyRows(p.grantControls, T('asBuilt.ca.grant', "Contrôles d'octroi")),
      ...propertyRows(p.sessionControls, T('asBuilt.ca.session', 'Contrôles de session')),
    ];
  }

  // ---------- Autopilot devices, RBAC, MDM auto-enrollment ----------

  // Graph does not return the hardware hash of a registered device (no such property on windowsAutopilotDeviceIdentity):
  // the export is an inventory, not a file to re-import.
  const AP_COLS = [['serialNumber', 'Serial number'], ['manufacturer', 'Manufacturer'], ['model', 'Model'], ['groupTag', 'Group tag'],
    ['userPrincipalName', 'Assigned user'], ['deploymentProfileAssignmentStatus', 'Profile status'], ['enrollmentState', 'Enrollment state'],
    ['lastContactedDateTime', 'Last contacted'], ['purchaseOrderIdentifier', 'Purchase order'], ['azureAdDeviceId', 'Entra device ID']];

  function autopilotRows(devices) {
    return (devices || []).map(d => ({ path: '', name: d.serialNumber || d.id,
      value: [[d.manufacturer, d.model].filter(Boolean).join(' '), d.groupTag && `tag ${d.groupTag}`, d.userPrincipalName, d.deploymentProfileAssignmentStatus, d.enrollmentState].filter(Boolean).join(' · ') }));
  }

  // ; separator, cells starting with = + - @ prefixed with ' (no formula when opened in Excel). Caller adds the UTF-8 BOM.
  const csvCell = v => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  function autopilotCsv(devices) {
    return [AP_COLS.map(c => c[1]), ...(devices || []).map(d => AP_COLS.map(c => d[c[0]]))].map(r => r.map(csvCell).join(';')).join('\r\n');
  }

  // assignments: deviceAndAppManagementRoleAssignment objects (members / resourceScopes = group ids, scopeType, roleScopeTagIds).
  function roleAssignmentRows(assignments, groupNames = {}, tagNames = {}) {
    const names = ids => (ids || []).map(id => groupNames[id] || id).join(', ');
    const rows = [];
    for (const a of assignments || []) {
      const path = T('asBuilt.role.assignment', 'Affectation') + ' > ' + (a.displayName || a.id);
      rows.push({ path, name: T('asBuilt.role.members', 'Membres (groupes)'), value: names(a.members) });
      const scope = a.scopeType && a.scopeType !== 'resourceScope' ? ({ allDevices: T('asBuilt.target.allDevices', 'Tous les appareils'),
        allLicensedUsers: T('asBuilt.target.allUsers', 'Tous les utilisateurs'), allDevicesAndLicensedUsers: T('asBuilt.role.allBoth', 'Tous les appareils et utilisateurs') })[a.scopeType] || a.scopeType : names(a.resourceScopes);
      rows.push({ path, name: T('asBuilt.role.scope', 'Étendue (groupes)'), value: scope });
      if ((a.roleScopeTagIds || []).length) rows.push({ path, name: T('asBuilt.role.tags', "Balises d'étendue"), value: a.roleScopeTagIds.map(id => tagNames[id] || id).join(', ') });
    }
    return rows;
  }

  // MDM user scope (appliesTo none | all | selected, includedGroups) shown as assignments.
  function mdmAssignmentRows(policy) {
    const inc = T('asBuilt.mode.include', 'Inclure');
    if (policy?.appliesTo === 'all') return [{ group: T('asBuilt.target.allUsers', 'Tous les utilisateurs'), mode: inc, filter: '' }];
    if (policy?.appliesTo === 'selected') return (policy.includedGroups || []).map(g => ({ group: g.displayName || g.id, mode: inc, filter: '' }));
    return [];
  }

  // Windows-safe file name from a policy name; dedupe against `used` (Set) so two homonyms don't overwrite each other.
  function fileName(name, ext, used = new Set()) {
    const base = String(name || 'sans-nom').replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 120) || 'sans-nom';
    let n = `${base}.${ext}`;
    for (let i = 2; used.has(n.toLowerCase()); i++) n = `${base} (${i}).${ext}`;
    used.add(n.toLowerCase());
    return n;
  }

  // Policy open in the portal: every GUID of the blade URL (policyId/, appId/, configurationId/...), lower case.
  // Matching them against the listed ids covers every kind without knowing each blade's URL shape.
  function guidsIn(hash) {
    let h = String(hash || '');
    try { h = decodeURIComponent(h); } catch {}
    // With and without a "_Suffix": enrollment configuration ids are "<guid>_Windows10EnrollmentCompletionPageConfiguration".
    const ids = (h.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(_[A-Za-z0-9]+)?/gi) || []).map(s => s.toLowerCase());
    return new Set([...ids, ...ids.map(s => s.slice(0, 36))]);
  }

  // List order: the open policy, then the checked ones in the order they were checked, then the rest (input order kept).
  function orderItems(list, checkedKeys, currentKey) {
    const rank = new Map([...checkedKeys].map((k, i) => [k, i + 1]));
    if (currentKey) rank.set(currentKey, 0);
    return list.map((x, i) => [x, rank.has(x.key) ? rank.get(x.key) : Infinity, i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(a => a[0]);
  }

  // "Windows, macOS" -> ['Windows', 'macOS'] (policySummary joins multi-platform policies with ", ").⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
  const platformsOf = p => String(p.platform || '').split(',').map(s => s.trim()).filter(Boolean);

  const api = { caAssignmentRows, caState, isEntraToken, tokenKinds, jwtsIn, caIds, withNames, caRows, isIntuneToken, guidsIn, orderItems, IMAGE_KEYS, autopilotRows, autopilotCsv, roleAssignmentRows, mdmAssignmentRows, scriptFiles, fileName, platformsOf, jwtTid, maskSecrets, toJson, htmlEscape, mdEscapeCell, fmtDate, policySummary, categoryPath, settingRows, propertyRows, admxRows, assignmentRows, toMarkdown, toWordHtml };
  if (typeof module !== 'undefined') module.exports = api;
  else globalThis.AsBuiltLib = api;
})();
