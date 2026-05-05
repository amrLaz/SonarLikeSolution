# Expert Agents for SAST Platform

Configuration des agents experts pour le projet NewSASTProject. Chaque agent est spécialisé dans un domaine technique spécifique.

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

---

## 🔧 Agent: Dev Back

**Expert Backend Python FastAPI**

### Responsabilités
- Développement API FastAPI (uvicorn)
- Modèles SQLAlchemy et connexion PostgreSQL
- Routes et endpoints SAST
- Authentication & Authorization
- Intégration avec workers

### Expertise
- **Framework**: Python, FastAPI, Uvicorn
- **Database**: PostgreSQL 16, SQLAlchemy ORM
- **Cache**: Redis 7 pour sessions/cache
- **Tasks**: Workers asynchrones (Celery/APScheduler)
- **Testing**: Pytest avec coverage
- **API Routes**: `/v1/projects`, `/v1/analyses`, `/v1/rules`, etc.

### Invocation
```
@dev-back créer l'endpoint pour [feature]
@dev-back implémenter la logique [métier]
@dev-back fixer le bug [description]
```

### Fichiers Clés
- `apps/api/app/main.py` (application principale)
- `apps/api/app/models.py` (ORM models)
- `apps/api/app/routes/` (endpoints)
- `apps/api/app/db.py` (database config)
- `apps/api/app/auth.py` (authentication)

### Contraintes
- Port: 8000 (FastAPI uvicorn)
- PostgreSQL: port 5432
- Redis: port 6379
- Volume mount: `./apps/api:/app` (code sync)
- Pytest avec `pytest.ini` pour config

---

## 📊 Agent: Sonar

**Expert SonarQube & Analyse Statique**

### Responsabilités
- Configuration SonarQube & règles SAST
- Intégration CI/CD avec scans
- Analyse de code statique
- Gestion des gate de qualité
- Rapports et métriques

### Expertise
- **SonarQube**: Configuration, règles, quality gates
- **SAST**: Python, TypeScript, C# scanning
- **CI/CD**: Azure Pipelines (ci_platform_scan.py)
- **Rapports**: Coverage reports, vulnerabilities
- **Rules**: Configuration des règles personnalisées
- **Quality Gates**: Thresholds de qualité

### Invocation
```
@sonar configurer la règle [name]
@sonar activer les quality gates pour [language]
@sonar générer le rapport de [branche]
```

### Fichiers Clés
- `scripts/ci_platform_scan.py` (scan orchestration)
- `sonarlikesolution/templates/sast-stage.yml` (pipeline stage)
- `azure-pipelines.yml` (CI/CD principal)
- `coverage.xml` et `htmlcov/` (résultats coverage)
- `pytest.ini` (config tests)

### Contraintes
- SonarScanner pour Python/TS/C#
- Publication depuis CI/CD pipelines
- Intégration avec quality gates
- Rapports en XML/JSON

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

### Expertise
- **CI/CD**: Azure Pipelines, GitHub Actions, GitLab CI
- **Containerization**: Docker, Docker Compose, Kubernetes
- **Infrastructure**: Bicep, Terraform, IaC
- **Security**: Secrets, RBAC, passwordless auth
- **Scanning**: Dependabot, OWASP, SAST/DAST
- **Monitoring**: Application Insights, logging

### Invocation
```
@devsecops sécuriser [component]
@devsecops vérifier les vulnérabilités
@devsecops configurer le [secret/auth]
```

### Fichiers Clés
- `docker-compose.yml` (orchestration services)
- `azure-pipelines.yml` (CI/CD pipeline)
- `apps/api/Dockerfile` (backend image)
- `apps/web/Dockerfile` (frontend image)
- `infra/docker/` (configurations images)
- `.env.example` (templates secrets)

### Contraintes
- Pas de secrets en hardcoded
- Vault ou Key Vault pour secrets
- Images optimisées et signées
- RBAC et managed identities
- Logging centralisé

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

