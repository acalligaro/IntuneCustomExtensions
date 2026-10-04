// Builds data/oib.json from a clone of OpenIntuneBaseline (https://github.com/SkipToTheEndpoint/OpenIntuneBaseline, GPL-3.0).
// Usage (Node 18+, no dependency), from tenant-compass/:
//   git clone --depth 1 https://github.com/SkipToTheEndpoint/OpenIntuneBaseline.git /tmp/oib
//   node setting-inspector/tools/build-oib.mjs /tmp/oib
// Reads every <PLATFORM>/IntuneManagement/SettingsCatalog/*.json (IntuneManagement exports, UTF-8 or UTF-16) and keeps,
// per settingDefinitionId, the policies that configure it and their values. Then update data/OIB-NOTICE.md (version, commit).
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repo = process.argv[2];
if (!repo || !existsSync(repo)) { console.error('usage: node build-oib.mjs <OpenIntuneBaseline clone>'); process.exit(1); }

const read = f => {
  const b = readFileSync(f);
  const s = b[0] === 0xff && b[1] === 0xfe ? b.toString('utf16le') : b.toString('utf8');
  return JSON.parse(s.replace(/^﻿/, ''));
};

// Value(s) of one setting instance: choice -> option itemId, simple -> value, collections -> list. Groups have none.
function values(i) {
  if (i.choiceSettingValue) return [i.choiceSettingValue.value];
  if (i.simpleSettingValue) return [i.simpleSettingValue.value];
  if (i.simpleSettingCollectionValue) return i.simpleSettingCollectionValue.map(v => v.value);
  if (i.choiceSettingCollectionValue) return i.choiceSettingCollectionValue.map(v => v.value);
  return null;
}
const children = i => [
  ...((i.choiceSettingValue && i.choiceSettingValue.children) || []),
  ...((i.groupSettingValue && i.groupSettingValue.children) || []),
  ...(i.groupSettingCollectionValue || []).flatMap(g => g.children || []),
  ...(i.choiceSettingCollectionValue || []).flatMap(g => g.children || []),
];

const settings = {};
const versions = {};
let policies = 0;
for (const platform of readdirSync(repo).sort()) {
  const dir = join(repo, platform, 'IntuneManagement', 'SettingsCatalog');
  if (!existsSync(dir)) continue;
  const manifest = join(repo, platform, 'PolicyManifest.json');
  if (existsSync(manifest)) versions[platform] = read(manifest).oibVersion;
  for (const f of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const pol = read(join(dir, f));
    policies++;
    const walk = i => {
      const v = values(i);
      if (v && i.settingDefinitionId) (settings[i.settingDefinitionId] ||= []).push({ p: pol.name, v });
      children(i).forEach(walk);
    };
    for (const s of pol.settings || []) walk(s.settingInstance);
  }
}

let commit = null;
try { commit = execFileSync('git', ['-C', repo, 'log', '-1', '--format=%h %cs']).toString().trim(); } catch {}
const out = {
  _meta: { source: 'OpenIntuneBaseline', url: 'https://github.com/SkipToTheEndpoint/OpenIntuneBaseline', license: 'GPL-3.0', versions, commit, policies, settings: Object.keys(settings).length },
  settings,
};
const dst = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'oib.json');
writeFileSync(dst, JSON.stringify(out));
console.log(`${policies} stratégies, ${Object.keys(settings).length} paramètres -> ${dst}`, versions, commit);
