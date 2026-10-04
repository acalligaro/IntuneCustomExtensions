// Imported by the service worker (after csp.js): fetches the Learn CSP page of a hovered setting (content scripts cannot, CORS),
// parses it with csp.js and answers with that setting's documentation. Pages are cached 7 days in chrome.storage.local
// (`learn2:<lang>:<page>`, prefix bumped with the parser), failures 1 minute in memory. Block-scoped: the service worker shares one global scope.
{

const TTL = 7 * 86400e3;
const CACHE = 'learn3:'; // bump when csp.js parses differently: old cached pages are then ignored
const FAIL_TTL = 60e3;
const mem = new Map(); // `${lang}:${slug}` -> Promise<{ lang, entries } | null>

async function fetchPage(slug, lang) {
  const url = learnUrl(slug, lang);
  if (!url) return null;
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseCspPage(await res.text());
}

// Parsed page in the requested language; French falls back to English when the page has no parsable entry.
function page(slug, lang) {
  const key = `${lang}:${slug}`;
  if (mem.has(key)) return mem.get(key);
  const p = (async () => {
    const skey = CACHE + key;
    const cached = (await chrome.storage.local.get(skey))[skey];
    if (cached && Date.now() - cached.at < TTL) return cached.data;
    let entries = await fetchPage(slug, lang).catch(() => null), got = lang;
    if (!entries || !entries.length) {
      if (lang === 'en') throw new Error('page vide');
      entries = await fetchPage(slug, 'en');
      got = 'en';
    }
    const data = { lang: got, entries };
    chrome.storage.local.set({ [skey]: { at: Date.now(), data } });
    return data;
  })().catch(e => {
    console.info('[Settings Explainer] Learn', slug, e.message);
    setTimeout(() => mem.delete(key), FAIL_TTL);
    return null;
  });
  mem.set(key, p);
  return p;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !msg || msg.type !== 'learn' || !learnUrl(msg.slug, 'en')) return;
  const lang = msg.lang === 'fr' ? 'fr' : 'en';
  page(msg.slug, lang).then(data => {
    const doc = data && findDoc(data.entries, msg.uri, msg.anchor);
    reply(doc ? { ...doc, page: msg.slug, lang: data.lang, url: learnUrl(msg.slug, data.lang) + (doc.anchor ? '#' + doc.anchor : '') } : null);
  });
  return true; // async reply
});
}
