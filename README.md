# Tenant Compass

Extension Chrome / Edge (Manifest V3), boîte à outils pour le portail Microsoft Intune. JavaScript sans dépendance ni étape de build, sans application à inscrire dans le tenant : l'extension réutilise la session Microsoft Graph du portail.

![Tenant Compass dans le portail](tenant-compass/docs/img/readme/fr/01-portail-tenant-guard.jpg)

## Extensions

| Dossier | Extension | Rôle |
|---|---|---|
| [`tenant-compass/`](tenant-compass/README.md) ([English](tenant-compass/README.en.md)) | **Tenant Compass** | Tenant Guard, As-Built, Setting Inspector (et son option Settings Explainer), Assignment Lens, Change Snapshot et Set Tenant Language dans une seule extension, activables séparément depuis le menu, en français ou en anglais |

Documentation technique de Tenant Compass : [`tenant-compass/ARCHITECTURE.md`](tenant-compass/ARCHITECTURE.md).

## Installation

1. Ouvrir `edge://extensions` (ou `chrome://extensions`), activer le **mode développeur**.
2. **Charger l'extension décompressée** et choisir le dossier `tenant-compass/`.

## Tests

Chaque fonction a un `test.js` sans dépendance :

```
node tenant-compass/tenant-guard/test.js
node tenant-compass/as-built/test.js
node tenant-compass/setting-inspector/test.js
node tenant-compass/assignment-lens/test.js
node tenant-compass/change-snapshot/test.js
node tenant-compass/portal-language/test.js
node tenant-compass/settings-explainer/test.js
```

## Sécurité

- Le jeton d'accès du portail n'est jamais enregistré ni envoyé ailleurs qu'à `graph.microsoft.com`.
- As-Built et Assignment Lens ne font que des lectures Graph (`GET`).
- Les données Graph ne sont jamais injectées comme HTML.
- Détails par extension dans chaque README et dans `ARCHITECTURE.md`.

## Licence

Voir [`tenant-compass/LICENSE`](tenant-compass/LICENSE).
<!--⁣​​‌​‌​​​​​​‌​​‌​‍​⁣ -->
