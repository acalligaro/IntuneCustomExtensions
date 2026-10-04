// Isolated world. Every frame: validates page.js observations and relays them to the top frame (via background.js).⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
// Top frame: keeps the "before" snapshots, builds the diff after a successful save, logs it and asks for a ticket.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
(() => {
  const warn = (...a) => console.warn('[Change Snapshot]', ...a); // errors only
  let L = globalThis.__changeSnapshotLib;
  // Fallback: if lib.js did not run in this isolated world, load it as a module (web_accessible_resources).
  const libReady = L ? Promise.resolve() : import(chrome.runtime.getURL('change-snapshot/lib.js'))
    .then(() => { L = globalThis.__changeSnapshotLib; })
    .catch(err => warn('lib.js introuvable :', err.message));
  const TYPE = 'change-snapshot:graph';
  const isStr = v => typeof v === 'string';
  const isObjOrNull = v => v === null || (typeof v === 'object' && !Array.isArray(v));

  // Rebuilds the observation from known fields only, or returns null.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
  function clean(d) {
    if (!d || typeof d !== 'object' || !isStr(d.method) || !isStr(d.url) || !Number.isInteger(d.status)) return null;
    if (!isObjOrNull(d.reqBody) || !isObjOrNull(d.resBody) || !isObjOrNull(d.claims)) return null;
    const c = d.claims;
    if (c && !['upn', 'tid'].every(k => c[k] === null || isStr(c[k]))) return null;
    return { method: d.method, url: d.url, status: d.status, reqBody: d.reqBody, resBody: d.resBody, claims: c && { upn: c.upn, tid: c.tid } };
  }

  window.addEventListener('message', e => {
    if (e.source !== window || e.origin !== location.origin || !e.data || e.data.type !== TYPE) return;
    const obs = clean(e.data);
    if (!obs) return;
    try { chrome.runtime.sendMessage({ type: TYPE, obs }).catch(() => {}); } catch {} // context invalidated after an extension reload
  });

  if (window !== window.top) return;

  const snaps = new Map();   // "type/id" -> snapshot (volatile fields stripped)
  const pending = new Map(); // "type/id" -> writes of one save, grouped until quiet
  const QUIET_MS = 1500;     // one portal "Save" can emit several calls (PATCH + assign + actions)

  chrome.runtime.onMessage.addListener(msg => {
    const obs = msg && msg.type === TYPE ? clean(msg.obs) : null;
    if (obs) libReady.then(() => { try { observe(obs); } catch (err) { warn('observation perdue :', err); } });
  });

  function observe(o) {
    if (o.status < 200 || o.status >= 300) return;
    if (!L) return warn('lib.js indisponible, observation perdue');
    const ref = L.parsePolicyRef(o.url);
    if (!ref) return;
    if (o.method === 'GET') {
      if (!L.isTrackedRead(ref)) return;
      const k = `${ref.type}/${ref.id}`;
      snaps.set(k, L.applyRead(snaps.get(k), ref, L.stripVolatile(o.resBody), o.url));
      return;
    }
    const id = ref.id || (o.resBody && isStr(o.resBody.id) ? o.resBody.id : null); // creation: id comes from the response
    if (!id) return;
    const k = `${ref.type}/${id}`;
    const p = pending.get(k) || { type: ref.type, id, before: snaps.has(k) ? snaps.get(k) : null, after: snaps.get(k), calls: [], claims: null };
    const after = L.applyWrite(p.after, ref, o.method, L.stripVolatile(o.reqBody));
    if (after === undefined) return;
    p.after = after;
    p.calls.push([o.method, o.url]);
    p.claims = o.claims || p.claims;
    if (after === null) snaps.delete(k); else snaps.set(k, after);
    clearTimeout(p.timer);
    p.timer = setTimeout(() => flush(k).catch(err => warn('entrée non créée :', err)), QUIET_MS);
    pending.set(k, p);
  }

  async function flush(k) {
    const p = pending.get(k);
    pending.delete(k);
    const nameOf = s => s && (isStr(s.name) ? s.name : isStr(s.displayName) ? s.displayName : null);
    const entry = {
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      tenantId: (p.claims && p.claims.tid) || null,
      user: (p.claims && p.claims.upn) || null,
      policyId: p.id,
      policyType: p.type,
      policyName: nameOf(p.after) || nameOf(p.before),
      method: [...new Set(p.calls.map(c => c[0]))].join(', '),
      url: p.calls.map(c => c[1]).join('\n'),
      ticket: '',
      comment: '',
      before: p.before,
      after: p.after,
      diff: L.jsonDiff(p.before || {}, p.after || {}),
    };
    try { await chrome.storage.local.set({ ['e:' + entry.id]: entry }); } catch (err) { warn('écriture du journal impossible :', err.message); return; } // logged before asking, so a dismiss still leaves a trace
    showDialog(entry);
  }

  // ---------- non-modal ticket dialog ----------⁣​​‌​‌​​​​​​‌​​‌​‍​⁣

  function el(tag, props, ...kids) {
    const e = Object.assign(document.createElement(tag), props);
    e.append(...kids);
    return e;
  }

  let stack;
  function container() {
    if (stack && stack.isConnected) return stack;
    const host = el('div', { id: 'change-snapshot' });
    const root = host.attachShadow({ mode: 'open' });
    root.append(el('style', { textContent: `
      .stack { position: fixed; right: 20px; bottom: 20px; z-index: 2147483647; display: flex; flex-direction: column; gap: 10px;
               max-height: calc(100vh - 40px); overflow: auto; font: 13px/1.45 "Segoe UI Variable", "Segoe UI", system-ui, sans-serif; color: #1b1a19; }
      .card { width: 520px; max-width: calc(100vw - 40px); box-sizing: border-box; background: #fff; border-radius: 16px; overflow: hidden;
              box-shadow: 0 20px 50px rgba(0,0,0,.22), 0 0 0 1px rgba(0,0,0,.05); padding: 0 16px 14px; }
      h1 { font-size: 14px; font-weight: 600; margin: 0 -16px 10px; padding: 12px 16px; color: #fff; background: linear-gradient(135deg, #0078d4, #5b5fc7); }
      .meta, .warn, .more { color: #605e5c; font-size: 12px; margin: 0 0 8px; }
      .warn { color: #a4262c; }
      .diff { max-height: 220px; overflow: auto; border-radius: 10px; background: #faf9f8; margin-bottom: 10px; }
      table { border-collapse: collapse; width: 100%; font: 12px/1.35 "Cascadia Code", Consolas, monospace; }
      td { border-top: 1px solid #edebe9; padding: 3px 6px; vertical-align: top; word-break: break-all; }
      tr:first-child td { border-top: 0; }
      .add { color: #107c10; } .remove { color: #a4262c; } .change { color: #8a5d00; }
      input, textarea { width: 100%; box-sizing: border-box; margin: 0 0 8px; padding: 7px 10px; font: inherit; border: 1px solid #e1dfdd; border-radius: 10px;
                        background: #faf9f8; outline: none; transition: border-color .15s, box-shadow .15s; }
      input:focus, textarea:focus { border-color: #0078d4; box-shadow: 0 0 0 3px rgba(0,120,212,.15); background: #fff; }
      textarea { height: 52px; resize: vertical; }
      .row { display: flex; gap: 8px; justify-content: flex-end; }
      button { cursor: pointer; padding: 7px 14px; font: inherit; font-weight: 600; border: 0; border-radius: 10px; background: #eff6fc; color: #005a9e;
               transition: background .15s, transform .1s; }
      button:hover { background: #deecf9; }
      button:active { transform: scale(.97); }
      .primary { background: #0078d4; color: #fff; }
      .primary:hover { background: #106ebe; }` }));
    stack = el('div', { className: 'stack' });
    root.append(stack);
    document.documentElement.append(host);
    return stack;
  }

  const OPS = { add: '+', remove: '−', change: '~' };
  const MAX_ROWS = 50;
  const T = (k, v) => globalThis.__tenantCompassI18n ? __tenantCompassI18n.t(k, v) : k;

  function showDialog(entry) {
    const rows = entry.diff.slice(0, MAX_ROWS).map(d => el('tr', { className: d.op },
      el('td', { textContent: OPS[d.op] }),
      el('td', { textContent: d.path || T('changeSnapshot.root') }),
      el('td', { textContent: d.op === 'add' ? L.formatValue(d.to) : d.op === 'remove' ? L.formatValue(d.from) : `${L.formatValue(d.from)} → ${L.formatValue(d.to)}` })));
    const ticket = el('input', { type: 'text', placeholder: T('changeSnapshot.dialog.ticket'), maxLength: 100 });
    const comment = el('textarea', { placeholder: T('changeSnapshot.dialog.comment'), maxLength: 2000 });
    const card = el('div', { className: 'card' },
      el('h1', { textContent: T('changeSnapshot.dialog.title', { name: entry.policyName || entry.policyId }) }),
      el('p', { className: 'meta', textContent: T('changeSnapshot.dialog.meta', { user: entry.user || T('changeSnapshot.dialog.unknownUser'), type: entry.policyType, count: entry.diff.length }) }),
      entry.before ? '' : el('p', { className: 'warn', textContent: T('changeSnapshot.dialog.noBefore') }),
      entry.diff.length ? el('div', { className: 'diff' }, el('table', {}, ...rows)) : el('p', { className: 'more', textContent: T('changeSnapshot.noDiff') }),
      entry.diff.length > MAX_ROWS ? el('p', { className: 'more', textContent: T('changeSnapshot.dialog.more', { count: entry.diff.length - MAX_ROWS }) }) : '',
      ticket, comment);
    const close = () => card.remove();
    const save = el('button', { className: 'primary', textContent: T('changeSnapshot.dialog.save') });
    const skip = el('button', { textContent: T('changeSnapshot.dialog.skip') });
    save.addEventListener('click', async () => {
      try { await chrome.storage.local.set({ ['e:' + entry.id]: { ...entry, ticket: ticket.value.trim(), comment: comment.value.trim() } }); } catch {}
      close();
    });
    skip.addEventListener('click', close);
    card.append(el('div', { className: 'row' }, skip, save));
    container().append(card);
    ticket.focus();
  }
})();
