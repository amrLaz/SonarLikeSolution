---
title: Extraction de Up.France.CodeInsights
description: Périmètre du dépôt autonome, préservation des fichiers et raccordement futur à Azure DevOps.
---

# Extraction de Up.France.CodeInsights

## Périmètre local

Le 5 septembre 2026, le contenu de `devops-governance/app/` est repris à la racine de `D:\Work\repos\Up.France.CodeInsights`. Le module `sast-platform/` et la pipeline `.azuredevops/deploy-sast-platform.yml` suivent l'application. Le nouveau dépôt Git utilise `master`, sans reprise d'historique ni commit initial. L'historique antérieur reste dans `devops-governance`. L'extraction n'effectue aucun push ; un remote `origin` vers `Up.France.ODI/Up.France.CodeInsights`, ajouté pendant l'opération en dehors du transfert, est constaté au contrôle final et conservé.

Le transfert reprend l'état disque, y compris fichiers non suivis et ignorés : 447 fichiers ont été comparés par SHA-256 avant adaptation. Caches, rapports générés, fichiers d'environnement et états Terraform restent locaux et exclus du suivi Git. Le verrou fournisseur `.terraform.lock.hcl` et les configurations Terraform versionnées sont conservés.

Les originaux ont ensuite été déplacés hors du dépôt source vers une sauvegarde temporaire, après une nouvelle vérification des 447 empreintes. Le contrôle automatique ayant refusé la suppression récursive, cette sauvegarde conserve une possibilité de récupération. Pour cette exécution, manifeste et sauvegarde se trouvent dans `C:\Users\fazza\AppData\Local\Temp\codeinsights-extraction-20260905-110207` (`manifest.csv` et `originals/`).

Les dashboards FinOps, policies Azure, scripts de gouvernance et pipelines de nettoyage restent dans le dépôt source. Le runner canonique et ses templates restent dans `Up.France.ODI.AzurePipelines` ; leurs copies historiques locales sont conservées avec les exemples et parcours alternatifs de l'application.

Le [workflow GitHub historique](../deploy/legacy/github/deploy-platform.yml) est archivé hors de `.github/workflows/` pour rester inactif. [Azure DevOps](../.azuredevops/deploy-sast-platform.yml) reste le parcours de livraison de référence. Son contexte Docker est désormais la racine du dépôt ; ses filtres suivent les nouveaux chemins.

## Identité et compatibilité

Le nom **CodeInsights** est affiché dans l'interface, le titre navigateur, la documentation API, les rapports PDF et les notifications. Il devient le nom d'instance par défaut ; les réglages déjà persistés restent inchangés. Le dépôt et son dossier conservent le nom `Up.France.CodeInsights`. Le design, les contrats API, les variables `PLATFORM_*`, les clés de session et les noms techniques Azure sont conservés.

L'image déployée reste `sast-platform`. Aucun renommage de ressource, changement de connexion de service ou migration de base n'accompagne l'extraction. Le backend conserve son conteneur `sast-platform-devops-governance` et sa clé `sast-platform-production.tfstate` ; ne pas en créer un nouveau à cause du nom du dépôt.

## Raccordement Azure DevOps ultérieur

Ces étapes ne sont pas exécutées par l'extraction locale :

1. Vérifier l'existence du dépôt distant `Up.France.CodeInsights` dans le projet Azure DevOps `Up.France.ODI` et l'URL du remote déjà configuré, puis publier un premier commit après revue des fichiers à versionner. Créer le dépôt distant seulement s'il n'existe pas encore.
2. Reconfigurer les définitions de pipelines sur le nouveau dépôt et la branche `master` : `.azuredevops/deploy-sast-platform.yml` pour l'image et `sast-platform/ci/azure-pipelines.yml` pour Terraform. Désactiver le déclenchement des anciennes définitions lors du basculement afin d'éviter les livraisons concurrentes.
3. Vérifier les autorisations existantes sur la connexion `Subscription Fabrik`, l'environnement `sast-prod` et le dépôt de templates `Up.France.ODI.AzurePipelines`. Conserver le tag de template déjà configuré.
4. Réutiliser le backend Terraform existant avec sa configuration de production. Examiner le plan avant toute application ; l'extraction ne doit pas recréer les ressources.
5. Après un déploiement autorisé, vérifier HTTP et les parcours applicatifs. La validation locale ci-dessous ne vaut pas validation de déploiement.

## Validation locale

| Contrôle | Résultat le 5 septembre 2026 |
| --- | --- |
| Intégrité du transfert | 447 fichiers comparés avant adaptation ; sources revérifiées avant déplacement et sauvegarde revérifiée après déplacement |
| Image complète | `docker build -t codeinsights:local .` réussi avec les libellés CodeInsights définitifs |
| Frontend | Stage `web-builder`, `npx tsc --noEmit` et `node src/metric-display.check.mjs` réussis |
| Python | 62 tests réussis dans un conteneur de l'image applicative, sources montées en lecture seule, sans démarrage de l'API ; couverture configurée sur le scanner historique : 10 % |
| Compose | `docker compose config --quiet` réussi ; le lancement complet du Compose alternatif n'est pas validé |
| Terraform | `init -backend=false -input=false -lockfile=readonly` avec `TF_DATA_DIR` temporaire, `fmt -check -recursive` et `validate` réussis ; aucun plan/apply ni accès au backend |
| Application démarrée | Migration et démarrage sur PostgreSQL 16 éphémère ; `/api/v1/health` répond 200, OpenAPI annonce `CodeInsights API`, connexion locale réussie |
| Navigateur intégré | Connexion, écran de déconnexion et bandeau vérifiés ; nom CodeInsights visible à 390, 768 et 1440 px, sans débordement horizontal global |
| Documentation et revue | Liens locaux de 16 documents vérifiés ; revue indépendante sans anomalie bloquante, contrats et ressources conservés |

Deux limites préexistantes sont confirmées : le healthcheck de l'image vise `/health` et reçoit 404 alors que `/api/v1/health` répond 200 ; Terraform avertit que `enable_rbac_authorization` est déprécié au profit de `rbac_authorization_enabled`. Elles ne sont pas corrigées par cette extraction. Les scripts du skill AGENTS ont aussi été lancés : la vérification de commandes ignore les entrées Markdown qu'elle parse mal et les outils Python absents de Windows ; les commandes de build et tests ont été vérifiées directement via Docker.

Les essais locaux ne valident ni un déploiement Azure, ni une connexion Entra, ni l'envoi réel de notifications.
