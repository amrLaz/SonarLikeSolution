<!-- FOR AI AGENTS - Human readability is a side effect, not a goal -->
<!-- Last verified: 2026-09-05 against apps/api, apps/web, docker-compose.yml, Dockerfile, docs/*.md -->

# AGENTS.md — Up.France.CodeInsights

**Portée** : tout le dépôt Up.France.CodeInsights. Planifier avec une todo list, déléguer les recherches indépendantes lorsque pertinent, vérifier les changements et documenter chaque évolution dans `docs/`. Garder les modifications minimales ; aucune nouvelle abstraction ou dépendance sans besoin. Pour Terraform, conserver les conventions Azure existantes et ne pas appliquer de changement cloud sans autorisation.

## Vue d'ensemble

ASP.NET Core 10 + EF Core/Npgsql + PostgreSQL en backend, React (Vite/TS) en frontend, packagés dans **une seule image** ([Dockerfile](Dockerfile)) qui build le SPA puis sert les statiques depuis ASP.NET Core. `src/` contient des échantillons de code analysés par le SAST — ce n'est **pas** le runtime de la plateforme. Doc faisant autorité : [README.md](README.md) · [architecture](docs/architecture.md) · [exploitation](docs/exploitation.md) · [intégration](docs/integration.md) · [performances](docs/performances.md) · [roadmap](docs/roadmap.md).

## Commands (verified)

| Task                      | Command                               | Notes                                                                                                                      |
| ------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Build image (canonique)   | `docker build -t codeinsights:local .` | depuis la racine ; embarque web + API ensemble |
| Valider la config compose | `docker compose config --quiet`       | depuis la racine                                                                                                           |
| Checks API | `dotnet run --project tests/CodeInsights.Checks -c Release` | Ajouter `CODEINSIGHTS_TEST_DB` (PostgreSQL jetable) et `CODEINSIGHTS_TEST_URL` (API locale) pour checks complets ; jamais une base de production. |
| Démarrage local | `docker compose up -d` | React et API sur 8000, PostgreSQL privé ; variables requises dans [exploitation.md](docs/exploitation.md) |

## Conventions .NET

- Solution : `CodeInsights.slnx`, excluant les échantillons `src/`.
- Un seul `Directory.Build.props` centralise framework, nullable et versions de packages.
- Utiliser le skill `copilot-orchestrator:up-csharp-developer`, DI native, `IOptions<T>`, I/O asynchrones et `CancellationToken`.
- Utiliser des DTO explicites, PasswordHasher et JWT ; ne pas exposer les entités EF.
- Build : `dotnet build CodeInsights.slnx -c Release`. Les checks sont un exécutable sans framework ; `dotnet test` ne les exécute pas.
- Migrations : `dotnet run --project apps/api -- --migrate`, migrations EF Core et verrou natif, avant toute ouverture HTTP.
- Healthcheck image : `/api/v1/health`.

## File Map

```text
apps/api/                -> API .NET 10 (Endpoints/, Data/, Auth/, Services/, Program.cs)
apps/web/src/             -> frontend React (App.tsx, components/) — package.json non suivi en git
src/                       -> échantillons de code analysés par le SAST, PAS le runtime
infra/          -> infrastructure Terraform (PLATFORM_SAST.md)
docs/                      -> documentation faisant autorité — la lire avant de changer un comportement
```

> Pipeline de référence : `.azuredevops/deploy-apps.yml` (racine du dépôt).

## Configuration

- La connexion utilise `ConnectionStrings__CodeInsights` ; les options sont regroupées dans `Authentication`, `Bootstrap`, `Analysis`, `Ingestion` et `Cors`.
- `apps/web` n'a pas de `package.json` suivi en git ; il est généré inline par le [Dockerfile](Dockerfile) — un `npm install` seul dans ce dossier ne fonctionne pas.
- La rétention s'exécute via le worker et sa maintenance horaire ; les migrations versionnées sont exécutées avant le serveur web par le point d'entrée de l'image.

## Boundaries

### Always

- Lire et respecter [DESIGN.md](DESIGN.md) avant toute modification UI/frontend (écran, composant, CSS, interaction ou état), y compris lors d'une délégation à un autre agent IA.
- Lire [docs/architecture.md](docs/architecture.md) et [docs/integration.md](docs/integration.md) avant de toucher une route d'analyse, d'auth ou de gate.
- Fournir une base PostgreSQL de dev isolée avant de démarrer l'API (le démarrage crée/patch des tables et peut déclencher une purge).
- Mettre à jour `docs/*.md` avec tout changement de comportement observable.

### Ask First

- Ajouter un `package.json` suivi dans `apps/web` ou changer le mécanisme de build du `Dockerfile`.
- Changer le contrat de `POST /api/v1/analyses` (consommé par le runner partagé `Up.France.ODI.AzurePipelines`).

### Never

- Copier un token, mot de passe ou log contenant des secrets dans `docs/` ou ce fichier.
- Utiliser une connexion PostgreSQL de production pour un test local.
- Présenter `docker-compose.yml` comme la référence de déploiement (c'est `.azuredevops/deploy-apps.yml`, voir [architecture.md](docs/architecture.md)).

## Code UI/Frontend

- [DESIGN.md](DESIGN.md) est la référence obligatoire du design system : thème clair technique, tokens partagés, composants natifs, accessibilité et présentation honnête des résultats.
- Réutiliser le système existant pour tout nouvel écran. Les recommandations d'un skill générique ne justifient pas une autre identité visuelle, un dark mode ou une nouvelle bibliothèque UI.
- Lors d'une évolution visuelle explicitement demandée, mettre à jour `DESIGN.md`, les styles concernés et la documentation `docs/` ensemble. Voir [docs/interface.md](docs/interface.md) pour les comportements et validations frontend.
