# Plateforme SAST Centralisée — Up France ODI

> Analyse statique de sécurité mutualisée entre les projets du groupe, déployée sur Azure App Service et intégrée aux pipelines Azure DevOps.

**URL de production :** https://up-france-odi-sast-prod-app.azurewebsites.net  
**Tag actuel :** `v1.2.45-platform-sast`  
**Statut :** ✅ En production

---

## Pourquoi ce projet ?

Avant cette plateforme, chaque projet gérait ses propres scans de sécurité de façon hétérogène — ou pas du tout. Les équipes n'avaient pas de visibilité croisée sur la dette technique et les vulnérabilités. L'objectif était de centraliser l'analyse SAST à l'image de ce que propose SonarQube, mais **sans licence, sans serveur dédié, et intégré nativement aux pipelines ADO existants**.

---

## Vue d'ensemble de l'architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Pipeline Azure DevOps (projet consommateur)                │
│                                                             │
│  az-platform-sast-stage-tpl.yml  ←──── tag v1.2.45         │
│            │                                                │
│            └──→  ci_platform_scan.py  (script Python)      │
│                      │                                      │
│                      ├── installe les outils manquants      │
│                      ├── lance les scanners                 │
│                      └──→  POST /api/v1/analyses  ──────┐   │
└────────────────────────────────────────────────────────┼──┘
                                                         │
              ┌──────────────────────────────────────────▼──┐
              │         Azure App Service (prod)             │
              │                                              │
              │   FastAPI (Python)   +   React SPA (TS)      │
              │         │                    │               │
              │      PostgreSQL        Azure OpenAI          │
              │                       (via Key Vault)        │
              └──────────────────────────────────────────────┘
```

**Backend :** FastAPI (Python 3.12), SQLAlchemy, PostgreSQL  
**Frontend :** React 18 + TypeScript, SPA servie par le même process FastAPI  
**Infrastructure :** Azure App Service (Linux, B1), Azure Database for PostgreSQL Flexible Server  
**Secrets :** Azure Key Vault (`up-fr-odi-sast-prod-kv`) — identité managée SystemAssigned  
**Templates CI :** repo central `Up.France.ODI.AzurePipelines`, consommé via tag Git fixe  
**CI/CD plateforme :** GitHub Actions → build Docker multi-stage → push ACR → deploy App Service  

---

## Fonctionnalités

### Dashboard multi-projets
- Vue consolidée de tous les projets onboardés
- Scores sur 100 pour chaque axe (sécurité, fiabilité, maintenabilité), inspirés de SonarQube
- Historique par branche, dernière analyse, évolution dans le temps
- Filtre et recherche sur les projets

### Scores et métriques

| Métrique | Calcul |
|---|---|
| **Security score** | Basé sur vulnérabilités + security hotspots (pondérés par sévérité) |
| **Reliability score** | Basé sur les bugs détectés |
| **Maintainability score** | Basé sur les code smells |
| **Coverage** | Taux de couverture de tests (cobertura/lcov) |
| **Duplication** | Taux de code dupliqué (jscpd) |
| **Dependency vulnerabilities** | CVEs dans les dépendances tierces (non comptées dans le security score) |

### Scanners intégrés par stack

| Stack | Outils qualité | Sécurité | SCA / CVE |
|---|---|---|---|
| **.NET / C#** | Roslyn (CA rules) | semgrep | dotnet audit + Trivy |
| **React / TypeScript** | ESLint, tsc | semgrep | npm audit + Trivy |
| **PHP** | phpstan, phpcs | semgrep | Composer audit + Trivy |
| **Python** | pylint, radon | bandit, semgrep | pip-audit + Trivy |
| **Tous langages** | — | semgrep (security-audit + secrets) | Trivy (multi-ecosystem) |
| **Secrets** | — | detect-secrets | — |

> Tous les outils sont **optionnels** : si un outil n'est pas installé ou que les fichiers de config sont absents, le scanner est ignoré silencieusement. Le pipeline ne casse jamais à cause d'un outil manquant.

### Quality Gates
- Gates configurables depuis l'interface Administration
- Seuils par axe : scores minimum, plafond de vulnérabilités / bugs / code smells
- Assignation d'un gate par projet (ou gate par défaut)
- Le pipeline retourne `exit 1` si le gate échoue → bloque la PR ou le merge

### Catalogue KEV (CISA Known Exploited Vulnerabilities)
- Synchronisation quotidienne automatique du catalogue CISA KEV au démarrage de la plateforme
- Les CVE présents dans le catalogue sont marqués **⚠ KEV** dans l'onglet Vulnerabilities
- Badge pulsant pour attirer l'attention sur les vulnérabilités activement exploitées dans la nature
- Endpoint `POST /api/v1/kev/refresh` pour forcer un rafraîchissement manuel
- Compteur KEV affiché dans les métriques de l'analyse

### Suggestion IA (Azure OpenAI)
- Bouton **✦ Suggestion IA** sur chaque finding dans l'onglet Vulnerabilities
- Appelle Azure OpenAI (`gpt-4o-mini`) avec le contexte du finding (règle, fichier, description)
- Retourne une suggestion de correction contextuelle directement dans l'interface
- Fallback sur l'API Anthropic si Azure OpenAI n'est pas disponible
- Secrets injectés via Azure Key Vault References — jamais en clair dans la configuration
- Coût estimé : **< 0,01 €/jour** pour un usage normal (gpt-4o-mini à $0,15/1M tokens input)

### Notifications
- Webhooks configurables (Teams, Slack, ou tout endpoint HTTP)
- Email sur événement quality gate (fail / pass)
- Payload Adaptive Card pour Teams (rendu natif dans les channels)

### Export
- **PDF** : rapport de l'analyse avec scores, statut du gate, top findings, métriques
- **CSV** : analyse individuelle ou historique complet d'un projet

### PR Decoration (Azure DevOps)
- Le pipeline poste un **statut de PR** avec le résultat du quality gate (pass/fail) directement dans l'interface ADO
- Un **commentaire** est ajouté à la PR avec le résumé des métriques

### Audit trail & Rétention
- Toute action administrative est tracée (audit log horodaté)
- Politique de rétention configurable : nombre de jours de conservation des analyses, branches protégées

### Gestion des règles
- Suppression de règles par projet (faux positifs, risques acceptés)
- Vue des règles actives par projet depuis l'onglet Rules

### Authentification & RBAC
- Authentification via **Microsoft Entra ID** (SSO entreprise)
- Rôles : `admin`, `analyst`, `viewer`
- Gestion des utilisateurs locaux via l'Administration

---

## Infrastructure Azure

| Ressource | Nom | Notes |
|---|---|---|
| Resource Group | `up-france-odi-sast-prod-rg` | westeurope |
| App Service Plan | `up-france-odi-sast-prod-asp` | B1 Linux |
| App Service | `up-france-odi-sast-prod-app` | Container Docker, identité SystemAssigned |
| PostgreSQL Flexible Server | `up-france-odi-sast-prod-*` | 32 GB |
| Key Vault | `up-fr-odi-sast-prod-kv` | RBAC, accès par identité managée |
| Container Registry | `upgroup.azurecr.io` | Partagé `fd-devops`, rôle AcrPull sur identité managée |

### Secrets dans le Key Vault

| Secret | Variable injectée | Description |
|---|---|---|
| `azure-openai-endpoint` | `AZURE_OPENAI_ENDPOINT` | Endpoint Azure OpenAI (`westeurope.api.cognitive.microsoft.com`) |
| `azure-openai-api-key` | `AZURE_OPENAI_API_KEY` | Clé API Azure OpenAI |
| `azure-openai-deployment` | `AZURE_OPENAI_DEPLOYMENT` | Nom du déploiement (`gpt-4o-mini`) |
| `azure-openai-api-version` | `AZURE_OPENAI_API_VERSION` | Version de l'API REST OpenAI |

Les variables sont injectées dans l'App Service via la syntaxe `@Microsoft.KeyVault(VaultName=...;SecretName=...)` — l'App Service résout les valeurs au runtime via son identité managée (`Key Vault Secrets User`).

### Infrastructure as Code

Géré via Terraform dans le repo `devops-governance` (ADO) :

```
devops-governance/sast-platform/
├── main.tf           # Provider, resource group, locals
├── acr.tf            # Data source ACR partagé
├── webapp.tf         # App Service Plan + Web App + AcrPull
├── postgres.tf       # PostgreSQL Flexible Server
├── keyvault.tf       # Key Vault + secrets AI + role assignments
├── outputs.tf
├── variables.tf
└── variables/
    ├── production.tfvars
    └── backend-production.tfvars
```

---

## CI/CD de la plateforme

Le déploiement de la plateforme elle-même est géré par **GitHub Actions** (`.github/workflows/deploy-platform.yml`) :

1. **Trigger** : push sur `master` touchant `apps/api/**`, `apps/web/**`, `Dockerfile`
2. **Build** : Docker multi-stage — build React (Vite) puis image FastAPI avec le SPA intégré, push vers ACR avec cache layer
3. **Deploy** : `az webapp config container set` + `az webapp restart`

Le déploiement n'écrase jamais le Terraform — les `app_settings` sont gérés exclusivement via Terraform/Key Vault.

---

## Templates ADO — Catalogue

Tous les templates sont dans `Up.France.ODI.AzurePipelines/DevSecOps/`.

| Template | Usage |
|---|---|
| `az-platform-sast-stage-tpl.yml` | **Point d'entrée recommandé** — stage complet (checkout + cache + scan) |
| `az-platform-sast-steps-tpl.yml` | Steps uniquement — à inclure dans un job existant |
| `az-platform-sast-dotnet-tpl.yml` | Spécialisé .NET — configure Roslyn analysis mode |
| `az-platform-sast-react-tpl.yml` | Spécialisé React/Node — configure npm auth |
| `az-platform-sast-php-tpl.yml` | Spécialisé PHP |

### Paramètres clés du stage template

```yaml
- template: DevSecOps/az-platform-sast-stage-tpl.yml@AzPipelinesTpl
  parameters:
    scan_mode: full          # full | sast-only | full-test
    language_stack: dotnet   # dotnet | react-ts | php | '' (auto-detect)
    trivy_enabled: true      # activer/désactiver Trivy CVE scan
    timeout_minutes: 25      # timeout du job (défaut : 25 min)
    fail_on_error: false     # ne pas bloquer le pipeline sur erreur scanner
    scan_ignore: '**/Migrations/**,**/obj/**'
```

### Optimisations pipeline
- **Cache Trivy DB** hebdomadaire → évite le téléchargement de ~100 Mo à chaque run
- **Cache Semgrep rules** hebdomadaire → idem
- **`fetchDepth: 1`** sur tous les checkouts → clone superficiel suffisant pour le SAST
- **Mode `sast-only`** → saute la génération de coverage (économise 5–15 min sur les projets avec une grande suite de tests)
- **Déduplication CVE** : un même CVE présent dans plusieurs `.csproj` d'une solution .NET n'est compté qu'une fois

---

## Projets onboardés

| Projet | Stack | Template | Branche |
|---|---|---|---|
| **Commercant.BO** | .NET + PHP | `az-platform-sast-dotnet-tpl.yml` | `DevSecOpsTemplate` |
| **Commercant.BO** (SAST only) | .NET + PHP | `az-platform-sast-stage-tpl.yml` | `DevSecOpsTemplate` |
| **Commercant.Web** | React/TS | `az-platform-sast-react-tpl.yml` | `feature/add-sast-pipeline` |
| **BmscServices** | PHP | `az-platform-sast-php-tpl.yml` | `feature/devsecops-platform-sast` |
| **Loyalty** | .NET | `az-platform-sast-dotnet-tpl.yml` | `feature/devsecops-platform-sast` |

Tous les projets pointent sur le tag **`v1.2.45-platform-sast`**.

---

## Onboarding d'un nouveau projet (15 min)

### 1. Variables de pipeline (secret)

Dans le portail ADO > Pipelines > Library, créer ou réutiliser un variable group avec :

```
PLATFORM_API_URL   = https://up-france-odi-sast-prod-app.azurewebsites.net
PLATFORM_API_TOKEN = <token à récupérer auprès de l'équipe>
```

### 2. Ajouter la resource dans le pipeline YAML

```yaml
resources:
  repositories:
    - repository: AzPipelinesTpl
      type: git
      name: Up.France.ODI/Up.France.ODI.AzurePipelines
      ref: refs/tags/v1.2.45-platform-sast
```

### 3. Appeler le template

```yaml
variables:
  PLATFORM_PROJECT_KEY: "MonProjet"
  PLATFORM_REPO_PROVIDER: "azure-devops"
  PLATFORM_PIPELINE_PROVIDER: "azure-devops"

stages:
  - template: DevSecOps/az-platform-sast-stage-tpl.yml@AzPipelinesTpl
    parameters:
      scan_mode: full
      scan_ignore: '**/Migrations/**,**/obj/**'
      fail_on_error: false
```

### 4. Premier run

Le projet apparaît automatiquement dans le dashboard après le premier run réussi.

---

## Gestion des versions (convention de tag)

```
v{majeur}.{mineur}.{patch}-platform-sast
          ↑
          Incrémenté à chaque fix ou amélioration du scanner/templates
```

Processus de mise à jour :
1. Développement sur `feature/platform-central-scan` dans `Up.France.ODI.AzurePipelines`
2. Test sur un projet consommateur via la branche
3. Tag `vX.Y.Z-platform-sast` sur le commit validé
4. Bump du tag dans tous les projets consommateurs + commit + push

---

## Backlog — Fonctionnalités à venir

| Fonctionnalité | Valeur |
|---|---|
| **PAT Management** | Enforcement du token CI depuis l'Administration (modèle en place, à connecter) |
| **Trend dashboard** | Graphiques d'évolution temporelle par projet (onglet Evolution actuellement vide) |
| **SBOM / rapport de dépendances** | Export de la liste de dépendances avec statut CVE |
| **Visibilité par rôle** | Restreindre la visibilité des projets par utilisateur/groupe |

---

## Accès

| Ressource | Lien |
|---|---|
| Dashboard | https://up-france-odi-sast-prod-app.azurewebsites.net |
| Code source plateforme | https://github.com/amrLaz/SonarLikeSolution |
| Templates ADO | `Up.France.ODI/Up.France.ODI.AzurePipelines` (repo ADO interne) |
| Terraform infra | `Up.France.ODI/devops-governance` → `sast-platform/` (repo ADO interne) |
| Guide onboarding 15 min | `DevSecOps/ONBOARDING-15MIN.md` dans le repo templates |
