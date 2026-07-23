# 🚀 Production Deployment Checklist

**Platform:** NewSASTProject SAST Platform  
**Target:** Azure DevOps + Production Environment  
**Prepared By:** Architecture Team  
**Date:** 15/06/2026

---

## Phase 1: Pre-Deployment Verification ✅

### 1.1 Code Quality & Syntax
- [x] All Python files compile: `python3 -m py_compile`
- [x] No syntax errors in pipeline script
- [x] TypeScript compilation successful
- [x] ESLint checks pass
- [x] Unit tests pass (if applicable)

**Verification Command:**
```bash
python3 -m py_compile scripts/ci_platform_scan.py && echo "✅ Ready"
```

### 1.2 Docker Infrastructure
- [x] All 5 containers build successfully
- [x] docker-compose.yml validated
- [x] Volume mounts configured correctly
- [x] Environment variables set properly
- [x] Network connectivity verified

**Verification Command:**
```bash
docker compose config > /dev/null && echo "✅ Config valid"
docker compose build --no-cache
docker compose up -d && docker compose ps
```

### 1.3 Database Initialization
- [x] PostgreSQL schema exists
- [x] All tables created
- [x] Default data inserted (projects, quality gates)
- [x] User permissions configured
- [x] Backup procedures tested

**Verification SQL:**
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' ORDER BY table_name;
```

### 1.4 API Endpoints
- [x] All endpoints respond with 200 OK
- [x] Authentication working (Azure DevOps PAT)
- [x] CORS headers correct
- [x] Rate limiting configured (if needed)
- [x] Error handling comprehensive

**Verification Commands:**
```bash
curl http://localhost:8000/api/v1/health
curl http://localhost:8000/api/v1/projects
curl http://localhost:8000/api/v1/analyses
```

### 1.5 Frontend Assets
- [x] All components render correctly
- [x] Styling complete and responsive
- [x] Navigation working
- [x] Forms functional
- [x] No console errors

**Verification Command:**
```bash
curl -I http://localhost:5173/index.html | grep 200
```

---

## Phase 2: Security Hardening 🔒

### 2.1 Secrets Management
- [ ] All credentials moved to Azure Key Vault (or equivalent)
- [ ] Database password: `${KEY_VAULT_DB_PASSWORD}`
- [ ] API tokens: `${KEY_VAULT_API_TOKEN}`
- [ ] No secrets in git repository

**Implementation:**
```bash
# Create Key Vault
az keyvault create --name sast-platform-kv --resource-group myRG

# Store secrets
az keyvault secret set --vault-name sast-platform-kv \
  --name db-password --value "***"
```

### 2.2 Database Security
- [ ] SSL/TLS enabled for PostgreSQL
- [ ] User roles configured (principle of least privilege)
- [ ] Backup encryption enabled
- [ ] Audit logging enabled

**PostgreSQL Configuration:**
```bash
# Enable SSL
PGSSLMODE=require psql -h db.example.com -U sast_user

# Create restricted user role
CREATE ROLE sast_worker WITH NOINHERIT;
GRANT CONNECT ON DATABASE sast_platform TO sast_worker;
```

### 2.3 API Security
- [ ] HTTPS enforced (no HTTP)
- [ ] CORS whitelist configured
- [ ] Rate limiting enabled
- [ ] SQL injection protection (SQLAlchemy ORM ✓)
- [ ] XSS protection headers set

**Security Headers:**
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000
```

### 2.4 Dependency Scanning
- [x] npm audit: 0 vulnerabilities
- [ ] Python dependencies: pip-audit scan
- [ ] Docker base images: latest patches
- [ ] Regular scanning configured (weekly)

**Setup Weekly Scan:**
```bash
# GitHub Actions example
name: Dependency Scan
on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: pip-audit
      - run: npm audit
```

---

## Phase 3: Infrastructure Setup 🏗️

### 3.1 Azure Container Registry
- [ ] Create ACR instance
- [ ] Configure authentication
- [ ] Push images:
  - newsastproject-api
  - newsastproject-worker
  - newsastproject-web

**Setup Commands:**
```bash
# Create ACR
az acr create --resource-group myRG --name sastregsitry --sku Basic

# Push images
docker tag newsastproject-api sastregsitry.azurecr.io/api:latest
docker push sastregsitry.azurecr.io/api:latest
```

### 3.2 Azure App Service or Container Apps
- [ ] Create app service
- [ ] Configure environment variables
- [ ] Set up health check endpoint
- [ ] Configure auto-scaling
- [ ] Enable Application Insights

**App Service Configuration:**
```bash
az appservice create --resource-group myRG \
  --plan myAppServicePlan --name sast-platform

# Set environment variables
az webapp config appsettings set --resource-group myRG \
  --name sast-platform --settings PLATFORM_ENV=production
```

### 3.3 Database Migration
- [ ] Create Azure Database for PostgreSQL
- [ ] Migrate schema from local
- [ ] Verify data integrity
- [ ] Set up automated backups
- [ ] Configure monitoring/alerts

**Migration Steps:**
```bash
# Backup local database
docker compose exec postgres pg_dump -U sast_user sast_platform > backup.sql

# Restore to Azure
psql -h sast-db.postgres.database.azure.com -U sast_user@sast-db \
  -d sast_platform < backup.sql
```

### 3.4 Networking
- [ ] Configure Virtual Network
- [ ] Set up Network Security Groups (NSGs)
- [ ] Enable Private Endpoints (optional)
- [ ] Configure DNS
- [ ] Enable DDoS protection

**NSG Rules:**
```bash
# Allow HTTPS only
az network nsg rule create --resource-group myRG --nsg-name myNSG \
  --name AllowHTTPS --protocol tcp --direction Inbound \
  --source-address-prefix '*' --destination-address-prefix '*' \
  --destination-port-range 443 --access Allow --priority 100
```

---

## Phase 4: CI/CD Pipeline Setup 🔄

### 4.1 Azure Pipelines Configuration
- [ ] Create pipeline project
- [ ] Configure triggers (on push to main/develop)
- [ ] Set up SAST stage

**azure-pipelines.yml:**
```yaml
trigger:
  - main
  - develop

pool:
  vmImage: 'ubuntu-latest'

stages:
- stage: SAST
  jobs:
  - job: SecurityScan
    steps:
    - task: UsePythonVersion@0
      inputs:
        versionSpec: '3.9'
    
    - script: |
        pip install -r requirements.txt
        python3 scripts/ci_platform_scan.py run
      env:
        PLATFORM_API_URL: $(PLATFORM_API_URL)
        PLATFORM_API_TOKEN: $(PLATFORM_API_TOKEN)
        PLATFORM_PROJECT_KEY: $(Build.Repository.Name)
```

### 4.2 Variable Groups
- [ ] Create variable group: `SAST-Platform`
- [ ] Store sensitive values:
  - PLATFORM_API_URL
  - PLATFORM_API_TOKEN
  - DATABASE_PASSWORD
  - AZURE_DEVOPS_PAT

**Setup:**
```bash
# Create variable group
az pipelines variable-group create --project MyProject \
  --name "SAST-Platform" --authorize true \
  --variables PLATFORM_API_URL=https://xxx.ngrok.io
```

### 4.3 PR Validation
- [ ] Enable branch protection
- [ ] Require pipeline success
- [ ] Require code review
- [ ] Configure auto-merge (optional)

**Branch Policy:**
```bash
az repos pr policy required-reviewer add \
  --repository-id $(Build.Repository.ID) \
  --branch main --creator-vote-counts false --minimum-approver-count 1
```

---

## Phase 5: Monitoring & Logging 📊

### 5.1 Application Insights Setup
- [ ] Create Application Insights resource
- [ ] Configure instrumentation key
- [ ] Enable dependency tracking
- [ ] Set up alerts

**Code Integration:**
```python
from applicationinsights import TelemetryClient

client = TelemetryClient(instrumentation_key)
client.track_event('SAST_Analysis_Started')
```

### 5.2 Logging Configuration
- [ ] Configure structured logging (JSON)
- [ ] Set up log aggregation (ELK, Azure Monitor)
- [ ] Configure log retention (30 days)
- [ ] Set up alerts for errors/warnings

**Logging Example:**
```python
import logging
import json

logger = logging.getLogger(__name__)
handler = logging.StreamHandler()
formatter = logging.JsonFormatter()
handler.setFormatter(formatter)
logger.addHandler(handler)
```

### 5.3 Performance Monitoring
- [ ] Monitor API response times
- [ ] Track database query performance
- [ ] Monitor container CPU/memory
- [ ] Set up alerts for anomalies

**Metrics to Monitor:**
- API response time: target < 2 seconds
- Database queries: target < 500ms
- Pipeline execution: target < 30 seconds
- Error rate: target < 0.1%

---

## Phase 6: Testing & Validation 🧪

### 6.1 Integration Testing
- [ ] Test SAST pipeline end-to-end
- [ ] Verify Azure DevOps integration
- [ ] Test quality gate enforcement
- [ ] Validate error handling

**Test Script:**
```bash
#!/bin/bash
# Integration test
PLATFORM_API_URL="https://sast.example.com" \
PLATFORM_PROJECT_KEY="TestProject" \
python3 scripts/ci_platform_scan.py run

# Verify results
curl https://sast.example.com/api/v1/analyses | jq '.[-1]'
```

### 6.2 Load Testing
- [ ] Simulate concurrent analyses
- [ ] Test database connection pool
- [ ] Verify API rate limiting
- [ ] Check memory leaks

**Load Test Example:**
```bash
# Using Apache Bench
ab -n 1000 -c 10 https://sast.example.com/api/v1/health
```

### 6.3 Security Testing
- [ ] Penetration testing (if applicable)
- [ ] OWASP Top 10 validation
- [ ] Dependency vulnerability scan
- [ ] Secret scanning

**OWASP Scan:**
```bash
docker run --rm -v $(pwd):/root/report \
  zaproxy/baseline:latest \
  -t https://sast.example.com \
  -r sast_scan_report.html
```

---

## Phase 7: Documentation & Handover 📚

### 7.1 Operational Documentation
- [x] README.md - Project overview
- [x] SAST_TOOLS_SETUP.md - Tool installation
- [x] PIPELINE_VALIDATION_REPORT.md - Test results
- [x] FINAL_STATUS.md - System status
- [ ] DEPLOYMENT_GUIDE.md - This checklist
- [ ] RUNBOOKS.md - Operational procedures

### 7.2 Runbooks (Create)
- [ ] How to restart services
- [ ] How to check logs
- [ ] How to manually trigger pipeline
- [ ] How to handle common errors
- [ ] How to perform backups
- [ ] How to recover from failures

**Runbook Template:**
```markdown
## Restart API Service

### Prerequisites
- Access to production environment
- Docker installed

### Steps
1. SSH to production server
2. cd /opt/sast-platform
3. docker compose restart api
4. curl http://localhost:8000/api/v1/health
5. Verify response: {"status":"ok"}

### Rollback
docker compose down
git checkout stable-version
docker compose up -d
```

### 7.3 Training Materials
- [ ] Operator training (deployment, monitoring)
- [ ] Developer training (pipeline, integrations)
- [ ] Administrator training (configuration, security)

---

## Phase 8: Go-Live 🎉

### 8.1 Pre-Launch Checklist
- [ ] All phases completed
- [ ] Load testing passed
- [ ] Security audit passed
- [ ] Documentation complete
- [ ] Team trained
- [ ] Backup procedures verified
- [ ] Rollback plan documented
- [ ] Monitoring alerts configured

### 8.2 Launch Steps
1. **Backup:** Full database backup
2. **Deploy:** Push to production via pipeline
3. **Verify:** Health checks pass
4. **Monitor:** Check metrics for 1 hour
5. **Notify:** Inform stakeholders

**Launch Command:**
```bash
# Tag release
git tag -a v1.0.0 -m "Production release"
git push origin v1.0.0

# Pipeline automatically deploys tagged version
```

### 8.3 Post-Launch Monitoring (First 24 Hours)
- [ ] Monitor error rates
- [ ] Check API performance
- [ ] Verify database health
- [ ] Monitor cost metrics
- [ ] Check user feedback

---

## Success Criteria

- ✅ All containers running and healthy
- ✅ Database accessible and responsive
- ✅ API health check returning 200 OK
- ✅ ngrok tunnel operational (or production URL live)
- ✅ Azure DevOps integration working
- ✅ SAST pipeline executing successfully
- ✅ Quality gates evaluating correctly
- ✅ UI dashboard displaying metrics
- ✅ Monitoring and logging operational
- ✅ Team trained on operations

---

## Rollback Plan

**If critical issue detected:**

1. **Immediate Action:**
   ```bash
   git revert HEAD  # Revert last commit
   docker compose restart  # Restart services
   ```

2. **Database Rollback (if needed):**
   ```bash
   # Restore from backup
   docker compose exec postgres psql -U sast_user sast_platform < backup.sql
   ```

3. **Notification:**
   - Notify stakeholders
   - Open incident ticket
   - Document root cause

---

## Contact & Support

**On-Call Support:**
- Ops Team: ops@example.com
- Security Team: security@example.com
- DevOps Team: devops@example.com

**Issue Escalation:**
1. Check runbooks
2. Contact ops team
3. Escalate to platform lead
4. Emergency contact (24/7)

---

## Appendix A: Quick Reference

### Start Services
```bash
docker compose up -d
```

### Check Health
```bash
curl http://localhost:8000/api/v1/health
```

### View Logs
```bash
docker compose logs -f api
```

### Run Pipeline
```bash
python3 scripts/ci_platform_scan.py run
```

### Database Access
```bash
docker compose exec postgres psql -U sast_user sast_platform
```

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Architect | - | - | ☐ |
| Security | - | - | ☐ |
| Operations | - | - | ☐ |
| Project Lead | - | - | ☐ |

---

**Last Updated:** 15/06/2026  
**Status:** Ready for Production Deployment  
**Version:** 1.0.0
