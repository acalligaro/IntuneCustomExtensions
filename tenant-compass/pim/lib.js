// PIM shortcut: Privileged Identity Management > My roles > Microsoft Entra roles, eligible or active assignments, in a new tab.
// Opened in the tenant Tenant Guard detected in the active tab (Azure "#@<tenant>/" prefix, tested 2026-10-04),
// so a consultant on a customer tenant lands on that tenant's PIM, not on their home tenant.
(() => {
  const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const BLADE = 'view/Microsoft_Azure_PIMCommon/ActivationMenuBlade/~/aadmigratedroles';

  function pimUrl(signals = []) {
    const tenant = signals.find(s => GUID.test(s) || /^[\w-]+(\.[\w-]+)*\.onmicrosoft\.com$/i.test(s));
    return `https://portal.azure.com/#${tenant ? '@' + tenant.toLowerCase() + '/' : ''}${BLADE}`;
  }

  // Runs in the PIM page (chrome.scripting): selects "Active assignments", 2nd tab of the 3-tab pivot
  // (Eligible / Active / Expired). No URL selects it; found by position, so it works in any portal language.
  function selectActiveTab() {
    const until = Date.now() + 30000;
    (function poll() {
      const tabs = [...document.querySelectorAll('[role="tablist"]')].map(l => l.querySelectorAll('[role="tab"]')).find(t => t.length === 3);
      if (tabs) return tabs[1].click();
      if (Date.now() < until) setTimeout(poll, 500);
    })();
  }

  if (typeof module !== 'undefined') module.exports = { pimUrl, selectActiveTab };
  else globalThis.Pim = { pimUrl, selectActiveTab };
})();
