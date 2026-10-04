// Relays observations from any portal frame to the tab's top frame (Graph calls often run in a hidden iframe).⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === 'change-snapshot:graph' && sender.id === chrome.runtime.id && sender.tab && sender.tab.id >= 0)
    chrome.tabs.sendMessage(sender.tab.id, msg, { frameId: 0 }).catch(() => {});
});

// Auto-delete (settings `snapshot.purge`, on by default, and `snapshot.retentionDays`, 14 by default): runs each time the service worker wakes up, which happens on every portal visit.
importScripts('change-snapshot/lib.js'); // relative to the service worker (root background.js)
async function purgeJournal() {
  const { snapshot } = await chrome.storage.sync.get({ snapshot: {} });
  if (snapshot.purge === false) return;
  const data = await chrome.storage.local.get(null);
  const old = Object.keys(data).filter(k => k.startsWith('e:') && __changeSnapshotLib.isExpired(data[k]?.ts, Date.now(), snapshot.retentionDays));
  if (old.length) await chrome.storage.local.remove(old);
}
purgeJournal().catch(() => {});
chrome.storage.onChanged.addListener((c, area) => { if (area === 'sync' && c.snapshot) purgeJournal().catch(() => {}); });

// Tenant Compass: the journal opens from the menu (popup.js), the toolbar click opens the popup.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
//⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
