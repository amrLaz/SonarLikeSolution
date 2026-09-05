---
title: Up.France.CodeInsights
description: Application de consolidation des analyses de code et trajectoire vers un hub multi-rapports sur Azure.
---

# Up.France.CodeInsights

L'application **CodeInsights** consolide les analyses de code de plusieurs projets et expose leurs métriques, quality gates, vulnérabilités et historiques. Sa cible est un hub organisationnel de rapports SARIF, SBOM et couverture, avec une expérience de suivi comparable à SonarQube. **L'import générique de ces formats reste à développer** : l'API actuelle reçoit des métriques et findings dans un contrat propriétaire.

Le runtime est FastAPI / SQLAlchemy / PostgreSQL avec une interface React. Le [Dockerfile](Dockerfile) embarque l'API et le frontend dans une image ; `src/` contient des sources d'analyse et ne constitue pas le runtime de la plateforme.

- [Documentation et audit des capacités](docs/index.md)
- [Intégration des builds](docs/integration.md)
- [Exploitation et développement local](docs/exploitation.md)
- [Roadmap produit priorisée](docs/roadmap.md)
- [Infrastructure Terraform Azure](sast-platform/PLATFORM_SAST.md)

Les noms techniques `sast-platform` et `PLATFORM_*` restent ceux du code. La documentation ne renomme aucune ressource Azure ni aucun paramètre. Les anciennes notes de sessions et recettes de démonstration ont été retirées ;
