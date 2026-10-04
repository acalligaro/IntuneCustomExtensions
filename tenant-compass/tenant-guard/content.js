// Runs in every frame of the Microsoft admin portals.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
// Top frame: detects the tenant and draws the banner. All frames: block guarded clicks while the tenant is PROD.
(() => {
  const isTop = window === window.top;
  let rules = [];
  let state = null; // { signals, signal, label, color, prod }
  let realm = null; // tenant ID from the MSAL cache, learned by the matched rule
  let dirName = null;
  let last = '';
  let bypass = null;
  const started = Date.now(); // the portal shows the tenant a moment after load
  const T = (k, v) => globalThis.__tenantCompassI18n ? __tenantCompassI18n.t(k, v) : k;

  // ---------- detection (top frame only) ----------

  function signals() {
    const s = urlSignals(location.href);
    const dir = dirName = document.querySelector('.fxs-avatarmenu-tenant')?.textContent.trim() || null; // Azure/Intune/Entra directory name
    if (dir) s.push(dir);
    try { realm = storageRealms([...Object.keys(localStorage), ...Object.keys(sessionStorage)])[0] || null; } catch { realm = null; }
    if (realm) s.push(realm);
    return [...new Set(s)];
  }

  function detect() {
    if (!isAdminConsole(location.href)) { // SharePoint user site: no banner, no guard
      if (state?.off) return;
      state = { off: true, signals: [], prod: false, color: '#605e5c' };
      last = '';
      root?.replaceChildren();
      return chrome.runtime.sendMessage({ type: 'state', state });
    }
    const sigs = signals();
    const hit = matchRule(sigs, rules);
    // Only from the directory name: a ?tid= (GDAP) may name another tenant than the cached realm.
    const learned = hit && hit.signal === dirName && learnTenantId(rules, hit.rule, realm);
    if (learned) chrome.storage.sync.set({ rules: learned }).catch(() => {}); // onChanged re-runs detect()
    const next = {
      signals: sigs,
      signal: hit?.signal || sigs[0] || null,
      label: hit?.rule.label || null,
      color: hit?.rule.color || '#605e5c',
      prod: !!hit?.rule.prod,
      detecting: !sigs.length && Date.now() - started < 3000, // part of the state so the 3 s timeout triggers a re-render
    };
    const json = JSON.stringify(next);
    if (json === last) return;
    last = json;
    state = next;
    render();
    chrome.runtime.sendMessage({ type: 'state', state });
  }

  // ---------- banner ----------⁣​​‌​‌​​​​​​‌​​‌​‍​⁣

  let root;
  function render() {
    if (!root) {
      const host = document.createElement('div');
      host.id = 'tenant-guard';
      root = host.attachShadow({ mode: 'open' });
      document.documentElement.appendChild(host);
    }
    const style = document.createElement('style');
    style.textContent = `
      .frame { position: fixed; inset: 0; border: 4px solid var(--c); pointer-events: none; z-index: 2147483646; }
      .frame.prod { border-width: 6px; }
      .pill { position: fixed; top: 0; left: 50%; transform: translateX(-50%); z-index: 2147483647;
              background: var(--c); color: #fff; font: 600 12px/1 "Segoe UI", system-ui, sans-serif;
              padding: 5px 14px; border-radius: 0 0 6px 6px; pointer-events: none; white-space: nowrap;
              box-shadow: 0 1px 4px rgba(0,0,0,.35); }`;
    const pill = document.createElement('div');
    pill.className = 'pill';
    pill.textContent = state.label
      ? `${state.prod ? '⚠ PROD · ' : ''}${state.label}${state.signal ? ' · ' + state.signal : ''}`
      : state.signal ? T('tenantGuard.pill.unknown', { signal: state.signal }) : T(state.detecting ? 'tenantGuard.pill.detecting' : 'tenantGuard.pill.none');
    const nodes = [style, pill];
    if (state.label) {
      const frame = document.createElement('div');
      frame.className = 'frame' + (state.prod ? ' prod' : '');
      nodes.push(frame);
    }
    // Rules come from storage (manual edit or import): only a hex color may reach CSS, never url(...) or other values.
    root.host.style.setProperty('--c', /^#[0-9a-f]{6}$/i.test(state.color) ? state.color : '#605e5c');
    root.replaceChildren(...nodes);
  }

  // ---------- PROD confirmation (all frames) ----------⁣​​‌​‌​​​​​​‌​​‌​‍​⁣

  function ask(action, onOk) {
    const host = document.createElement('div');
    const sr = host.attachShadow({ mode: 'open' });
    sr.innerHTML = `
      <style>
        .bg { position: fixed; inset: 0; background: rgba(0,0,0,.55); z-index: 2147483647;
              display: flex; align-items: center; justify-content: center; font: 14px/1.4 "Segoe UI", system-ui, sans-serif; }
        .box { background: #fff; color: #201f1e; max-width: 440px; padding: 20px 24px; border-radius: 8px;
               border-top: 8px solid #d13438; box-shadow: 0 8px 32px rgba(0,0,0,.4); }
        h2 { margin: 0 0 8px; font-size: 18px; }
        .row { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
        button { font: inherit; padding: 6px 16px; border-radius: 4px; border: 1px solid #3b3a39; background: #3b3a39; color: #fff; cursor: pointer; }
        button:focus-visible { outline: 2px solid #0078d4; outline-offset: 2px; }
        .ok { background: #d13438; border-color: #d13438; color: #fff; }
      </style>
      <div class="bg"><div class="box" role="alertdialog" aria-modal="true">
        <h2></h2>
        <p></p>
        <div class="row"><button class="no"></button><button class="ok"></button></div>
      </div></div>`;
    sr.querySelector('h2').textContent = T('tenantGuard.confirm.title');
    sr.querySelector('.no').textContent = T('tenantGuard.confirm.cancel');
    sr.querySelector('.ok').textContent = T('tenantGuard.confirm.ok');
    sr.querySelector('p').textContent = T('tenantGuard.confirm.message', {
      action, target: state.label || T('tenantGuard.confirm.prodTenant'), signal: state.signal ? ' (' + state.signal + ')' : '' });
    const close = () => { host.remove(); window.removeEventListener('keydown', onKey, true); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    sr.querySelector('.no').onclick = close;
    sr.querySelector('.ok').onclick = () => { close(); onOk(); };
    window.addEventListener('keydown', onKey, true);
    document.documentElement.appendChild(host);
    sr.querySelector('.no').focus(); // safe default: Enter cancels
  }

  const CLICKABLE = 'button, [role="button"], [role="menuitem"], input[type="submit"], input[type="button"]';
  // Tenant Compass's own UI (its buttons only write local data, e.g. Change Snapshot "Save" in the log): never guarded.
  const OWN_UI = new Set(['tenant-guard', 'as-built-host', 'assignment-lens', 'setting-inspector', 'settings-explainer', 'change-snapshot']);

  // Window capture phase runs before React/Knockout handlers, so stopping here cancels the action.
  window.addEventListener('click', e => {
    if (!state?.prod) return;
    const path = e.composedPath();
    if (path.some(n => n instanceof Element && OWN_UI.has(n.id))) return;
    const el = path.find(n => n instanceof Element && n.matches(CLICKABLE));
    if (!el) return;
    if (el === bypass) { bypass = null; return; }
    const text = (el.textContent || el.value || el.getAttribute('aria-label') || el.title || '').trim();
    if (!isGuarded(text)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    ask(text, () => { bypass = el; el.click(); });
  }, true);

  // ---------- wiring ----------

  chrome.runtime.onMessage.addListener(msg => { if (msg.type === 'state' && !isTop) state = msg.state; });

  if (isTop) {
    chrome.storage.sync.get({ rules: [] }, r => { rules = r.rules; detect(); });
    chrome.storage.onChanged.addListener(c => { if (c.rules) { rules = c.rules.newValue || []; last = ''; detect(); } });
    // ponytail: polling every 1.5 s catches SPA navigation and late DOM; switch to MutationObserver if it shows up in profiles.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
    setInterval(detect, 1500);
  } else {
    chrome.runtime.sendMessage({ type: 'getState' }, s => { if (s) state = s; });
  }
})();
