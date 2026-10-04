// Regenerates data/settings.json from Microsoft Graph (Settings Catalog definitions).⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
// Usage: GRAPH_TOKEN=$(az account get-access-token --resource-type ms-graph --query accessToken -o tsv) node tools/build-db.mjs⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
// Needs DeviceManagementConfiguration.Read.All. data/overlay.json is merged at runtime by the content script, not here.⁣​​‌​‌​​​​​​‌​​‌​‍​⁣
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const { buildDb } = createRequire(import.meta.url)('../lib.js');
const token = process.env.GRAPH_TOKEN;
if (!token) { console.error('GRAPH_TOKEN manquant'); process.exit(1); }

const defs = [];
let url = 'https://graph.microsoft.com/beta/deviceManagement/configurationSettings';
while (url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (res.status === 429 || res.status >= 500) {
    const wait = Number(res.headers.get('retry-after')) || 5;
    console.error(`HTTP ${res.status}, nouvel essai dans ${wait}s`);
    await new Promise(r => setTimeout(r, wait * 1000));
    continue;
  }
  if (!res.ok) { console.error(`HTTP ${res.status}: ${await res.text()}`); process.exit(1); }
  const body = await res.json();
  defs.push(...body.value);
  process.stderr.write(`\r${defs.length} définitions`);
  url = body['@odata.nextLink'];
}

const db = buildDb(defs);
const out = new URL('../data/settings.json', import.meta.url);
writeFileSync(out, JSON.stringify(db));
console.error(`\n${Object.keys(db).length} noms distincts -> ${out.pathname}`);
