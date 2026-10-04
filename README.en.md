# Tenant Compass

*Toolbox for the Microsoft Intune portal* · [Version française](README.md)

Chrome / Edge extension (Manifest V3), toolbox for the Microsoft Intune portal. Dependency-free JavaScript with no build step, and no app to register in the tenant: the extension reuses the portal's Microsoft Graph session.

![Tenant Compass in the portal](tenant-compass/docs/img/readme/en/01-portail-tenant-guard.jpg)

## Extensions

| Folder | Extension | Role |
|---|---|---|
| [`tenant-compass/`](tenant-compass/README.en.md) ([Français](tenant-compass/README.md)) | **Tenant Compass** | Tenant Guard, As-Built, setting card (Setting Inspector, Settings Explainer, OpenIntuneBaseline), Assignment Lens, Change Snapshot, Set Tenant Language and PIM shortcut in a single extension, each toggled separately from the menu, in French or English |

Tenant Compass technical documentation (in French): [`tenant-compass/ARCHITECTURE.md`](tenant-compass/ARCHITECTURE.md).

## Installation

1. Open `edge://extensions` (or `chrome://extensions`), turn on **developer mode**.
2. **Load unpacked** and pick the `tenant-compass/` folder.

## Tests

Each feature has a dependency-free `test.js`:

```
node tenant-compass/tenant-guard/test.js
node tenant-compass/as-built/test.js
node tenant-compass/setting-inspector/test.js
node tenant-compass/assignment-lens/test.js
node tenant-compass/change-snapshot/test.js
node tenant-compass/portal-language/test.js
node tenant-compass/settings-explainer/test.js
```

## Security

- The portal's access token is never stored, nor sent anywhere other than `graph.microsoft.com`.
- As-Built and Assignment Lens only read from Graph (`GET`).
- Graph data is never injected as HTML.
- Details per feature in each README and in `ARCHITECTURE.md`.

## License

[PolyForm Noncommercial 1.0.0](tenant-compass/LICENSE): see the License section of the [extension README](tenant-compass/README.en.md#license). The OpenIntuneBaseline data (`tenant-compass/setting-inspector/data/oib.json`) is under GPL-3.0 ([notice](tenant-compass/setting-inspector/data/OIB-NOTICE.md)).
<!--⁣​​‌​‌​​​​​​‌​​‌​‍​⁣ -->
