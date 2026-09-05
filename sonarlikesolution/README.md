---
title: Assets historiques SonarLikeSolution
description: Ancien parcours de distribution des scripts et templates de la plateforme.
---

# Assets historiques SonarLikeSolution

Ce dossier conserve un ancien parcours de distribution des scans. Il n'est pas le point d'entrée retenu pour les nouveaux consommateurs : les templates partagés sont dans le dépôt `Up.France.ODI.AzurePipelines`.

- [Template de stage historique](templates/sast-stage.yml)
- [Runner associé](scripts/ci_platform_scan.py)
- [Exemple consommateur historique](examples/azure-pipelines.consumer.yml)

Ces assets ne prouvent pas leur synchronisation avec le dépôt partagé ni leur déploiement actuel. Ne pas republier automatiquement un nouveau dépôt à partir de ce dossier. La consolidation des copies est une évolution à réaliser ; aucun script ou template n'est supprimé dans le nettoyage documentaire.

Consulter le [contrat d'intégration](../docs/integration.md) et la [roadmap](../docs/roadmap.md) pour le parcours cible.
