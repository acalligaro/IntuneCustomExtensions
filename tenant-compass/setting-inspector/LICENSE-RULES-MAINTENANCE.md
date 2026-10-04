# Licence rules: maintenance guide (for AI agents)

The Setting Inspector card shows a **Licence requise** row for each Settings Catalog setting. This file explains how that value is computed and how to keep the data current.

## Where things live

- `data/overlay.json`, top-level key `_licenseRules`: `{ verified, source, rules: [{ feature, match: [...], license }] }`. Keys starting with `_` are reserved and are never setting ids. Nothing iterates over overlay entries today; if you add code that does, skip `_` keys.
- `lib.js` → `licenseFor(def, rules)`: pure function, returns `{ text, source }` (plus `feature`, `verified` when a rule matched).
- `content.js` → `entry()`: renders the row, and the footnote "Source : table Learn vérifiée le <verified>" when `source === 'rule'`.
- `test.js`: asserts on `licenseFor` using the real rules from `overlay.json`.

## Priority order of `licenseFor`

1. `overlay[id].license` (manual per-setting override, merged into the definition). Source `overlay`.
2. First rule whose `match` entry is a case-insensitive substring of the setting id or of the lowercased OMA-URI (`baseUri + offsetUri`). Rule order matters: first match wins. Source `rule`.
3. Windows setting whose `applicability.windowsSkus` is non-empty, lacks `windowsProfessional`, and contains `windowsEnterprise` or `windowsEducation` → "Windows Enterprise E3/E5 ou Education A3/A5 (édition Pro non prise en charge)". Source `skus`.
4. Default: Windows → "Inclus : Windows Pro + Intune Plan 1"; other platforms → "Inclus : Intune Plan 1". Source `default`.

Windows is detected from `applicability.platform`, or, when absent, from `vendor_msft` / `vendor/msft` in the id or URI.

## Authoritative sources

- Windows security features licensing and edition requirements: https://learn.microsoft.com/windows/security/licensing-and-edition-requirements (main source; use the "Licensing requirements" tab, not only "Edition requirements").
- Windows commercial licensing overview: https://learn.microsoft.com/windows/whats-new/windows-licensing
- Intune add-ons (Intune Suite, EPM, Remote Help...): https://learn.microsoft.com/intune/intune-service/fundamentals/intune-add-ons
- Per-policy edition tables (to validate a precise pattern): https://learn.microsoft.com/windows/client-management/mdm/policy-configuration-service-provider and the CSP pages under `/windows/client-management/mdm/`.

Use the Microsoft Learn MCP tools (`microsoft_docs_fetch`) when available.

## Update procedure

1. Fetch the licensing table (first URL). List every feature whose "Windows Pro / Pro Education" column is "No".
2. Diff that list against `_licenseRules.rules[].feature`. Add, remove or update rules and `license` texts (French, short, e.g. "Windows Enterprise E3/E5 ou Education A3/A5").
3. For each new or changed rule, find the real Settings Catalog ids / CSP paths (see below) and write the most specific `match` patterns possible. Add both the id form (`_msft_xxx_`) and the URI form (`/msft/xxx/`) when useful.
4. Check the Intune add-ons page for new or renamed add-ons.
5. Set `verified` to today's date (YYYY-MM-DD). Update `source` if the URL moved.
6. Run `node test.js` and `python3 -m json.tool data/overlay.json` (or any JSON validator) from this folder. Add an assert in `test.js` for each new rule.
7. Reload the extension, hover a matching setting in the Intune portal and check the row and the footnote.

## Finding a setting's id

Hover the setting in the portal: the card shows **ID** with a **Copier** button, and the OMA-URI/Clé. Ids look like `device_vendor_msft_policy_config_<area>_<policy>` (user scope: `user_vendor_msft_...`), CSP-rooted ones like `device_vendor_msft_<csp>_...`, Apple ones like `com.apple.<payload>_<key>`. The CSP docs give the OMA-URI; the Settings Catalog id is that path lowercased with `/` replaced by `_` (roughly; verify with the card).

## Pitfalls

- **CSP edition list is not the licence.** A CSP may list Enterprise/Education because the feature is licensed there; another CSP may list Pro while the feature still needs E3. Prefer the licensing table; use CSP edition tables only to narrow patterns inside a CSP (e.g. Experience: only the Spotlight / consumer-features policies are "Pro: No"; `AllowCortana`, `AllowThirdPartySuggestionsInWindowsSpotlight`, `AllowTailoredExperiencesWithDiagnosticData` work on Pro).
- **Do not match all BitLocker settings.** BitLocker is in Pro; only "BitLocker advanced management" needs E3/A3, and there is no clean id discriminator, so there is no BitLocker rule. Same for DirectAccess (no Settings Catalog setting identified). `device_vendor_msft_bitlocker_requiredeviceencryption` carries a manual overlay override.
- **Credential Guard:** match only `lsacfgflags`, not all of `/deviceguard/` (VBS / HVCI settings in the same CSP are available on Pro).
- **Broad patterns are dangerous.** A wrong "Enterprise" label is worse than the default text. Never use bare words like `experience_`, `education_`, `bitlocker`, `defender`.
- **Overlay overrides win.** The 12 seed entries with `license: "Intune Plan 1"` hide any rule; update them if a rule should apply.
- Keep `_` keys out of any code that iterates overlay as setting ids.

## `proBlocked` flag (struck "Windows Pro" badge)

Set `"proBlocked": true` on a rule only when the Learn **edition** table says Windows Pro does not support the feature (e.g. Credential Guard, Personal Data Encryption, Experience customization, Federated sign-in). Do NOT set it when Pro supports the feature but the user needs an Enterprise/Education licence (licence-only, e.g. Universal Print, Always On VPN device tunnel, Remediations): there the card only shows the licence text. The skus fallback (definition excludes `windowsProfessional`) also sets `proBlocked`.
