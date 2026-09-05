---
title: Fonctionnement et écarts du hub
description: Capacités observées dans le code, limites du signal qualité et écarts vers une expérience Sonar.
---

# Fonctionnement et écarts du hub

## Parcours actuel

Un runner de pipeline transmet une analyse associée à un projet, une branche et un commit. L'API enregistre les métriques, évalue un gate et peut publier un retour Azure DevOps. Le frontend présente les projets, analyses, vulnérabilités et courbes d'évolution.

Les capacités ci-dessous sont établies à partir du code local. Les résultats des tests sont consignés dans [validation.md](validation.md).

## Matrice des capacités

« Existant » signifie implémenté dans le code, « partiel » une capacité incomplète, « absent » aucun chemin correspondant trouvé dans le runtime inspecté, « simulé » un résultat fabriqué au lieu d'une mesure.

| Capacité                          | État et preuve                                                                                                                 | Conséquence et évolution                                                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projets, branches, analyses       | Existant : [modèles](../apps/api/Data/Entities.cs), [routes projets](../apps/api/Endpoints/ProjectEndpoints.cs)                          | Conserver cette base ; ajouter propriétaires et périmètres d'accès.                                                                                        |
| Portefeuille, historique, courbes | Partiel : `loadDashboard` et regroupement dans [App.tsx](../apps/web/src/App.tsx)                                              | Historique disponible, mais calcul client sur toutes les analyses ; prévoir synthèses serveur et pagination.                                               |
| Ingestion SARIF et SBOM           | Absent du runtime : `AnalysisRequest` / `create_analysis` dans [AnalysisEndpoints.cs](../apps/api/Endpoints/AnalysisEndpoints.cs)               | Recevoir des métriques JSON ne constitue pas un import SARIF, CycloneDX ou SPDX. Ajouter des adaptateurs validés et la provenance des rapports.            |
| Scores en absence de mesures      | Corrigé en P0 : les valeurs simulées sont refusées hors validation et les états de mesure font autorité                       | Une mesure absente ou échouée produit un verdict inconnu, jamais une bonne note implicite.                                                                  |
| Nouveau code                      | Indisponible dans le frontend : [App.tsx](../apps/web/src/App.tsx)                        | La navigation affiche une explication sans métriques ni verdict de substitution ; une baseline et un diff réels restent à construire.                      |
| Quality gates                     | P0 : instantané persistant des sept conditions configurées, incluant fiabilité et bugs                                        | Le verdict reste reproductible; couverture, duplication et nouveau code ne sont volontairement pas des conditions P0.                                      |
| Findings et SCA                   | Partiel : `get_analysis_vulnerabilities` dans [AnalysisEndpoints.cs](../apps/api/Endpoints/AnalysisEndpoints.cs)                                | Détails et liens code disponibles ; extraction SCA depuis des messages, sans inventaire SBOM ni identité durable du finding.                               |
| KEV et assistance IA              | Existant : [KevEndpoints.cs](../apps/api/Endpoints/KevEndpoints.cs), `ai_fix_suggestion` dans [AnalysisEndpoints.cs](../apps/api/Endpoints/AnalysisEndpoints.cs) | Enrichissements conditionnés aux données et à la configuration ; ne remplacent pas les mesures ni la revue humaine.                                        |
| Retour PR Azure DevOps            | Partiel : `_post_ado_pr_decoration` et `_post_ado_pr_comment` dans [AnalysisEndpoints.cs](../apps/api/Endpoints/AnalysisEndpoints.cs)           | Statut et commentaire existent ; vérifier actualisation, lien profond et reprise avant de promettre un parcours PR complet.                                |
| Notifications et audit            | Existant : [NotificationService.cs](../apps/api/Services/NotificationService.cs), [AuditEndpoints.cs](../apps/api/Endpoints/AuditEndpoints.cs)                         | Les notifications en tâches internes au processus n'offrent pas de livraison durable.                                                                                    |
| Traitement collaboratif           | Absent des [modèles](../apps/api/Data/Entities.cs) : assignation, discussion et transitions par finding                           | Ajouter propriétaire, état, réouverture, échéance et liens Azure Boards.                                                                                   |
| Suppression de règles             | Partiel : `suppress_rule` dans [RuleEndpoints.cs](../apps/api/Endpoints/RuleEndpoints.cs)                                                     | Une suppression globale n'est pas une dérogation ciblée et expirante.                                                                                      |
| Identités et autorisations        | P0 : sessions actives, OIDC vérifié, grants organisation/projet et tokens CI limités                                           | Les routes appliquent les droits serveur et filtrent les collections ; voir la [matrice](security-access.md).                                               |

## Lire les scores avec leurs limites

La [documentation de l’interface](interface.md) décrit le thème clair, les mesures absentes, la lecture seule des gates, le tableau d’évolution et les contrôles locaux.

Sécurité, fiabilité, maintenabilité, couverture et duplication doivent rester des dimensions séparées. Un nombre de findings nul peut signifier absence de détection ou outil non exécuté. Les formules du runner et les valeurs de secours de l'API ne garantissent pas une échelle comparable entre langages et versions d'outils.

L'historique cible doit conserver commit, branche, outils et versions, profil de règles, périmètre analysé, complétude et version du gate/formule. Un changement de méthode doit apparaître comme une rupture de comparabilité ; chaque résultat doit identifier sa méthode de calcul.

## Référence Sonar et limites de la comparaison

L'[intégration Azure DevOps de Sonar](https://www.sonarsource.com/integrations/azure/devops/) relie dépôts, analyses de branches et retours PR. Les [quality gates](https://docs.sonarsource.com/sonarqube-server/quality-standards-administration/managing-quality-gates/introduction) expriment une politique de qualité. La cible du hub reprend ces parcours : configuration guidée, signal explicable, nouveau code réel et action depuis la PR.

La parité des moteurs, règles par langage, analyses sémantiques et intégrations IDE n'est pas acquise par l'agrégation des rapports. Les fonctions SBOM/licences constituent aussi une extension propre au hub. Les [lots produit](roadmap.md) distinguent ces ambitions des fonctions déjà disponibles.
