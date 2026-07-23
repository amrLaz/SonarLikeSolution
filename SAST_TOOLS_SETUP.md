# SAST Tools Setup Guide

Guide complet pour configurer les outils open source réalistes pour le pipeline SAST.

## 🎯 Outils Actuellement Supportés

### 1. **Détection de Vulnérabilités (Dependency Check)**

#### npm audit (Node.js)
```bash
# Inclus avec npm >= 6.0
npm audit --json
```
✅ **Automatique** - npm audit est intégré à npm

#### pip-audit (Python)
```bash
pip install pip-audit
pip-audit --format json
```

📦 **Installation:**
```bash
pip install pip-audit
```

### 2. **Sécurité SAST**

#### semgrep (Cross-language)
```bash
# Install via Homebrew / apt / pip
brew install semgrep
# OR
pip install semgrep

# Usage
semgrep scan --config p/security-audit --config p/secrets --json
```

#### bandit (Python Security)
```bash
pip install bandit
bandit -r . -f json
```

#### ESLint (TypeScript/JavaScript)
```bash
npm install --save-dev eslint
npx eslint --format json src/
```

### 3. **Détection de Secrets** ⭐ **NOUVEAU**

#### detect-secrets
```bash
pip install detect-secrets
detect-secrets scan --all-files --json
```

🔐 **Détecte:**
- Hardcoded credentials (AWS keys, API tokens)
- Private keys (SSH, PGP)
- Database passwords
- High entropy strings
- Custom patterns

📦 **Installation:**
```bash
pip install detect-secrets
```

### 4. **Coverage Reporting** ⭐ **AMÉLIORÉ**

#### Python: pytest + coverage
```bash
pip install pytest pytest-cov coverage
pytest --cov=. --cov-report=xml --cov-report=html
```

#### Node.js: Jest / Vitest
```bash
npm install --save-dev jest @types/jest
npm test -- --coverage
```

#### Java: Maven + JaCoCo
```bash
mvn clean test jacoco:report
```

#### .NET: dotnet test
```bash
dotnet test /p:CollectCoverage=true /p:CoverletOutputFormat=cobertura
```

#### Go: go test
```bash
go test ./... -coverprofile=coverage.out
```

---

## 📋 Quick Setup Checklist

### Python Projects
```bash
# Install dependencies
pip install pip-audit bandit semgrep pytest pytest-cov coverage detect-secrets

# Run SAST
PLATFORM_API_URL="http://localhost:8000" \
PLATFORM_REAL_SAST=true \
python3 scripts/ci_platform_scan.py full
```

### Node.js/TypeScript Projects
```bash
# Install dependencies
npm install --save-dev eslint @types/jest jest
npm install -g npm-audit  # Already included in npm

# Run SAST
PLATFORM_API_URL="http://localhost:8000" \
PLATFORM_REAL_SAST=true \
npm run ci:sast  # or python3 scripts/ci_platform_scan.py full
```

### Java Projects
```bash
# Ensure Maven is installed
mvn --version

# Run SAST (pom.xml must have jacoco plugin)
PLATFORM_API_URL="http://localhost:8000" \
PLATFORM_REAL_SAST=true \
python3 scripts/ci_platform_scan.py full
```

---

## 🔍 What's New in This Version

### ✅ Previously Supported
- ESLint, tsc (TypeScript)
- pylint, radon (Python)
- PMD, Checkstyle (Java)
- semgrep, bandit (Security)
- Code quality analysis
- Line-based duplication

### ✨ **NEW Features**
1. **npm audit** - Scans for CVEs in npm dependencies
2. **pip-audit** - Scans for CVEs in Python dependencies  
3. **detect-secrets** - Detects hardcoded credentials & secrets
4. **Real coverage generation** - Automatically runs tests with coverage:
   - pytest + coverage.py (Python)
   - Jest/Vitest (Node.js)
   - JaCoCo (Java)
   - OpenCover/Coverlet (.NET)
   - go test (Go)

---

## 📊 Analysis Pipeline Phases

### Phase 1: Coverage Report Generation
```
1. Detect project language (Python, Node.js, Java, .NET, Go, Ruby)
2. Run appropriate test framework with coverage flags
3. Generate coverage.xml or coverage-final.json
4. Store coverage reports in standard locations
```

### Phase 2: SAST Analysis
```
1. Language-specific analyzers (ESLint, pylint, tsc, etc.)
2. Cross-language security scanning (semgrep, bandit, detect-secrets)
3. Dependency vulnerability scanning (npm audit, pip-audit)
4. Code quality metrics calculation
5. Duplication detection (jscpd or line-based)
```

### Phase 3: Results Upload
```
1. Collect all findings
2. Calculate SonarQube-style scores (100-point scale)
3. Submit analysis to platform API
4. Get quality gate result (PASS/FAIL)
```

---

## 🛠️ Environment Variables

```bash
# Required
PLATFORM_API_URL              # Platform API URL (e.g., http://localhost:8000)

# Optional
PLATFORM_PROJECT_KEY          # Project key (default: new-sast-platform)
PLATFORM_API_TOKEN            # Bearer token for API auth
PLATFORM_API_TOKEN_REQUIRED   # Require token (default: true)
PLATFORM_REAL_SAST            # Enable real SAST (default: true)
PLATFORM_SCAN_TARGET          # Scan targets (default: auto-detect)
PLATFORM_SCAN_IGNORE          # Ignore patterns (comma-separated)

# CI/CD Environment
BUILD_SOURCEVERSION           # Commit SHA (Azure DevOps)
BUILD_SOURCEBRANCHNAME        # Branch name (Azure DevOps)
GITHUB_SHA                    # Commit SHA (GitHub Actions)
GITHUB_REF_NAME               # Branch name (GitHub Actions)
```

---

## 🚀 Running the SAST Pipeline

### Local Development
```bash
# Full pipeline (prepare + run + test)
PLATFORM_API_URL="http://localhost:8000" \
python3 scripts/ci_platform_scan.py full

# Analyze only (skip prepare)
PLATFORM_API_URL="http://localhost:8000" \
python3 scripts/ci_platform_scan.py run
```

### Azure DevOps Pipeline
```yaml
- task: PythonScript@0
  inputs:
    scriptSource: 'filePath'
    scriptPath: 'scripts/ci_platform_scan.py'
    arguments: 'full'
  env:
    PLATFORM_API_URL: $(PLATFORM_API_URL)
    PLATFORM_PROJECT_KEY: $(Build.Repository.Name)
```

### GitHub Actions
```yaml
- name: Run SAST Analysis
  env:
    PLATFORM_API_URL: ${{ secrets.PLATFORM_API_URL }}
  run: |
    pip install -r requirements.txt
    python3 scripts/ci_platform_scan.py full
```

---

## 📚 Tool Documentation

- [semgrep](https://semgrep.dev/) - Security scanning engine
- [bandit](https://bandit.readthedocs.io/) - Python security
- [detect-secrets](https://github.com/Yelp/detect-secrets) - Secret detection
- [pip-audit](https://github.com/pypa/pip-audit) - Python dependency audit
- [ESLint](https://eslint.org/) - JavaScript linting
- [pytest-cov](https://pytest-cov.readthedocs.io/) - Python code coverage
- [JaCoCo](https://www.jacoco.org/) - Java code coverage

---

## ✅ Verification Checklist

- [ ] ngrok running: `curl https://purchase-banner-hacked.ngrok-free.dev/api/v1/health`
- [ ] API running: `docker compose ps | grep api`
- [ ] npm installed: `npm --version`
- [ ] pip-audit installed: `pip-audit --version`
- [ ] detect-secrets installed: `detect-secrets --version`
- [ ] semgrep installed: `semgrep --version`
- [ ] Test scripts exist in package.json / pytest.ini
- [ ] Coverage tools installed (pytest, jest, etc.)

---

## 🎯 Expected Output

After running the pipeline:

```
= Coverage Report Generation =
🧪 Python: Running pytest with coverage...
  ✅ pytest coverage completed

🧪 Node.js/TypeScript: Detecting test framework...
  Found test script. Running with coverage...
  ✅ npm test --coverage completed

= SAST Analysis =
SAST targets: .
Non-empty LOC: 1250
Languages: typescript, python

  -> ESLint + tsc (TypeScript/JavaScript)...
  -> pylint + radon (Python)...
  -> npm audit (Node.js dependency vulnerabilities)...
  -> pip-audit (Python dependency vulnerabilities)...
  -> detect-secrets (credential/secret scanning)...
  -> semgrep (security-audit + secrets, all languages)...
  -> bandit (Python security)...

SAST summary: vulns=0 hotspots=0 smells=5 bugs=2 | security=100 reliability=95 maintainability=92
📊 Average code coverage across 2 report(s): 78%

Analysis submitted: ad19b592-9332-46c5-a1cb-a7853cea919e
Quality gate PASSED ✓
```

---

## 🐛 Troubleshooting

### npm audit fails
```bash
# Clear npm cache
npm cache clean --force

# Try again
npm audit
```

### detect-secrets not detecting
```bash
# Rescan with all files
detect-secrets scan --all-files --force-add

# List baseline
detect-secrets baseline -l
```

### Coverage not found
```bash
# Check pytest.ini
cat pytest.ini

# Run with explicit coverage
pytest --cov=. --cov-report=xml --cov-report=html -v
```

### pip-audit hangs
```bash
# Run with timeout
timeout 30 pip-audit --format json || echo "Timeout"
```

---

**Version:** 1.0  
**Last Updated:** June 2026
