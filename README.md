---
title: Up.France.CodeInsights
description: Application de consolidation des analyses de code et trajectoire vers un hub multi-rapports sur Azure.
---

# Up.France.CodeInsights

[![Application](https://dev.azure.com/up-group/c1dd9043-ad8d-467e-9cf6-646b6381ef0f/_apis/build/status/969?branchName=master&label=Application)](https://dev.azure.com/up-group/Up.France.ODI/_build?definitionId=969)
[![Infrastructure](https://dev.azure.com/up-group/c1dd9043-ad8d-467e-9cf6-646b6381ef0f/_apis/build/status/963?branchName=master&label=Infrastructure)](https://dev.azure.com/up-group/Up.France.ODI/_build?definitionId=963)

L'application **CodeInsights** consolide les analyses de code de plusieurs projets et expose leurs métriques, quality gates, vulnérabilités et historiques. Le [parcours P1](docs/p1-ingestion.md) importe SARIF, couverture, CycloneDX et SPDX via Blob et une file PostgreSQL durable ; il ajoute profils versionnés, comparaison Git et retours PR. Le contrat historique de publication reste disponible. La validation locale ne remplace pas la campagne complète de capacité ni le pilote Azure DevOps.

Le runtime est ASP.NET Core 10 / Entity Framework Core 10 / Npgsql / PostgreSQL avec une interface React. Le [Dockerfile](Dockerfile) embarque l'API et le frontend dans une image Linux ; `src/` contient des sources d'analyse et ne constitue pas le runtime de la plateforme.

- [Documentation et audit des capacités](docs/index.md)
- [Intégration des builds](docs/integration.md)
- [Exploitation et développement local](docs/exploitation.md)
- [Validation de l’application](docs/validation.md)
- [Roadmap produit priorisée](docs/roadmap.md)
- [Infrastructure Terraform Azure](infra/PLATFORM_SAST.md)

La solution [CodeInsights.slnx](CodeInsights.slnx) regroupe l'API et ses checks ; [Directory.Build.props](Directory.Build.props) centralise .NET 10 et les versions des dépendances. Depuis la racine :

```powershell
dotnet build CodeInsights.slnx -c Release
dotnet run --project tests/CodeInsights.Checks -c Release
```

Les checks sont un programme console à assertions. Les contrôles PostgreSQL et HTTP nécessitent une base isolée et les variables décrites dans le [guide de validation](docs/validation.md). Une exécution sans ces variables ne valide pas le serveur ou la persistance.
