// MAIN world, document_start. Forwards the portal's own Graph responses about Settings Catalog definitions⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
// to content.js (same frame) so every setting the portal loads becomes inspectable. No token is read or forwarded.
(() => {
  const RE = /^https:\/\/graph\.microsoft\.com\/(beta|v1\.0)\/(\$batch|deviceManagement\/(configurationSettings|configurationPolicies|configurationPolicyTemplates|reusableSettings|inventoryPolicies|compliancePolicies))/i;
  const send = json => window.postMessage({ type: 'setting-inspector:graph', json }, location.origin);
  const abs = u => { try { return new URL(u, location.href).href; } catch { return ''; } };

  // Diagnostic: which frame is hooked, and which Graph paths it sees (once per path).⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
  console.info('[Setting Inspector] hook actif :', location.origin);
  const seen = new Set();
  function trace(method, url) {
    if (!url.startsWith('https://graph.microsoft.com/') || seen.size > 50) return;
    const path = url.split('?')[0];
    if (seen.has(path)) return;
    seen.add(path);
    console.info(`[Setting Inspector] Graph ${method} ${path} -> ${RE.test(url) ? 'capturé' : 'ignoré'}`);
  }

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const p = origFetch.apply(this, arguments);
    const url = abs(input instanceof Request ? input.url : String(input));
    trace(String((init && init.method) || (input instanceof Request ? input.method : 'GET')).toUpperCase(), url);
    if (RE.test(url)) p.then(r => r.ok && r.clone().json().then(send)).catch(() => {});
    return p;
  };

  // Knockout editor/summary (top frame): the portal shows localized names (FR) while Graph definitions are English,⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
  // so name matching fails. Each row's view model carries the definition: tag the hovered row with it for content.js.
  // ponytail: tag is cached on the element; if Knockout recycles a node for another setting the card can be stale.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
  document.addEventListener('mouseover', e => {
    const ko = window.ko;
    if (!ko || typeof ko.dataFor !== 'function') return;
    for (let el = e.target, i = 0; el && el.nodeType === 1 && i < 8; el = el.parentElement, i++) {
      if (el.hasAttribute('data-si-def')) return;
      let s;
      try { s = ko.dataFor(el)?.settingVM; } catch { return; }
      const id = s && ko.unwrap(s.id);
      if (typeof id !== 'string' || !id.includes('_')) continue;
      const js = k => { try { return ko.toJS(s[k]); } catch { return undefined; } };
      el.setAttribute('data-si-def', JSON.stringify({ id, displayName: js('displayName'), baseUri: js('baseUri'), offsetUri: js('offsetUri'),
        applicability: js('applicability'), infoUrls: js('infoUrls') }));
      return;
    }
  }, true);

  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    trace(String(method).toUpperCase(), abs(url));
    if (RE.test(abs(url))) {
      this.addEventListener('load', () => {
        if (this.status < 200 || this.status >= 300) return;
        try {
          const t = this.responseType;
          send(t === 'json' ? this.response : JSON.parse(t === '' || t === 'text' ? this.responseText : ''));
        } catch {}
      });
    }
    return open.apply(this, arguments);
  };
})();
