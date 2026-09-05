---
title: Validation de CodeInsights
description: Commandes .NET 10, tests isolés et résultats de la campagne locale.
---

# Validation de CodeInsights

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
