// MAIN world, every portal frame: observes the portal's own Graph calls (fetch + XHR), like Graph X-Ray.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
// Never delays or alters a request. Forwards bodies and the caller's UPN/tenant claims to content.js, never the token.
(() => {
  const L = globalThis.__changeSnapshotLib;
  if (!L || window.__changeSnapshotHooked) return;
  window.__changeSnapshotHooked = true;

  const TYPE = 'change-snapshot:graph';
  const WRITES = ['POST', 'PATCH', 'PUT', 'DELETE'];

  const BATCH = /^https:\/\/graph\.microsoft\.com\/(beta|v1\.0)\/\$batch\b/i;

  function wanted(method, url) {
    if (method === 'POST' && BATCH.test(url)) return true;
    const ref = L.parsePolicyRef(url);
    return !!ref && (method === 'GET' ? L.isTrackedRead(ref) : WRITES.includes(method));
  }

  function json(v) {
    if (v && typeof v === 'object') return v;
    try { return typeof v === 'string' && v ? JSON.parse(v) : null; } catch { return null; }
  }

  // claims: { upn, tid } decoded from the caller's token (never the token itself).
  function emit(method, url, status, reqBody, resBody, claims) {
    if (BATCH.test(url)) {
      // Sub-requests are relative URLs, never nested batches, so this recursion is one level deep.
      for (const s of L.expandBatch(url, json(reqBody), json(resBody)))
        if (!BATCH.test(s.url) && wanted(s.method, s.url)) emit(s.method, s.url, s.status, s.reqBody, s.resBody, claims);
      return;
    }
    try {
      if (method === 'GET') claims = null;
      window.postMessage({ type: TYPE, method, url, status, reqBody: json(reqBody), resBody: json(resBody), claims }, location.origin);
    } catch {}
  }

  function authOf(h) {
    try {
      if (!h) return null;
      if (h instanceof Headers) return h.get('authorization');
      if (Array.isArray(h)) return (h.find(p => /^authorization$/i.test(p[0])) || [])[1] || null;
      for (const k of Object.keys(h)) if (/^authorization$/i.test(k)) return h[k];
    } catch {}
    return null;
  }

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    let info = null;
    try {
      const isReq = input instanceof Request;
      const url = isReq ? input.url : String(input);
      const method = String((init && init.method) || (isReq ? input.method : 'GET')).toUpperCase();
      if (wanted(method, url)) {
        info = {
          url, method,
          auth: authOf(init && init.headers) || (isReq ? input.headers.get('authorization') : null),
          // Clone before the original fetch consumes a Request body.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
          body: init && init.body != null ? Promise.resolve(init.body) : isReq && method !== 'GET' ? input.clone().text() : Promise.resolve(null),
        };
      }
    } catch { info = null; }
    const p = origFetch.apply(this, arguments);
    if (info) {
      p.then(res => {
        if (!res.ok) return;
        const resText = method => method === 'DELETE' ? Promise.resolve(null) : res.clone().text();
        Promise.all([info.body.catch(() => null), resText(info.method).catch(() => null)])
          .then(([b, t]) => emit(info.method, info.url, res.status, typeof b === 'string' ? b : null, t, L.jwtClaims(info.auth)));
      }, () => {});
    }
    return p;
  };

  const XP = XMLHttpRequest.prototype;
  const { open, send, setRequestHeader } = XP;
  const meta = new WeakMap();
  XP.open = function (method, url) {
    try {
      const m = String(method).toUpperCase(), u = new URL(url, location.href).href;
      meta.set(this, wanted(m, u) ? { method: m, url: u, auth: null } : null);
    } catch { meta.delete(this); }
    return open.apply(this, arguments);
  };
  XP.setRequestHeader = function (name, value) {
    const m = meta.get(this);
    if (m && /^authorization$/i.test(name)) m.auth = value;
    return setRequestHeader.apply(this, arguments);
  };
  XP.send = function (body) {
    const m = meta.get(this);
    if (m) {
      const reqBody = typeof body === 'string' ? body : null;
      this.addEventListener('loadend', () => {
        if (this.status < 200 || this.status >= 300) return;
        let res = null;
        try { res = this.responseType === '' || this.responseType === 'text' ? this.responseText : this.responseType === 'json' ? this.response : null; } catch {}
        emit(m.method, m.url, this.status, reqBody, res, L.jwtClaims(m.auth));
      }, { once: true });
    }
    return send.apply(this, arguments);
  };

  // ---------- Web Workers ----------
  // The portal now runs its Knockout blades in a blob: Web Worker, whose Graph calls the hooks above never see.
  // Wrap Worker so each classic blob worker first runs a small hook, then the portal's own script (importScripts).
  // The hook relays Graph traffic (bodies + decoded upn/tid, never the token) over a same-origin BroadcastChannel.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
  // Per-frame name: BroadcastChannel is shared by every tab and frame of the origin, a fixed name would mix them.
  const CHANNEL = 'change-snapshot:worker:' + crypto.randomUUID();
  function workerHook(CH, jwtClaims) {
    const ch = new BroadcastChannel(CH);
    const RE = /^https:\/\/graph\.microsoft\.com\/(beta|v1\.0)\/(\$batch|deviceManagement\/|deviceAppManagement\/)/i;
    const post = (method, url, status, reqBody, resBody, auth) => {
      try { ch.postMessage({ method, url, status, reqBody, resBody, claims: method === 'GET' ? null : jwtClaims(auth) }); } catch {}
    };
    const authOf = h => { try { return h ? new Headers(h).get('authorization') : null; } catch { return null; } };
    const f = self.fetch;
    self.fetch = function (input, init) {
      const p = f.apply(this, arguments);
      try {
        const isReq = input instanceof Request;
        const url = new URL(isReq ? input.url : String(input), self.location.href).href;
        const method = String((init && init.method) || (isReq ? input.method : 'GET')).toUpperCase();
        if (RE.test(url)) {
          const auth = authOf(init && init.headers) || (isReq ? input.headers.get('authorization') : null);
          const body = init && typeof init.body === 'string' ? init.body : null;
          p.then(r => { if (r.ok) (method === 'DELETE' ? Promise.resolve(null) : r.clone().text()).then(t => post(method, url, r.status, body, t, auth), () => {}); }, () => {});
        }
      } catch {}
      return p;
    };
    const X = XMLHttpRequest.prototype, open = X.open, send = X.send, setH = X.setRequestHeader, meta = new WeakMap();
    X.open = function (m, u) { try { const url = new URL(u, self.location.href).href; meta.set(this, RE.test(url) ? { method: String(m).toUpperCase(), url, auth: null } : null); } catch {} return open.apply(this, arguments); };
    X.setRequestHeader = function (k, v) { const m = meta.get(this); if (m && /^authorization$/i.test(k)) m.auth = v; return setH.apply(this, arguments); };
    X.send = function (body) {
      const m = meta.get(this);
      if (m) this.addEventListener('loadend', () => {
        if (this.status < 200 || this.status >= 300) return;
        let res = null;
        try { res = this.responseType === '' || this.responseType === 'text' ? this.responseText : this.responseType === 'json' ? JSON.stringify(this.response) : null; } catch {}
        post(m.method, m.url, this.status, typeof body === 'string' ? body : null, res, m.auth);
      }, { once: true });
      return send.apply(this, arguments);
    };
  }

  // Every frame listens to the workers it created (the edit wizard is a React blade in a *.portal.azure.net iframe);
  // the per-frame channel name keeps frames and tabs apart.
  new BroadcastChannel(CHANNEL).onmessage = e => {
    const d = e.data;
    if (!d || typeof d.method !== 'string' || typeof d.url !== 'string' || !Number.isInteger(d.status)) return;
    if (wanted(d.method, d.url)) emit(d.method, d.url, d.status, d.reqBody, d.resBody, d.claims);
  };

  const NativeWorker = window.Worker;
  if (NativeWorker) {
    const prelude = `(${workerHook})(${JSON.stringify(CHANNEL)}, ${L.jwtClaims.toString()});\n`;
    window.Worker = new Proxy(NativeWorker, {
      construct(T, args, NT) {
        try {
          const [url, opts] = args;
          // ponytail: classic blob: workers only (the portal's case); module or https workers run unhooked.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
          if (String(url).startsWith('blob:') && !(opts && opts.type === 'module')) {
            const src = URL.createObjectURL(new Blob([prelude + `importScripts(${JSON.stringify(String(url))});`], { type: 'text/javascript' }));
            return Reflect.construct(T, [src, ...args.slice(1)], NT);
          }
        } catch {}
        return Reflect.construct(T, args, NT);
      },
    });
  }
})();
