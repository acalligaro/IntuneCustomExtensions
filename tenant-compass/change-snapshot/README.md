# Change Snapshot

Extension Chrome / Edge (Manifest V3) qui trace les modifications de stratégies Intune faites dans le portail, sans pipeline
(contrairement à IntuneCD ou Microsoft365DSC) : à chaque enregistrement, elle journalise **qui** a modifié **quoi**, **quand**,
avec le **diff avant/après** et un **n° de ticket** saisi par l'administrateur.

## Activation

Fonction de **Tenant Compass** : activée par défaut, désactivable dans le menu (⚙ Paramètres). Le journal s'ouvre avec le bouton **Journal** du menu. Recharger les onglets Intune déjà ouverts après l'activation.

## Fonctionnement

> Depuis 2026, le portail exécute une partie de ses blades dans un Web Worker (`blob:`) et l'édition dans des iframes `*.reactblade.portal.azure.net`. `page.js` enveloppe `Worker` pour injecter le même observateur dans ces workers (relais via un `BroadcastChannel` propre à chaque page) et tourne dans toutes les frames. Seules les erreurs sont écrites dans la console (`[Change Snapshot]`, niveau avertissement).

1. **Avant** : quand une stratégie est ouverte dans le portail, celui-ci lit son JSON via Microsoft Graph. L'extension observe
   ces réponses (comme Graph X-Ray, en enveloppant `fetch` et `XMLHttpRequest` dans la page) et garde en mémoire, par onglet,
   le dernier état connu de chaque stratégie (objet + `settings`, `assignments`, `definitionValues`, etc.).
2. **Après** : quand le portail envoie une écriture (`PATCH`, `PUT`, `POST`, `DELETE`) sur cette stratégie et que Graph répond
   **2xx**, l'extension calcule l'état « après » à partir du corps de la requête. Les appels d'un même « Enregistrer »
   (ex. `PATCH` + `assign`) sont regroupés (1,5 s sans nouvel appel).
3. **Diff** : les champs volatils (`lastModifiedDateTime`, `version`, `settingCount`, annotations `@odata.*`…) sont retirés, puis
   un diff champ par champ est calculé. Les listes Settings Catalog sont appariées par `settingDefinitionId` (un simple
   réordonnancement n'est pas une différence), les affectations par groupe cible.
4. **Journal** : l'entrée est enregistrée **immédiatement** (ticket vide), puis une fenêtre non bloquante s'affiche en bas à
   droite avec le diff, un champ ticket et un commentaire. « Ignorer » conserve l'entrée, marquée **sans ticket** dans le journal.
5. **Consultation** : bouton **Journal** du menu de l'extension → page Journal : filtres stratégie / utilisateur / dates, détail du diff et
   JSON avant/après, export **JSON** et **CSV** (séparateur `;`, UTF-8 avec BOM pour Excel FR), vidage avec confirmation.

Entrée stockée : `{id, ts, tenantId, user, policyId, policyType, policyName, method, url, ticket, comment, before, after, diff, env}` (`env` : `prod`, `non-prod` selon Tenant Guard, ou `null`).

Réglages (`chrome.storage.sync`, clé `snapshot`) : `promptProd` (défaut `true`), `promptNonProd` (défaut `false`), `purge` (défaut `true`) et `retentionDays` (défaut `14`, de 1 à 3650) : entrées plus anciennes supprimées au réveil du service worker.

## Modèle de sécurité

- **Le jeton n'est jamais conservé ni transmis.** Le script de page lit l'en-tête `Authorization` des écritures observées,
  décode localement la partie « payload » du JWT (base64url, sans vérification de signature) et n'en extrait que
  `upn` / `unique_name` / `preferred_username` et `tid`. Seules ces deux valeurs quittent le monde `MAIN`.
- **Aucune donnée ne quitte le navigateur** : cette fonction ne fait aucun appel réseau (les permissions d'hôte de Tenant Compass servent à injecter les scripts) ;
  stockage uniquement dans `chrome.storage.local` (permission `unlimitedStorage`).
- **Les requêtes du portail ne sont ni bloquées, ni retardées, ni modifiées** : l'extension lit des copies (`clone()`) des
  requêtes / réponses, après coup.
- Messages monde `MAIN` → monde isolé : `postMessage` limité à l'origine de la page, vérification `source` / `origin`, type
  préfixé `change-snapshot:graph`, forme validée champ par champ et objet reconstruit (aucun champ inattendu ne passe).
- Tout texte affiché (dialogue, journal) passe par `textContent`, jamais `innerHTML`. Dialogue dans un Shadow DOM.
- Les valeurs de champs ressemblant à des secrets (`*password`, `*secret`, `*preSharedKey`, `*passphrase`, valeurs Settings
  Catalog de type `SecretSettingValue`) sont remplacées par `[masqué]` avant stockage. Conséquence : un changement de secret
  n'apparaît pas dans le diff.
- Le journal est **local et modifiable** par quiconque a accès au profil navigateur : c'est une aide à la traçabilité, pas une
  piste d'audit infalsifiable (le journal d'audit Intune reste la référence). Un script de la page portail pourrait aussi
  forger des observations : même niveau de confiance que le portail lui-même.

## Limites (v1)

- **Pas d'obligation de ticket** : le ticket est demandé après l'enregistrement, jamais avant. Bloquer la requête du portail
  serait fragile et risqué ; l'application stricte est hors périmètre v1. Les entrées sans ticket sont signalées.
- **État « avant » requis** : si la stratégie n'a pas été lue depuis le chargement de l'onglet (ex. extension installée
  pendant l'édition), le diff part d'un état vide (signalé dans le dialogue et le journal).
- **État « après » reconstruit** à partir du corps envoyé (fusion pour `PATCH`/`PUT`), pas relu dans Graph. Un `PUT` qui
  supprimerait un champ de premier niveau ne le montre pas comme retiré.
- **Heuristiques non testées sur le portail réel** (tests unitaires uniquement) : forme exacte des appels du portail
  (`PUT` vs `PATCH` Settings Catalog, `updateSettings` des intents, `updateDefinitionValues` ADMX, actions de conformité),
  iframes utilisées, réponses paginées des `settings`.
- ADMX (`groupPolicyConfigurations`) : les `presentationValues` lus (`$expand=presentation`) et envoyés
  (`presentation@odata.bind`) n'ont pas la même forme, le diff peut être bruité.
- Pris en charge depuis la v0.2 : syntaxe `collection('id')` utilisée par le portail, et appels `$batch` JSON (chaque sous-requête est traitée comme un appel direct).
- Non couverts : clouds nationaux (`graph.microsoft.us`, etc.), modifications
  faites hors portail (PowerShell, Graph Explorer, autre navigateur).
- Un même onglet est nécessaire pour la lecture et l'enregistrement (cache en mémoire de l'onglet).

## Points de terminaison couverts

Hôte `https://graph.microsoft.com/(beta|v1.0)/`, collections :

- `deviceManagement/` : `configurationPolicies`, `compliancePolicies`, `deviceConfigurations`, `deviceCompliancePolicies`,
  `groupPolicyConfigurations`, `intents`, `deviceManagementScripts`, `deviceHealthScripts`, `deviceShellScripts`,
  `windowsFeatureUpdateProfiles`, `windowsQualityUpdateProfiles`, `windowsDriverUpdateProfiles`,
  `deviceEnrollmentConfigurations`, `windowsAutopilotDeploymentProfiles`, `assignmentFilters`
- `deviceAppManagement/` : `iosManagedAppProtections`, `androidManagedAppProtections`, `windowsManagedAppProtections`,
  `targetedManagedAppConfigurations`, `mobileAppConfigurations`

Lectures prises en compte : `{id}`, `{id}/settings`, `{id}/assignments`, `{id}/definitionValues`,
`{id}/definitionValues/{id}/presentationValues`, `{id}/scheduledActionsForRule`.

Écritures : `PATCH`/`PUT`/`DELETE {id}`, `POST` sur la collection (création), `POST {id}/assign`,
`POST intents/{id}/updateSettings`, `POST groupPolicyConfigurations/{id}/updateDefinitionValues`, `PATCH`/`DELETE` d'un
élément de sous-collection, autres actions `POST {id}/<action>` (corps enregistré tel quel sous le nom de l'action).

Références Microsoft Learn :
[Update deviceManagementConfigurationPolicy](https://learn.microsoft.com/graph/api/intune-deviceconfigv2-devicemanagementconfigurationpolicy-update?view=graph-rest-beta),
[Update deviceManagementConfigurationSetting](https://learn.microsoft.com/graph/api/intune-deviceconfigv2-devicemanagementconfigurationsetting-update?view=graph-rest-beta),
[Update windows10CompliancePolicy](https://learn.microsoft.com/graph/api/intune-deviceconfig-windows10compliancepolicy-update?view=graph-rest-1.0),
[updateDefinitionValues](https://learn.microsoft.com/graph/api/intune-grouppolicy-grouppolicyconfiguration-updatedefinitionvalues?view=graph-rest-beta),
[Update groupPolicyDefinitionValue](https://learn.microsoft.com/graph/api/intune-grouppolicy-grouppolicydefinitionvalue-update?view=graph-rest-beta),
[intents updateSettings](https://learn.microsoft.com/graph/api/intune-deviceintent-devicemanagementintent-updatesettings?view=graph-rest-beta).

## Fichiers

| Fichier | Rôle |
| --- | --- |
| — | Déclaration : manifest et enregistrement communs de Tenant Compass (`../manifest.json`, `../background.js`) |
| `lib.js` | Fonctions pures (analyse d'URL, nettoyage, fusion avant/après, diff, claims JWT, CSV) |
| `page.js` | Monde `MAIN` : observation de `fetch` / XHR |
| `content.js` | Monde isolé : validation, cache « avant », journalisation, dialogue ticket |
| `background.js` | Relais iframe → cadre principal (importé par `../background.js`) |
| `journal.html` / `journal.js` | Journal, filtres, exports |
| `test.js` | Tests : `node tenant-compass/change-snapshot/test.js` |
