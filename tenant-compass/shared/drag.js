// MAIN world, shared by As-Built and Assignment Lens (same window): drag a fixed element by a handle.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
// Position remembered per key in the portal's localStorage. Call after the element is in the DOM.
(() => {
  // One panel at a time (As-Built, Assignment Lens): opening one closes the others in this page.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
  // __tenantCompassExclusive(id, close) registers `close` and returns opened(), to call when panel `id` opens.
  if (!window.__tenantCompassExclusive) {
    const EVT = 'tenant-compass:panel-open';
    window.__tenantCompassExclusive = (id, close) => {
      window.addEventListener(EVT, e => { if (e.detail !== id) close(); });
      return () => window.dispatchEvent(new CustomEvent(EVT, { detail: id }));
    };
  }
  if (window.__tenantCompassDrag) return;
  const KEY = 'tenant-compass:pos:';

  function place(el, x, y) {
    const r = el.getBoundingClientRect();
    x = Math.min(Math.max(0, x), innerWidth - r.width);
    y = Math.min(Math.max(0, y), innerHeight - r.height);
    Object.assign(el.style, { left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto' });
  }

  window.__tenantCompassDrag = (el, handle, key) => {
    // ponytail: a later window shrink can leave it partly off-screen until the next resize of the element or drag.
    try { const p = JSON.parse(localStorage.getItem(KEY + key)); if (p) place(el, p.x, p.y); } catch {}
    // A placed panel grows as its content loads (groups, members): keep it on screen, not under the buttons below it.
    new ResizeObserver(() => { if (el.isConnected && el.style.top) place(el, parseFloat(el.style.left), parseFloat(el.style.top)); }).observe(el);
    handle.style.cursor = 'move';
    handle.style.touchAction = 'none';
    handle.addEventListener('pointerdown', e => {
      // Inner buttons (close, refresh…) keep their click; the handle itself may be a button (floating button).
      if (e.button !== 0 || (e.target !== handle && e.target.closest && e.target.closest('button'))) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top, sx = e.clientX, sy = e.clientY;
      let moved = false;
      handle.setPointerCapture(e.pointerId);
      const move = ev => {
        if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return; // below 4 px it is a click
        moved = true;
        place(el, ev.clientX - dx, ev.clientY - dy);
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        if (!moved) return;
        const p = el.getBoundingClientRect();
        try { localStorage.setItem(KEY + key, JSON.stringify({ x: Math.round(p.left), y: Math.round(p.top) })); } catch {}
        // A drag must not also toggle the panel: swallow the click that follows pointerup.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
        const swallow = ev => { ev.stopImmediatePropagation(); ev.preventDefault(); };
        handle.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => handle.removeEventListener('click', swallow, { capture: true }), 0);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  };
})();
