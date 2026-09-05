# syntax=docker/dockerfile:1
# ── Stage 1 : build the React SPA ─────────────────────────────────────────────
# The build generates the React package manifest.
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
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "@tanstack/react-query": "5.102.8"
  },
  "devDependencies": {
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.7",
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


# ── Stage 2 : publish .NET API ────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api-builder
WORKDIR /build
COPY Directory.Build.props ./
COPY apps/api/CodeInsights.Api.csproj ./
RUN dotnet restore
COPY apps/api/ ./
RUN dotnet publish -c Release --no-restore -o /publish

# ── Stage 3 : ASP.NET Core + bundled React ─────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=api-builder /publish ./
COPY --from=web-builder /build/dist ./wwwroot
ENV ASPNETCORE_URLS=http://+:8000
USER $APP_UID
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD ["dotnet", "CodeInsights.Api.dll", "--healthcheck"]
# Migrations complete before the server opens its HTTP listener.
ENTRYPOINT ["dotnet", "CodeInsights.Api.dll"]
