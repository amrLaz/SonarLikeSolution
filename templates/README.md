---
title: Copies locales des templates DevSecOps
description: Rôle et limites des templates présents dans le dossier applicatif.
---

# Copies locales des templates DevSecOps

Le dépôt de diffusion attendu est `Up.France.ODI.AzurePipelines`. Ces fichiers locaux divergent du stage et du runner actuellement présents dans son checkout ; ils ne prouvent ni la publication d'un tag ni la disponibilité des mêmes paramètres chez les consommateurs.

Les paramètres locaux `language_stack`, `trivy_enabled` et `dotnet_analysis_mode` ne sont pas ceux du stage partagé `platform-sast-stage.yml`. Comparer les sources avant tout transfert ; la consolidation et le versionnement unique sont à réaliser selon la [roadmap](../docs/roadmap.md). Voir le [contrat du hub](../docs/integration.md) et `docs/report-integration.md` dans le dépôt partagé.

| Fichier                           | Rôle                                                        |
| --------------------------------- | ----------------------------------------------------------- |
| `ci_platform_scan.py`             | Scanner principal (SAST + SCA + quality gate)               |
| `az-platform-sast-steps-tpl.yml`  | Steps SAST communs — appelé par tous les templates langages |
| `az-platform-sast-dotnet-tpl.yml` | Template SAST .NET                                          |
| `az-platform-sast-react-tpl.yml`  | Template SAST React / TypeScript                            |
| `az-platform-sast-php-tpl.yml`    | Template SAST PHP                                           |
| `az-platform-sast-stage-tpl.yml`  | Stage SAST générique (wrapper)                              |
