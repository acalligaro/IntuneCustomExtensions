# OpenIntuneBaseline data notice

`oib.json` (in this folder) is derived from **OpenIntuneBaseline** (OIB), © SkipToTheEndpoint (James Robinson) and contributors:
https://github.com/SkipToTheEndpoint/OpenIntuneBaseline · https://openintunebaseline.com/

## License

OpenIntuneBaseline is licensed under the **GNU General Public License v3.0**. `oib.json` is a modified version of it and is distributed under the same license: the full text is in [`OIB-LICENSE.txt`](OIB-LICENSE.txt).

The GPL-3.0 applies to `oib.json` only. The rest of Tenant Compass is a separate program under its own license ([`../../LICENSE`](../../LICENSE)); it reads `oib.json` as data at run time, and the two are distributed together as an aggregate (GPL-3.0, section 5).

## Changes (GPL-3.0, section 5a)

- Source: OpenIntuneBaseline repository, commit `1cc71a9` (2026-09-30), Windows baseline v4.0, plus the macOS and Windows 365 Settings Catalog policies of that commit.
- Modified on 2026-10-04 by Alexandre Calligaro: from every `<PLATFORM>/IntuneManagement/SettingsCatalog/*.json` policy, only the `settingDefinitionId` of each configured setting, its value(s) and the policy name were extracted, and indexed by setting id. Nothing else was kept, and no value was changed.

## Corresponding source (GPL-3.0, section 6)

- Original data: the OpenIntuneBaseline repository at the commit above.
- Build script that turns it into `oib.json`: [`../tools/build-oib.mjs`](../tools/build-oib.mjs) (`node setting-inspector/tools/build-oib.mjs <OpenIntuneBaseline clone>`).

Update `oib.json` with that script and update the commit and date above.

## No warranty

As stated by the GPL-3.0 (sections 15 and 16), this data is provided "as is", without warranty of any kind. OpenIntuneBaseline is an opinionated community baseline, not a compliance standard: as its author states, each organization remains responsible for deciding which settings fit its needs, and policies must be tested before deployment.
