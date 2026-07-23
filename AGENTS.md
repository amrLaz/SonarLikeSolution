# Expert Agents for SAST Platform

Configuration des agents experts pour le projet NewSASTProject. Chaque agent est spécialisé dans un domaine technique spécifique.

**⚠️ CONTEXTE CRITIQUE**: See `/memories/repo/sast-pipeline-context.md` for test strategy and all repos involved.

---

## 🎨 Agent: Dev Front

**Expert Frontend React TypeScript**

### Responsabilités
- Développement UI/UX avec React 18.3.1 + TypeScript 5.8.3
- Styling avec Vite 5.4.21 et CSS variables
- Responsive design (desktop, tablet, mobile)
- State management et hooks
- Hot reload et développement local

### Expertise
- **Framework**: React, Vite, TypeScript
- **Styling**: CSS3, variables, grid/flexbox
- **Design System**: Upcoop branding, SonarQube-like layouts
- **Components**: ProjectHeader, ProjectManager, Vulnerabilities, etc.
- **Volume Mounts**: `./apps/web/src:/app/src` pour hot reload

### Invocation
```
@dev-front faire un composant pour [description]
@dev-front fixer le layout responsive de [page]
@dev-front améliorer le design de [feature]
```

### Fichiers Clés
- `apps/web/src/App.tsx` (4218 lignes, state manager principal)
- `apps/web/src/styles.css` (design system global)
- `apps/web/src/main.tsx` (entry point Vite)
- `apps/web/vite.config.ts` (configuration dev)
- `apps/web/index.html` (template React)

### Contraintes
- Port: 5173 (dev server)
- Volume mount directory-to-directory (NOT file-to-file)
- Modules nommés vs defaults (App exported as named)
- CSS sync via HMR (hot module replacement)

### Pre-Test Checklist
- [ ] Docker services running: `docker compose ps`
- [ ] Vite dev server on port 5173: `curl http://localhost:5173`
- [ ] Git status clean or committed: `git status --short`

---

## 🔧 Agent: Dev Back

**Expert Backend Python FastAPI**

### Responsabilités
- Développement API FastAPI (uvicorn)
- Modèles SQLAlchemy et connexion PostgreSQL
- Routes et endpoints SAST
- Authentication & Authorization
- Intégration avec workers
- **CRITICAL**: Health endpoint for ngrok tunnel tests

### Expertise
- **Framework**: Python, FastAPI, Uvicorn
- **Database**: PostgreSQL 16, SQLAlchemy ORM
- **Cache**: Redis 7 pour sessions/cache
- **Tasks**: Workers asynchrones (Celery/APScheduler)
- **Testing**: Pytest avec coverage
- **API Routes**: `/v1/projects`, `/v1/analyses`, `/v1/rules`, etc.
- **Tunnel**: `GET /api/v1/health` → `{"status": "ok"}`

### Invocation
```
@dev-back créer l'endpoint pour [feature]
@dev-back implémenter la logique [métier]
@dev-back fixer le bug [description]
@dev-back check health endpoint status
```

### Fichiers Clés
- `apps/api/app/main.py` (application principale, health endpoint ligne ~180)
- `apps/api/app/models.py` (ORM models)
- `apps/api/app/routes/` (endpoints)
- `apps/api/app/db.py` (database config)
- `apps/api/app/auth.py` (authentication)
- `apps/api/Dockerfile` (API container image)
- `apps/api/requirements.txt` (dependencies)

### Contraintes
- Port: 8000 (FastAPI uvicorn)
- PostgreSQL: port 5432
- Redis: port 6379
- Volume mount: `./apps/api:/app` (code sync)
- Pytest avec `pytest.ini` pour config
- **NEVER**: Modify health endpoint without coordination

### Pre-Test Checklist
- [ ] Docker API service running: `docker compose ps | grep api`
- [ ] Health endpoint responds: `curl http://localhost:8000/api/v1/health`
- [ ] ngrok tunnel active: `curl https://purchase-banner-hacked.ngrok-free.dev/api/v1/health`
- [ ] PostgreSQL up: `docker compose ps | grep postgres`
- [ ] Dockerfile builds: `docker build -t newsastproject-api ./apps/api`
- [ ] requirements.txt valid: `pip install -r apps/api/requirements.txt --dry-run`

---

## 📊 Agent: Sonar

**Expert SonarQube & Analyse Statique**

### Responsabilités
- Configuration SonarQube & règles SAST
- Intégration CI/CD avec scans
- Analyse de code statique
- Gestion des gate de qualité
- Rapports et métriques
- **CRITICAL**: Manage ci_platform_scan.py script and coverage generation

### Expertise
- **SonarQube**: Configuration, règles, quality gates
- **SAST**: Python, TypeScript, C# scanning
- **CI/CD**: Azure Pipelines (ci_platform_scan.py)
- **Rapports**: Coverage reports, vulnerabilities
- **Rules**: Configuration des règles personnalisées
- **Quality Gates**: Thresholds de qualité
- **Coverage**: pytest, Jest, Maven, dotnet test
- **Duplication**: jscpd, line-based detection

### Script Critique
**`scripts/ci_platform_scan.py`** (1700+ lines)
- **Latest Commit**: `966bea3` - Auto-generate coverage reports
- **Key Function**: `generate_coverage_reports()` (line 834)
  - Detects: Python/pytest, Node.js/npm, Java/mvn, .NET/dotnet
  - Runs BEFORE `collect_real_sast_metrics()`
- **Outputs**: JSON with vulns/hotspots/bugs/smells + coverage + duplication
- **API Integration**: Posts findings to Platform API via HTTP

### Invocation
```
@sonar configurer la règle [name]
@sonar activer les quality gates pour [language]
@sonar générer le rapport de [branche]
@sonar check generate_coverage_reports() is called
@sonar validate script sync between repos
```

### Fichiers Clés
- `scripts/ci_platform_scan.py` (MAIN - scan orchestration)
- `azure-pipelines.yml` (CI/CD principal, calls ci_platform_scan.py full-test)
- `sonarlikesolution/templates/sast-stage.yml` (Template in Up.France.ODI.AzurePipelines)
- `coverage.xml` et `htmlcov/` (résultats coverage)
- `pytest.ini` (config tests)

### Test Scenarios (See `/memories/repo/sast-pipeline-context.md`)

#### Scenario 1: Local SAST Test

> `POST /v1/analyses` now enforces a real CI/CD token (`require_ci_token_auth`, see `apps/api/app/auth.py`). The token below is a placeholder — generate a current one from Administration > Security > PAT Management and substitute it here.

```bash
cd /tmp/Up.France.ODI.Commercant.Web
PLATFORM_PROJECT_KEY="Commercant" \
PLATFORM_API_URL="https://purchase-banner-hacked.ngrok-free.dev" \
PLATFORM_API_TOKEN="Lq_LR3rERrYteDAHFFulBODlGe5xiNWwNsCqWy8oXM4" \
python3 /home/abalasia-consulting-huawei/NewSASTProject/scripts/ci_platform_scan.py run
```
Expected: Coverage generation attempted, quality gate PASSED

#### Scenario 2: Azure Pipeline Test
```bash
cd /tmp/Up.France.ODI.Commercant.Web
git push origin feature/add-sast-pipeline
```
Monitor: Azure DevOps pipeline logs

### Contraintes
- SonarScanner pour Python/TS/C#
- Publication depuis CI/CD pipelines
- Intégration avec quality gates
- Rapports en XML/JSON
- **CRITICAL**: coverage generation must be idempotent (can't break if tests don't exist)
- **SYNC**: Script must be synced to Up.France.ODI.AzurePipelines repo if template uses it

### Pre-Test Checklist
- [ ] ngrok tunnel running: `curl https://purchase-banner-hacked.ngrok-free.dev/api/v1/health`
- [ ] API health responds: `curl http://localhost:8000/api/v1/health`
- [ ] Script has coverage generation: `grep -n "generate_coverage_reports" scripts/ci_platform_scan.py`
- [ ] Script synced to Azure repo: Check Up.France.ODI.AzurePipelines templates
- [ ] Latest commit pushed: `git log --oneline -1` shows `966bea3` or later
- [ ] Coverage detection works: `grep -A5 "Looking for coverage reports" scripts/ci_platform_scan.py`

---

## 🔐 Agent: DevSecOps

**Expert Sécurité & CI/CD**

### Responsabilités
- Sécurité des dépendances (CVE scanning)
- Configuration CI/CD (Azure Pipelines)
- Infrastructure as Code (Docker, Kubernetes)
- Secrets management & authentication
- Monitoring & logging
- Compliance & audit
- **CRITICAL**: Multi-repo synchronization & ngrok tunnel management

### Expertise
- **CI/CD**: Azure Pipelines, GitHub Actions, GitLab CI
- **Containerization**: Docker, Docker Compose, Kubernetes
- **Infrastructure**: Bicep, Terraform, IaC
- **Security**: Secrets, RBAC, passwordless auth
- **Scanning**: Dependabot, OWASP, SAST/DAST
- **Monitoring**: Application Insights, logging
- **Repos**: GitHub ↔ Azure DevOps synchronization

### Multi-Repo Architecture (CRITICAL)
```
1. Platform SAST (Core)
   - Local: /home/abalasia-consulting-huawei/NewSASTProject
   - Remote: https://github.com/amrLaz/SonarLikeSolution.git
   - Contains: API, UI, scripts

2. Azure Pipelines Templates (Global)
   - Remote: https://dev.azure.com/up-group/Up.France.ODI/_git/Up.France.ODI.AzurePipelines
   - Contains: YAML templates (sast-stage.yml)

3. Commercant.Web (Test Project)
   - Remote: https://dev.azure.com/up-group/Up.France.ODI/_git/Up.France.ODI.Commercant.Web
   - Local: /tmp/Up.France.ODI.Commercant.Web
   - Branch: feature/add-sast-pipeline
   - Type: TypeScript/C#
```

### Infrastructure Crítica - ngrok Tunnel
```bash
# MUST stay running during all tests
Terminal ID: ee017456-4889-49e0-8df4-87ba53519e7e
URL: https://purchase-banner-hacked.ngrok-free.dev
Target: localhost:8000 (API FastAPI)

# Health check
curl https://purchase-banner-hacked.ngrok-free.dev/api/v1/health
# Expected: {"status":"ok"}
```

### Infrastructure Crítica - Docker Services
```bash
docker compose up -d
# Services: postgres:16, redis:7, api, worker, web
docker compose ps  # Verify all 5 running
```

### Script Synchronization (CRITICAL)
- Script: `scripts/ci_platform_scan.py`
- GitHub commit: `966bea3` (latest with coverage generation)
- **ACTION**: Verify Azure DevOps templates use this script or same version
- **WARNING**: If templates use local copy, must sync from GitHub

### Invocation
```
@devsecops sécuriser [component]
@devsecops vérifier les vulnérabilités
@devsecops configurer le [secret/auth]
@devsecops sync script to Azure repos
@devsecops check ngrok tunnel status
@devsecops verify docker services running
```

### Fichiers Clés
- `docker-compose.yml` (orchestration services)
- `azure-pipelines.yml` (CI/CD pipeline - NewSASTProject)
- `apps/api/Dockerfile` (backend image)
- `apps/api/requirements.txt` (dependencies)
- `apps/web/Dockerfile` (frontend image)
- `infra/docker/` (configurations images)
- `.env.example` (templates secrets)

### Contraintes
- Pas de secrets en hardcoded
- Vault ou Key Vault pour secrets
- Images optimisées et signées
- RBAC et managed identities
- Logging centralisé
- **CRITICAL**: ngrok must be running before pipeline tests
- **CRITICAL**: Docker services must be up before API tests
- **CRITICAL**: Script modifications must be synced between repos

### Pre-Test Checklist
- [ ] ngrok tunnel running: `curl https://purchase-banner-hacked.ngrok-free.dev/api/v1/health`
- [ ] Docker services: `docker compose ps` (5 containers up)
- [ ] API health: `curl http://localhost:8000/api/v1/health` (200 OK)
- [ ] Script synced: Compare GitHub vs Azure repos for ci_platform_scan.py
- [ ] Commit pushed: `git log --oneline -1` shows latest commit
- [ ] Environment variables set: PLATFORM_API_URL, PLATFORM_API_TOKEN, etc.

---

## 🔄 Workflow Typique

```
1. @dev-front crée le composant UI
   ↓
2. @dev-back implémente l'API
   ↓
3. @sonar active les règles SAST
   ↓
4. @devsecops sécurise l'infrastructure
   ↓
5. Push vers GitHub (cf. .agent.md)
   ↓
6. Azure Pipelines exécute ci_platform_scan.py
```

---

## 📞 Appels Multi-Agents

**Pour une feature complète:**
```
@dev-front Créer le dashboard projects
@dev-back Implémenter GET /projects
@sonar Activer règles Python/TS
@devsecops Sécuriser les endpoints

Résultat: Feature complète sécurisée testée
```

---

## 🎯 Points de Synchronisation

- **Frontend**: Volume mount `./apps/web/src:/app/src` → hot reload immédiat
- **Backend**: Volume mount `./apps/api:/app` → redémarrage auto
- **SAST**: Pipeline Azure Pipelines → rapports en JSON/XML
- **Secrets**: `.env.example` → remplir localement, jamais commiter

---

## 📝 Convention de Nommage

```
components/        # Composants React
routes/            # Endpoints FastAPI
templates/         # Templates SAST/CI
infra/             # Infrastructure
tests/             # Suites de tests
scripts/           # Scripts utilitaires
```

