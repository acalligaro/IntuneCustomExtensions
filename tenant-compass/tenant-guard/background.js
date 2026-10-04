// Keeps the tenant state detected by each tab's top frame, so portal iframes and the popup can read it.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣

const key = tabId => 't' + tabId;

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const tabId = sender.tab?.id;
  if (tabId == null) return;

  if (msg.type === 'state') {
    chrome.storage.session.set({ [key(tabId)]: msg.state });
    chrome.tabs.sendMessage(tabId, msg).catch(() => {});
    chrome.action.setBadgeText({ tabId, text: msg.state.prod ? 'PROD' : '' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: msg.state.color });
  }

  if (msg.type === 'getState') {
    chrome.storage.session.get(key(tabId)).then(r => reply(r[key(tabId)] || null));
    return true;
  }
});

chrome.tabs.onRemoved.addListener(tabId => chrome.storage.session.remove(key(tabId)));
//⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
