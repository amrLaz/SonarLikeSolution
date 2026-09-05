<!-- FOR AI AGENTS - Human readability is a side effect, not a goal -->
<!-- Last verified: 2026-09-05 against apps/api, apps/web, docker-compose.yml, Dockerfile, docs/*.md -->

# AGENTS.md — Up.France.CodeInsights

**Portée** : tout le dépôt Up.France.CodeInsights. Planifier avec une todo list, déléguer les recherches indépendantes lorsque pertinent, vérifier les changements et documenter chaque évolution dans `docs/`. Garder les modifications minimales ; aucune nouvelle abstraction ou dépendance sans besoin. Pour Terraform, conserver les conventions Azure existantes et ne pas appliquer de changement cloud sans autorisation.

## Vue d'ensemble

FastAPI + SQLAlchemy + PostgreSQL en backend, React (Vite/TS) en frontend, packagés dans **une seule image** ([Dockerfile](Dockerfile)) qui build le SPA puis sert les statiques depuis FastAPI. `src/` contient des échantillons de code analysés par le SAST — ce n'est **pas** le runtime de la plateforme. Doc faisant autorité : [README.md](README.md) · [architecture](docs/architecture.md) · [exploitation](docs/exploitation.md) · [intégration](docs/integration.md) · [performances](docs/performances.md) · [roadmap](docs/roadmap.md).

## Commands (verified)

| Task                      | Command                               | Notes                                                                                                                      |
| ------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Build image (canonique)   | `docker build -t quality-hub:local .` | depuis la racine ; seul build qui embarque web + API ensemble                                                                 |
| Valider la config compose | `docker compose config --quiet`       | depuis la racine                                                                                                              |
| Tests                     | `pytest`                              | depuis la racine, config `pytest.ini` ; tests API P0 sous `tests/test_p0_*.py`                                                 |
| Démarrage dev (partiel)   | `docker compose up -d`                | api:8000, web:5173, db:5432, redis:6379 — non validé comme démarrage complet, voir [exploitation.md](docs/exploitation.md) |

## File Map

```
apps/api/app/            -> backend FastAPI (routes/, models.py, db.py, auth.py, main.py)
apps/web/src/             -> frontend React (App.tsx, components/) — package.json non suivi en git
src/                       -> échantillons de code analysés par le SAST, PAS le runtime
scripts/ci_platform_scan.py -> ancien scanner CI local ; le runner canonique est dans Up.France.ODI.AzurePipelines
sonarlikesolution/, templates/ -> parcours CI alternatifs, non retenus comme référence (docs/integration.md)
deploy/bicep/              -> infra alternative ; référence = sast-platform/PLATFORM_SAST.md (Terraform)
sast-platform/          -> infrastructure Terraform (PLATFORM_SAST.md)
docs/                      -> documentation faisant autorité — la lire avant de changer un comportement
```

> Pipeline de référence : `.azuredevops/deploy-sast-platform.yml` (racine du dépôt).

## Known Issues (vérifiés dans le code — ne pas les "corriger" sans confirmer avec l'utilisateur)

- `DATABASE_URL` n'est **pas** lu par l'API ; seules les variables `DB_*`/`POSTGRES_*` comptent ([db.py](apps/api/app/db.py)).
- Le `HEALTHCHECK` du [Dockerfile](Dockerfile) cible `/health`, qui ne correspond à aucune route explicite (`/api/v1/health` et `/healthz` existent séparément).
- `apps/web` n'a pas de `package.json` suivi en git ; il est généré inline par le [Dockerfile](Dockerfile) — un `npm install` seul dans ce dossier ne fonctionne pas.
- La rétention s'exécute au démarrage de l'API ; les migrations versionnées sont exécutées avant le serveur web par le point d'entrée de l'image.

## Boundaries

### Always

- Lire et respecter [DESIGN.md](DESIGN.md) avant toute modification UI/frontend (écran, composant, CSS, interaction ou état), y compris lors d'une délégation à un autre agent IA.
- Lire [docs/architecture.md](docs/architecture.md) et [docs/integration.md](docs/integration.md) avant de toucher une route d'analyse, d'auth ou de gate.
- Fournir une base PostgreSQL de dev isolée avant de démarrer l'API (le démarrage crée/patch des tables et peut déclencher une purge).
- Mettre à jour `docs/*.md` avec tout changement de comportement observable.

### Ask First

- Corriger un des "Known Issues" ci-dessus : impact sécurité/compat, à confirmer avant implémentation.
- Ajouter un `package.json` suivi dans `apps/web` ou changer le mécanisme de build du `Dockerfile`.
- Changer le contrat de `POST /api/v1/analyses` (consommé par le runner partagé `Up.France.ODI.AzurePipelines`).

### Never

- Copier un token, mot de passe ou log contenant des secrets dans `docs/` ou ce fichier.
- Utiliser une connexion PostgreSQL de production pour un test local.
- Présenter `docker-compose.yml`, `sonarlikesolution/`, GitHub Actions ou Bicep comme la référence de déploiement retenue (c'est `.azuredevops/deploy-sast-platform.yml`, voir [architecture.md](docs/architecture.md)).

## Code UI/Frontend

- [DESIGN.md](DESIGN.md) est la référence obligatoire du design system : thème clair technique, tokens partagés, composants natifs, accessibilité et présentation honnête des résultats.
- Réutiliser le système existant pour tout nouvel écran. Les recommandations d'un skill générique ne justifient pas une autre identité visuelle, un dark mode ou une nouvelle bibliothèque UI.
- Lors d'une évolution visuelle explicitement demandée, mettre à jour `DESIGN.md`, les styles concernés et la documentation `docs/` ensemble. Voir [docs/interface.md](docs/interface.md) pour les comportements et validations frontend.
