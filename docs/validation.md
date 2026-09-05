---
title: Validation de CodeInsights
description: Commandes .NET 10, tests isolés et résultats de la campagne locale.
---

# Validation de CodeInsights

## Validation P2 du 5 septembre 2026

Le lot [collaboration](p2-collaboration.md), [Boards](p2-boards.md) et
[portefeuille](p2-portfolio.md) utilise une base PostgreSQL et un Azurite dédiés
au test local, avec l'API Windows sur loopback. La migration
`CollaborationAndPortfolio` a été appliquée sur cette base ; le modèle EF ne
présente aucun changement non migré.

La même suite complète a ensuite réussi sur l'image Linux finale
`codeinsights:p2-local`, ID
`sha256:b16d4eeaf31d885d92b4f280e2222dfdfa7b9bd5d4e6b45b239641a1d4ec8d29`,
avec SPA servi et healthcheck `healthy` sous UID 1654. Le Compose a été validé
avec des valeurs de test explicites. Pour l'Azurite local depuis Docker Desktop,
utiliser un endpoint IP (style émulateur) : un hostname peut modifier
l'interprétation du chemin compte/conteneur par le SDK Blob.

- Compilation Release sans avertissement ni erreur ; checks console avec
  `CODEINSIGHTS_TEST_DB` et `CODEINSIGHTS_TEST_URL` réussis, incluant les
  régressions P0/P1 et 115 refus de routes anonymes.
- `CollaborationChecks` vérifie fingerprint/déplacement, périmètre projet/branche,
  réouverture et assignation au scan suivant, expiration idempotente, preuve
  modifiée invalidant une exception, audit rattaché au scan courant, refus
  interprojets, motifs invalides, version obsolète, filtres serveur et survie
  des décisions après purge. Les fixtures restent dans la base jetable.
- `PortfolioChecks` vérifie absence versus zéro, versions incompatibles,
  régression, fraîcheur, objectifs et rétention. Le check HTTP exerce la
  traduction PostgreSQL du filtre équipe et des bornes de période inclusives.
- `BoardsChecks` utilise un substitut HTTP : cible autorisée, marqueur exact,
  création/reprise, résultat POST perdu, 429 et mise à jour idempotente.
  L'abonnement rejoué et la boîte dédupliquée sont aussi vérifiés sur PostgreSQL.
- Build du stage frontend, TypeScript strict et cinq checks Node (dont
  `collaboration.check.mjs`) réussis. Aucun nouveau manifeste npm suivi.
- Le navigateur intégré a vérifié les écrans P2 à 390, 768 et 1440 px,
  la revue après purge, commentaire au clavier/focus visible et notification
  ciblée unique. Le portefeuille montre les mesures absentes, les régressions
  et les synthèses purgées ; un objectif a été enregistré sur une mesure réelle.
  L'échéance est relue avec le même jour UTC ; le filtre sans résultat est
  conservé dans l'URL après reconnexion et l'export restitue le périmètre choisi.

Ces contrôles ne valident ni un Work Item Azure réel, ni un déploiement, ni la
capacité aux paliers A/B/C, ni un audit exhaustif WCAG. Le pilote reste nécessaire.

## Validation P1 du 5 septembre 2026

Le nouveau [parcours d'ingestion](p1-ingestion.md) a été vérifié sur PostgreSQL et
Azurite isolés, avec l'API Windows puis l'image Linux `codeinsights:p1-local`.
L'image finale `sha256:0d78ea1dbb2ccaa077937cc3663bba54b6380e6f126de4b00264ff98f7182b4c`
est saine et s'exécute avec l'UID 1654. Aucun déploiement Azure n'a été effectué.

- Build Release, publish et construction de l'image réussis, sans avertissement de compilation ; aucune vulnérabilité NuGet signalée dans les sources configurées.
- Checks console complets avec DB, URL et SPA : migrations répétées/concurrentes, identités, contrats historiques, exports et administration ; 91 requêtes anonymes refusées.
- Checks P1 réels : création concurrente idempotente, finalisation incomplète refusée, SHA incorrect, téléchargement autorisé, refus interprojets, contributions et révisions `pass` puis `fail`, historique préservé, SARIF corrompu en échec avec événement ADO durable, tailles, reprise de bail et états de mesure absent/échoué/zéro.
- Imports SARIF/Cobertura/LCOV/CycloneDX/SPDX et comparaison Git vérifiés ; ADO utilise un substitut HTTP pour itérations, statuts, commentaire, réponse perdue, 429 et erreurs. Aucune publication vers une PR réelle pendant ces checks.
- Baseline et analyse distinctes persistées via HTTP : la comparaison restitue un finding nouveau, un persistant et zéro résolu. Chrome sur l'image finale confirme ces valeurs ; la couverture des lignes modifiées non fournie reste indisponible.
- Typage frontend avec `--noUnusedLocals` et checks métriques, formulaires, cache paginé et administration réussis dans le stage web avec les sources du checkout montées.
- `tests/insights.check.mjs` : requêtes SQL réelles, curseurs, filtres invalides, affectation JSON `null` et fixture de 101 branches paginées 50/50/1 sans doublon. Les synthèses sont bornées au SQL, pas uniquement tronquées après chargement.
- Navigateur intégré indisponible ; vérification locale avec Chrome à 390, 768 et 1440 px : connexion, lien direct conservé après connexion, Issues/Rules, pages historiques/imports/branches, filtre vide, erreur JSON, clavier/focus et absence de débordement global. Cela ne constitue pas un audit exhaustif WCAG.
- Compose et Terraform validés ; syntaxe Bash/YAML de la validation CI PostgreSQL + Azurite vérifiée. Aucun pipeline déclenché.

Le client partagé a passé 8 checks de publication et les 16 checks existants du
runner. Une publication réelle puis son rejeu conservent les mêmes identifiants
et un gate `pass`. Le smoke a traité 75 publications et 6 064 lectures sans erreur
(p95 stable : 1,187 s publication, 0,032 s lecture). Il précède les derniers
correctifs de revue ; les checks fonctionnels ci-dessus portent sur l'image finale.
Les scénarios et résultats sont décrits dans [la campagne locale](p1-load.md).
Un smoke supplémentaire sur l'image finale (10 secondes, rapports 4 Kio,
10 findings) a réussi 10 publications et 1 263 lectures sans erreur :
p95 publication 1,172 s et lecture 0,032 s. Il s'agit d'un contrôle court,
pas d'une mesure de capacité aux paliers A/B/C.
La campagne standard A/B/C de six heures, les matrices complètes de taille/densité,
les droits Blob réels et le pilote ADO/branch policy restent non validés.

## Construction

[CodeInsights.slnx](../CodeInsights.slnx) regroupe l'API ASP.NET Core 10 et le programme de checks. [Directory.Build.props](../Directory.Build.props) centralise framework et versions des dépendances. Depuis la racine avec le SDK .NET 10 :

```powershell
dotnet restore CodeInsights.slnx
dotnet build CodeInsights.slnx -c Release
dotnet run --project tests/CodeInsights.Checks -c Release
dotnet publish apps/api/CodeInsights.Api.csproj -c Release
docker compose config --quiet
docker build -t codeinsights:local .
```

Les checks utilisent un programme console à assertions, lancé avec `dotnet run`. Le catalogue [routes.json](../tests/contracts/routes.json) recense les routes ; les scénarios C# couvrent requêtes, résultats et findings. Les appels externes de test utilisent des handlers simulés.

## PostgreSQL et HTTP

Configurer l’API avec `ConnectionStrings__CodeInsights`, `Bootstrap__AdminEmail`, `Bootstrap__AdminPassword` et `Authentication__SigningKey`. Les tests étendus utilisent une base PostgreSQL jetable et une API de test déjà démarrée. Ils créent et modifient utilisateurs, projets, tokens, intégrations, paramètres et analyses.

| Variable | Usage |
| --- | --- |
| `CODEINSIGHTS_TEST_DB` | Chaîne de connexion Npgsql d'une base isolée ; active les checks de préparation du schéma, persistance et autorisations. |
| `CODEINSIGHTS_TEST_URL` | URL de l'API de test ; active les scénarios HTTP. |
| `CODEINSIGHTS_TEST_SPA` | `true` pour vérifier la page React et ses assets dans l'image complète. |
| `CODEINSIGHTS_TEST_EMAIL` | Email de l'administrateur de test. |
| `CODEINSIGHTS_TEST_PASSWORD` | Mot de passe de l'administrateur de test, fourni par l'environnement sécurisé. |

Après configuration, exécuter `dotnet run --project tests/CodeInsights.Checks -c Release`. Sans ces variables, l'exécution ne valide pas toute la persistance ni les parcours HTTP. Ne jamais cibler une base de production.

Vérifier séparément identité utilisateur, droits par projet/organisation, scopes CI, gates complets/incomplets/en échec, mesures nulles et zéro, paramètres d'administration, secrets masqués, rétention et exports CSV/PDF. Une validation Entra avec fournisseur simulé ne prouve pas un login réel sur un tenant.

## Image Linux et navigateur

Le Dockerfile construit React dans `web-builder`, publie l'API .NET puis assemble une image ASP.NET Core 10 non-root sur le port 8000. La commande `dotnet CodeInsights.Api.dll --healthcheck` sonde `/api/v1/health` ; `/healthz` est également disponible. Ces sondes ne vérifient pas la disponibilité PostgreSQL : ajouter une lecture métier autorisée.

Pour le navigateur, vérifier login local, analyses, détails, administration et téléchargements dans le navigateur intégré. Les vérifications doivent distinguer les preuves HTTP de l'exécution effective des interactions React.

## Campagne locale du 5 septembre 2026

| Contrôle | Résultat observé |
| --- | --- |
| Restore, build Release et publish .NET 10 | Réussis, sans avertissement de compilation ; aucune dépendance NuGet vulnérable signalée. |
| Image Linux | Construite, démarrée sans root, healthcheck `healthy`, page React et assets HTTP 200. |
| Routes protégées | 71 requêtes anonymes refusées. |
| Scénarios HTTP | Analyses, administration, accès et ProblemDetails validés dans Linux. |
| PostgreSQL | Base neuve, migrations répétées et concurrentes, PasswordHasher, JWT, droits et révocation CI validés. |
| Exports | CSV et PDF contrôlés via HTTP dans Linux, polices embarquées. |
| Frontend | Build Vite, TypeScript et checks métriques, formulaires, administration et cache réussis. |
| Configuration | Compose valide ; Terraform validate réussi avec avertissement de propriété Key Vault dépréciée. Aucun apply. |
| Entra | Contrôles avec fournisseur simulé ; aucun login réel sur tenant attesté. |
| Navigateur | Navigateur intégré puis Chrome bloqués par `ERR_BLOCKED_BY_CLIENT` ; parcours interactifs non validés. |
| Azure | Aucun déploiement ni action cloud. |

Ces résultats concernent la version testée lors de la campagne. Relancer les checks après toute modification du schéma, des contrats ou de l'authentification ; ne pas reporter automatiquement un résultat antérieur sur un nouveau build.

## Déploiement Azure du 5 septembre 2026

- [Infrastructure 276066](https://dev.azure.com/up-group/Up.France.ODI/_build/results?buildId=276066) : succès. Terraform a ajouté 3 ressources, modifié 3 ressources et remplacé uniquement la base applicative `sast_platform`, avec effacement explicitement autorisé. Le serveur PostgreSQL est conservé.
- [Application 276067](https://dev.azure.com/up-group/Up.France.ODI/_build/results?buildId=276067) : succès. Tests .NET/HTTP sur PostgreSQL isolé, construction et publication ACR, puis déploiement App Service et probes HTTPS.
- Image active vérifiée : `upgroup.azurecr.io/sast-platform:276067`, téléchargement par identité managée. La source applicative déployée correspond au commit `34c4bc7`.
- [CodeInsights](https://up-france-odi-sast-prod-app.azurewebsites.net/) : `/api/v1/health`, `/healthz`, page React et ses deux assets répondent en HTTP 200.
- Le démarrage a appliqué les migrations EF Core et le bootstrap sur la base recréée. Login de `admin@codeinsights.local` réussi avec JWT, rôle administrateur confirmé par `/api/v1/auth/me`, lecture `/api/v1/projects` réussie avec zéro projet. Aucun jeu de tests destructif n'a été exécuté contre Azure.
- L'écran de connexion est visible dans le navigateur intégré et reste ouvert. Les parcours Entra réels ne font pas partie de cette preuve.
- Le mot de passe de bootstrap est conservé dans le coffre `up-fr-odi-sast-prod-kv`, secret `bootstrap-admin-password` ; son contenu n'est pas documenté.

Les pipelines 963 et 969 ciblent le dépôt CodeInsights. Le déclenchement automatique de la Release classique 400 est désactivé pour éviter une seconde application Terraform concurrente. Les détails de configuration sont dans le [guide d'infrastructure](../infra/PLATFORM_SAST.md).

### Configuration Entra après initialisation de la base

La recréation de la base efface aussi les paramètres des fournisseurs. Le bootstrap crée Entra désactivé ; React affiche son bouton uniquement si le fournisseur est activé. Le tenant, le client de l'inscription `UP-France-ODI-SAST-Platform`, son URL de callback et le secret fourni par l'opérateur sont configurés. Le fournisseur est activé ; le bouton « Sign in with Microsoft / Entra ID » est visible dans le navigateur intégré après actualisation. L'initialisation OIDC retourne une URL Microsoft pour le bon client et pose le cookie de corrélation. Cette vérification ne constitue pas encore un login interactif complet sur le tenant. Aucun secret n'est versionné.
