# 🚀 Quick Start - SAST Platform & Commercant.Web

**Ready to use. Copy-paste commands below.**

---

## 1️⃣ Start SAST Platform (If Not Already Running)

```bash
cd /home/abalasia-consulting-huawei/NewSASTProject

# Start all services
docker compose up -d

# Verify all running
docker compose ps

# Start ngrok tunnel (new terminal)
ngrok http 8000

# Access dashboard
# → Frontend: http://localhost:5173
# → API: http://localhost:8000
```

---

## 2️⃣ Test with Commercant.Web (Local)

```bash
# Run the complete SAST pipeline for Commercant
/tmp/run-commercant-sast.sh

# View results in dashboard
# → http://localhost:5173
# → Project: Commercant
# → Branch: feature/add-sast-pipeline
```

---

## 3️⃣ Test with Real Commercant Repository

### Option A: If You Have Access to Azure DevOps
```bash
# Clone the real repository
git clone https://dev.azure.com/up-group/Up.France.ODI/_git/Commercant.Web

cd Commercant.Web

# Create feature branch
git checkout -b feature/add-sast-pipeline

# Copy pipeline configuration
curl -s https://your-server.com/COMMERCANT_SETUP.md | grep -A 200 "azure-pipelines.yml" > azure-pipelines.yml

# Or manually create (see COMMERCANT_SETUP.md)

# Configure variables in Azure DevOps
# Settings → Pipelines → Variables
# - PLATFORM_API_URL = https://purchase-banner-hacked.ngrok-free.dev
# - PLATFORM_PROJECT_KEY = Commercant

# Commit & push
git add azure-pipelines.yml
git commit -m "Add SAST pipeline"
git push origin feature/add-sast-pipeline

# Pipeline runs automatically
# View: https://dev.azure.com/up-group
```

### Option B: Simulate Without Azure DevOps
```bash
mkdir -p ~/MyCommerçant.Web
cd ~/MyCommerçant.Web

# Copy your app files here
# Or just create test structure:
mkdir -p src/components src/api src/utils tests

# Create minimal package.json
cat > package.json << 'EOF'
{
  "name": "commercant-web",
  "scripts": {
    "test": "echo 'Tests run'",
    "test:coverage": "echo 'Coverage: 50%'"
  },
  "dependencies": {
    "react": "^18.3.1",
    "axios": "^1.6.0"
  }
}
EOF

# Run SAST
PLATFORM_API_URL="https://purchase-banner-hacked.ngrok-free.dev" \
PLATFORM_PROJECT_KEY="Commercant" \
python3 /home/abalasia-consulting-huawei/NewSASTProject/scripts/ci_platform_scan.py run
```

---

## 4️⃣ View Results

### Dashboard
```
Browser: http://localhost:5173
Project selector → Commercant
Branch → feature/add-sast-pipeline
View metrics, findings, quality gates
```

### API
```bash
# Get all analyses
curl http://localhost:8000/api/v1/analyses | jq '.[]'

# Get specific analysis
curl http://localhost:8000/api/v1/analyses/89c17a81-23df-4460-aee2-218401e594e5

# Get projects
curl http://localhost:8000/api/v1/projects | jq '.[]'
```

---

## 5️⃣ Fix Issues Found

Based on test results:
```
❌ Security: 88/100 (target: 90+)
   - Fix src/api/client.ts: Add error handling
   - Fix src/components/Dashboard.tsx: Prevent XSS

✅ Reliability: 92/100 ✓
✅ Maintainability: 85/100 ✓
⚠️  Coverage: 52% (target: 80%+)
```

### Quick Fixes
```typescript
// src/api/client.ts - Add error handling
try {
  const response = await this.client.get('/api/v1/projects');
  return response.data;
} catch (error) {
  console.error('API error:', error);
  return [];  // Handle error
}

// src/components/Dashboard.tsx - Prevent XSS
// Use React's automatic escaping:
<div>{sanitize(userInput)}</div>  // Safe
// NOT: <div dangerouslySetInnerHTML={{__html: userInput}} />
```

---

## 6️⃣ Re-run After Fixes

```bash
# After fixing issues
cd ~/Commercant.Web

# Run SAST again
PLATFORM_API_URL="https://purchase-banner-hacked.ngrok-free.dev" \
PLATFORM_PROJECT_KEY="Commercant" \
python3 /home/abalasia-consulting-huawei/NewSASTProject/scripts/ci_platform_scan.py run

# Verify:
# - Security score should increase to 90+
# - All metrics should improve
# - Quality gate should PASS
```

---

## 📋 Configuration Reference

### Environment Variables
```bash
PLATFORM_API_URL="https://purchase-banner-hacked.ngrok-free.dev"
PLATFORM_PROJECT_KEY="Commercant"
PLATFORM_REAL_SAST="true"
PLATFORM_SCAN_TARGET="."
PLATFORM_SCAN_IGNORE="node_modules,*.test.ts"
```

### Quality Gate Thresholds
```
Security:       >= 90/100
Reliability:    >= 80/100
Maintainability: >= 70/100
Coverage:       >= 80% (recommended)
Duplication:    <= 3% (recommended)
```

### Supported CI Providers
- `azure-devops` - Azure DevOps Pipelines
- `github-actions` - GitHub Actions
- `local` - Local testing

---

## 🔧 Troubleshooting

### ngrok tunnel down
```bash
# Reconnect
ngrok http 8000
# Copy new URL to PLATFORM_API_URL
```

### Docker containers not running
```bash
docker compose down
docker compose up -d
docker compose logs -f api  # View logs
```

### SAST script errors
```bash
# Verify syntax
python3 -m py_compile scripts/ci_platform_scan.py

# Run with debug
python3 scripts/ci_platform_scan.py run --debug
```

### Dashboard not loading
```bash
# Verify API health
curl http://localhost:8000/api/v1/health

# Check frontend
curl http://localhost:5173

# Clear browser cache
# Ctrl+Shift+Delete (or Cmd+Shift+Delete on Mac)
```

---

## 📚 Full Documentation

| Document | Purpose |
|----------|---------|
| `COMMERCANT_SETUP.md` | Complete setup guide |
| `COMMERCANT_TEST_RESULTS.md` | Test results & analysis |
| `SAST_TOOLS_SETUP.md` | Tool installation |
| `PIPELINE_VALIDATION_REPORT.md` | Validation results |
| `FINAL_STATUS.md` | System status |
| `DEPLOYMENT_GUIDE.md` | Production deployment |

---

## 📞 Support

### Logs
```bash
# API logs
docker compose logs -f api

# Frontend logs
docker compose logs -f web

# Worker logs
docker compose logs -f worker

# Database logs
docker compose logs -f postgres
```

### Database Access
```bash
# Connect to PostgreSQL
docker compose exec postgres psql -U sast_user -d sast_platform

# List analyses
SELECT analysis_id, project_key, branch, status FROM analyses ORDER BY created_at DESC;
```

---

## ✅ Verification Checklist

Before running SAST:
- [ ] Docker compose running: `docker compose ps`
- [ ] API responding: `curl http://localhost:8000/api/v1/health`
- [ ] Frontend accessible: http://localhost:5173
- [ ] ngrok tunnel active: Check tunnel URL
- [ ] Environment variables set: `echo $PLATFORM_API_URL`
- [ ] Source files present: `ls -la src/`

After running SAST:
- [ ] No errors in output
- [ ] Analysis ID returned
- [ ] Results visible in dashboard
- [ ] Metrics displayed correctly
- [ ] Quality gate evaluated

---

## 🎯 Common Scenarios

### Scenario 1: Test Local Project
```bash
cd /tmp/my-project
PLATFORM_API_URL="https://purchase-banner-hacked.ngrok-free.dev" \
python3 /home/abalasia-consulting-huawei/NewSASTProject/scripts/ci_platform_scan.py run
```

### Scenario 2: Use with Azure Pipelines
```yaml
# In azure-pipelines.yml
- script: |
    python3 scripts/ci_platform_scan.py run
  env:
    PLATFORM_API_URL: $(PLATFORM_API_URL)
    PLATFORM_PROJECT_KEY: $(PLATFORM_PROJECT_KEY)
```

### Scenario 3: Continuous Monitoring
```bash
# Run tests on every commit
git log -1 --format="%H %s" | while read commit msg; do
  PLATFORM_API_URL="https://..." python3 ci_platform_scan.py run
  sleep 300  # Wait 5 min before next
done
```

### Scenario 4: Integration with Slack
```bash
# Notify on quality gate failure
if [ "$QUALITY_GATE" == "fail" ]; then
  curl -X POST $SLACK_WEBHOOK \
    -d '{"text": "SAST Quality Gate Failed"}'
fi
```

---

## 🚀 Summary

1. **Start Platform:** `docker compose up -d && ngrok http 8000`
2. **Test Project:** `/tmp/run-commercant-sast.sh`
3. **View Results:** http://localhost:5173
4. **Real Project:** Follow option A or B above
5. **Fix Issues:** Edit source files
6. **Re-test:** Run SAST again
7. **Deploy:** Use azure-pipelines.yml

**All ready to go! 🎉**

---

**Last Updated:** 2026-06-15  
**Status:** ✅ Production Ready  
**Version:** 1.0.0
