---
title: Up.France.CodeInsights
description: Application de consolidation des analyses de code et trajectoire vers un hub multi-rapports sur Azure.
---

# Up.France.CodeInsights

L'application **CodeInsights** consolide les analyses de code de plusieurs projets et expose leurs métriques, quality gates, vulnérabilités et historiques. Sa cible est un hub organisationnel de rapports SARIF, SBOM et couverture, avec une expérience de suivi comparable à SonarQube. **L'import générique de ces formats reste à développer** : l'API actuelle reçoit des métriques et findings dans un contrat propriétaire.

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
