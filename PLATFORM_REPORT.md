# Plateforme SAST Up Group — Rapport de projet

> **Version courante :** `v1.2.42-platform-sast`
> **Date :** 2026-07-23
> **Auteur :** Amr LAZRAQ (EXT)

---

## 1. Vue d'ensemble

Une plateforme de sécurité applicative interne (type SonarQube), développée sur mesure et déployée sur **Azure App Service**. Elle reçoit les résultats de scan de chaque pipeline CI/CD, calcule des scores de qualité (sécurité, fiabilité, maintenabilité), et expose un dashboard web pour suivre l'état des projets dans le temps.

---

## 2. Architecture

```
Repos projets (Loyalty, CommercantBO, BmscServices...)
    └── azure-pipelines.yml
          └── référence le repo centralisé de templates ADO
                Up.France.ODI.AzurePipelines @ v1.2.42-platform-sast
                    └── DevSecOps/ci_platform_scan.py   ← scanner principal
                          └── POST résultats → Plateforme SAST
                                ├── API FastAPI (Python)
                                ├── PostgreSQL (analyses, findings, vulns)
                                └── UI React (dashboard)
```

**Un seul scanner pour tout** : `ci_platform_scan.py` dans le repo de templates centralisé (`Up.France.ODI.AzurePipelines`, branche `feature/platform-central-scan`). Tous les projets qui consomment le tag partagent le même code de scan — un fix ou une feature est déployée une seule fois et bénéficie à tous automatiquement au prochain bump de tag.

### Composants de la plateforme

| Composant | Techno | Rôle |
|---|---|---|
| API | FastAPI (Python 3.11) | Reçoit les analyses, stocke, calcule les gates |
| Base de données | PostgreSQL | Analyses, findings, config |
| Frontend | React + TypeScript (Vite) | Dashboard, Administration |
| Infra | Azure App Service + ACR | Hébergement prod |
| Auth | Azure AD / Entra ID (OIDC) | SSO entreprise |
| CI/CD plateforme | GitHub Actions | Build image → push ACR → deploy App Service |

### Templates ADO (repo centralisé)

| Fichier | Rôle |
|---|---|
| `ci_platform_scan.py` | Scanner principal — analyse + quality gate + push résultats |
| `az-platform-sast-steps-tpl.yml` | Steps SAST communs (appelé par tous les templates langages) |
| `az-platform-sast-dotnet-tpl.yml` | Template SAST pour projets .NET |
| `az-platform-sast-react-tpl.yml` | Template SAST pour projets React/TypeScript |
| `az-platform-sast-php-tpl.yml` | Template SAST pour projets PHP |
| `az-platform-sast-stage-tpl.yml` | Stage SAST générique (wrapper) |

---

## 3. Ce que fait le scanner

### Phase 1 — Tests & couverture

Génération des rapports de couverture de code avant l'analyse SAST :
- Cobertura XML (`.NET` / `dotnet test --collect`)
- Jest JSON (`React`)
- Coverage.xml (`PHP`)

### Phase 2 — Analyse SAST + SCA

| Outil | Langage cible | Ce qu'il détecte | Catégorie |
|---|---|---|---|
| **Semgrep** | Tous | Vulnérabilités de code, patterns dangereux | `vulnerability` / `hotspot` |
| **detect-secrets** | Tous | Credentials, clés API, tokens hardcodés | `hotspot` |
| **ESLint Security** | React / TypeScript | XSS, injections, eval dangereux | `vulnerability` |
| **Bandit** | Python | Vulnérabilités Python (OWASP Top 10) | `vulnerability` |
| **gitleaks** | Tous | Secrets dans l'historique git | `hotspot` |
| **jscpd** | Tous | Duplication de code | `code_smell` |
| **dotnet list --vulnerable** | .NET | CVEs NuGet (Advisory GitHub) | `dependency_vulnerability` |
| **composer audit** | PHP | CVEs Composer (packagist) | `dependency_vulnerability` |
| **npm audit** | Node / React | CVEs npm | `dependency_vulnerability` |
| **pip-audit** | Python | CVEs PyPI | `dependency_vulnerability` |
| **Trivy** *(v1.2.42)* | **Tous** | CVEs multi-écosystème — NuGet, npm, Composer, pip, Go — avec CVE ID officiel + score CVSS | `dependency_vulnerability` |

> **Trivy** est le seul outil language-agnostic pour le SCA : il détecte les vulnérabilités dans **tous** les écosystèmes de dépendances en un seul pass, avec les vrais identifiants CVE (ex: `CVE-2026-26171`) et les scores CVSS v3 provenant de la NVD.

### Phase 3 — Envoi & Quality Gate

- Les métriques et findings sont soumis à l'API `POST /api/v1/analyses`
- La plateforme calcule un score (0–100) pour chaque dimension :
  - **Sécurité** : pénalisé par les `vulnerability` et `hotspot`
  - **Fiabilité** : pénalisé par les `bug`
  - **Maintenabilité** : pénalisé par les `code_smell`
- Si un seuil du Quality Gate est dépassé → le pipeline **échoue** (`exit 1`)
- Les `dependency_vulnerability` (SCA / Trivy) sont comptées séparément et **n'impactent pas** le score de sécurité SAST

---

## 4. Ce que voit le développeur dans la plateforme

| Onglet | Contenu |
|---|---|
| **Projects** | Liste des projets avec leur dernière note (A→E) et tendance |
| **Issues** | Tous les findings SAST avec fichier, ligne, règle, lien Azure DevOps |
| **Vulnerabilities & IOCs** | CVEs des dépendances : CVE ID, package, version vulnérable, version de fix, score CVSS |
| **Evolution** | Courbe des scores sécurité/fiabilité/maintenabilité dans le temps, par projet et branche |
| **Quality Gates** | Seuils configurables (vulns max, score min, couverture min...) |
| **Administration** | Config SSO Azure AD, tokens CI/CD, rétention des données, intégrations DevOps |

---

## 5. Authentification

- **Connexion UI** : Azure AD / Entra ID (OAuth2 OIDC — flow server-side, le `client_secret` ne transite jamais dans le navigateur)
- **Connexion pipeline CI** : `PLATFORM_API_TOKEN` généré depuis Administration > PAT Management, passé en variable secrète dans le pipeline ADO (`$(PLATFORM_API_TOKEN)`)

---

## 6. Projets actuellement sur la plateforme

| Projet | Stack | Tag pipeline |
|---|---|---|
| Up.France.ODI.Loyalty | .NET 10 (MTP v1) | `v1.2.42-platform-sast` |
| Up.France.Commercant.BO | .NET 9 | `v1.2.42-platform-sast` |
| Up.France.ODI.Services.Beneficiaire.BmscServices | PHP | `v1.2.42-platform-sast` |

> Les projets sur des tags antérieurs (`v1.2.11`, `v1.2.17`) ne bénéficient pas des dernières fonctionnalités (Trivy, rétention). Ils peuvent être mis à jour en modifiant le tag dans leur `azure-pipelines.yml`.

---

## 7. Onboarding d'un nouveau projet

### Prérequis

1. Avoir un `PLATFORM_API_TOKEN` (généré depuis Administration > PAT Management)
2. Avoir une clé projet (`PLATFORM_PROJECT_KEY`) — ex: `my-project-key`
3. L'URL de la plateforme (`PLATFORM_API_URL`)

### Variables à déclarer dans le pipeline ADO

```yaml
variables:
  PLATFORM_API_URL: "https://sast-platform.azurewebsites.net"
  PLATFORM_PROJECT_KEY: "mon-projet"
  PLATFORM_API_TOKEN: $(PLATFORM_API_TOKEN)   # variable secrète dans ADO
```

### Référencer le template selon le langage

**.NET :**
```yaml
- template: DevSecOps/az-platform-sast-dotnet-tpl.yml@templates
  parameters:
    platform_api_url: $(PLATFORM_API_URL)
    platform_project_key: $(PLATFORM_PROJECT_KEY)
    platform_api_token: $(PLATFORM_API_TOKEN)
    trivy_enabled: true
```

**React / TypeScript :**
```yaml
- template: DevSecOps/az-platform-sast-react-tpl.yml@templates
  parameters:
    platform_api_url: $(PLATFORM_API_URL)
    platform_project_key: $(PLATFORM_PROJECT_KEY)
    platform_api_token: $(PLATFORM_API_TOKEN)
    trivy_enabled: true
```

**PHP :**
```yaml
- template: DevSecOps/az-platform-sast-php-tpl.yml@templates
  parameters:
    platform_api_url: $(PLATFORM_API_URL)
    platform_project_key: $(PLATFORM_PROJECT_KEY)
    platform_api_token: $(PLATFORM_API_TOKEN)
    trivy_enabled: true
```

La resource `templates` pointe vers `Up.France.ODI.AzurePipelines` @ `v1.2.42-platform-sast`.

---

## 8. Changelog v1.2.42

| Composant | Changement |
|---|---|
| `ci_platform_scan.py` | Ajout de **Trivy SCA** — scan CVE multi-écosystème avec guard `PLATFORM_TRIVY_ENABLED` |
| `ci_platform_scan.py` | Ajout du champ `category` dans `affected_files` pour distinguer SCA vs SAST côté API |
| `az-platform-sast-steps-tpl.yml` | Nouveaux params `trivy_enabled` et `dotnet_analysis_mode` → env vars `PLATFORM_TRIVY_ENABLED` / `PLATFORM_DOTNET_ANALYSIS_MODE` |
| `az-platform-sast-dotnet-tpl.yml` | Expose `trivy_enabled`, passe les 2 params au steps template |
| `az-platform-sast-react-tpl.yml` | Expose et passe `trivy_enabled` |
| `az-platform-sast-php-tpl.yml` | Expose et passe `trivy_enabled` |
| API `analysis.py` | Parsing des CVE IDs Trivy dans `get_analysis_vulnerabilities` — affichage correct des CVE ID, package, version, fix, CVSS dans l'UI |
| API `platform.py` | **Gestion de rétention** — settings `retention_*`, endpoint `POST /platform/cleanup`, auto-cleanup au démarrage |
| UI `App.tsx` | Section **Data Retention** dans Administration > Configuration |
| API `auth_entra.py` | Flow OAuth2 OIDC Azure AD complet (server-side) |
| UI `App.tsx` | Bouton de connexion Microsoft Entra, filtres projet/branche sur Vulnerabilities et Evolution |

---

## 9. Architecture de déploiement

```
GitHub (amrLaz/SonarLikeSolution)
    └── GitHub Actions (.github/workflows/)
          ├── build → docker build (multi-stage: React + FastAPI)
          ├── push  → Azure Container Registry (ACR)
          └── deploy → az webapp config container set → Azure App Service

Azure App Service (Linux)
    ├── Container: sast-platform:latest (API + SPA statique)
    └── Connexions:
          ├── PostgreSQL (Azure Database for PostgreSQL Flexible Server)
          └── Azure AD App Registration (OIDC)
```

---

## 10. Fichiers de référence (ce repo)

| Fichier / Dossier | Contenu |
|---|---|
| `templates/ci_platform_scan.py` | Scanner principal (copie de référence) |
| `templates/az-platform-sast-*.yml` | Templates ADO SAST (copie de référence) |
| `apps/api/` | Code source API FastAPI |
| `apps/web/src/` | Code source dashboard React |
| `deploy/` | Scripts de déploiement Azure |
| `docker-compose.yml` | Stack locale (API + PostgreSQL + Redis) |
