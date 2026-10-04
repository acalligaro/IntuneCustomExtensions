// Relays observations from any portal frame to the tab's top frame (Graph calls often run in a hidden iframe).⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === 'change-snapshot:graph' && sender.id === chrome.runtime.id && sender.tab && sender.tab.id >= 0)
    chrome.tabs.sendMessage(sender.tab.id, msg, { frameId: 0 }).catch(() => {});
});

// Tenant Compass: the journal opens from the menu (popup.js), the toolbar click opens the popup.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
//⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
