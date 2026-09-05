# syntax=docker/dockerfile:1
# ── Stage 1 : build the React SPA ─────────────────────────────────────────────
# package.json is inlined here because the local copy is a broken root-owned
# directory that cannot be copied. A fresh repo clone will not have this issue;
# the inline version keeps the CI build self-contained regardless.
FROM node:20-slim AS web-builder
WORKDIR /build

RUN cat > package.json << 'PKGJSON'
{
  "name": "sast-platform-web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.1",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.1",
    "typescript": "^5.5.3",
    "vite": "^5.3.4"
  }
}
PKGJSON

RUN npm install

COPY apps/web/src/        ./src/
COPY apps/web/index.html  apps/web/vite.config.ts  apps/web/tsconfig.json  ./

RUN npm run build


# ── Stage 2 : FastAPI + bundled static files ───────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc \
    && rm -rf /var/lib/apt/lists/*

COPY apps/api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/api/app/ ./app/

# React SPA lands here; main.py mounts it on "/"
COPY --from=web-builder /build/dist ./static

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

# 2 workers for the B1 tier (1 vCPU); adjust via UVICORN_WORKERS env var
CMD ["sh", "-c", "python -m app.migrate && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${UVICORN_WORKERS:-2}"]
