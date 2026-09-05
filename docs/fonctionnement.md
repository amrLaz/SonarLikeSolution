---
title: Fonctionnement et écarts du hub
description: Capacités observées dans le code, limites du signal qualité et écarts vers une expérience Sonar.
---

# Fonctionnement et écarts du hub

## Parcours actuel

Un runner de pipeline transmet une analyse associée à un projet, une branche et un commit. L'API enregistre les métriques, évalue un gate et peut publier un retour Azure DevOps. Le frontend présente les projets, analyses, vulnérabilités et courbes d'évolution.

Les preuves ci-dessous portent sur le code local. Une consultation complémentaire de l'application Azure dans Chrome a été effectuée avec la session existante de rôle `regular`, en lecture seule. Elle ne permet pas d'établir que l'image déployée correspond exactement au checkout local. Aucun changement de configuration, publication, appel IA ni test de charge de production n'a été effectué.

## Observations de l'interface en production

| Parcours consulté           | Observation                                                                                                          | Conséquence produit                                                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projects                    | Portefeuille de six projets, compteurs pass/fail, sélection projet/branche ; métriques et nombre d'analyses visibles | Le pilotage existe déjà ; renforcer sa lisibilité et sa fiabilité plutôt que le reconstruire.                                                               |
| Evolution                   | Courbes sécurité, maintenabilité, fiabilité, couverture, duplication et compteurs par projet/branche                 | Vérifier ensuite baseline, comparabilité et alternative tabulaire accessible ; affichage ne prouve pas exactitude.                                          |
| Issues                      | Zéro résultat et message invitant à lancer une pipeline pour le projet sélectionné                                   | Au même moment, l'autre onglet comporte des findings ; expliciter les sources/filtres et unifier le parcours.                                               |
| Vulnerabilities & IOCs      | Findings détaillés, filtres de sévérité, liens Azure DevOps/advisory et action IA visibles                           | Des détections de secrets apparaissent sous « CVEs & Dependencies » : clarifier la classification. Les liens externes et actions IA n'ont pas été exécutés. |
| Quality Gates               | Gate par défaut, seuils et affectations visibles ; champs Create/Save affichés pour le rôle regular                  | Ne pas déduire une autorisation serveur de la visibilité d'un bouton ; aligner les contrôles UI sur les droits effectifs. Aucun enregistrement tenté.       |
| Onboarding / administration | Aucun accès d'administration visible dans cette session regular                                                      | Parcours d'import de dépôts, connexion et première publication non validés live ; à tester avec un compte et un projet dédiés.                              |

Ces observations sont un échantillon de consultation, pas une mesure de capacité ni un audit exhaustif de sécurité/accessibilité. Les incohérences alimentent les critères P0.4 de la roadmap.

## Matrice des capacités

« Existant » signifie implémenté dans le code, « partiel » une capacité incomplète, « absent » aucun chemin correspondant trouvé dans le runtime inspecté, « simulé » un résultat fabriqué au lieu d'une mesure.

| Capacité                          | État et preuve                                                                                                                 | Conséquence et évolution                                                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projets, branches, analyses       | Existant : [modèles](../apps/api/app/models.py), [routes projets](../apps/api/app/routes/projects.py)                          | Conserver cette base ; ajouter propriétaires et périmètres d'accès.                                                                                        |
| Portefeuille, historique, courbes | Partiel : `loadDashboard` et regroupement dans [App.tsx](../apps/web/src/App.tsx)                                              | Historique disponible, mais calcul client sur toutes les analyses ; prévoir synthèses serveur et pagination.                                               |
| Ingestion SARIF et SBOM           | Absent du runtime : `AnalysisRequest` / `create_analysis` dans [analysis.py](../apps/api/app/routes/analysis.py)               | Recevoir des métriques JSON ne constitue pas un import SARIF, CycloneDX ou SPDX. Ajouter des adaptateurs validés et la provenance des rapports.            |
| Scores en absence de mesures      | Corrigé en P0 : les valeurs simulées sont refusées hors validation et les états de mesure font autorité                       | Une mesure absente ou échouée produit un verdict inconnu, jamais une bonne note implicite.                                                                  |
| Nouveau code                      | Indisponible dans le frontend : les simulations ont été retirées de [App.tsx](../apps/web/src/App.tsx)                        | La navigation affiche une explication sans métriques ni verdict de substitution ; une baseline et un diff réels restent à construire.                      |
| Quality gates                     | P0 : instantané persistant des sept conditions configurées, incluant fiabilité et bugs                                        | Le verdict reste reproductible; couverture, duplication et nouveau code ne sont volontairement pas des conditions P0.                                      |
| Findings et SCA                   | Partiel : `get_analysis_vulnerabilities` dans [analysis.py](../apps/api/app/routes/analysis.py)                                | Détails et liens code disponibles ; extraction SCA depuis des messages, sans inventaire SBOM ni identité durable du finding.                               |
| KEV et assistance IA              | Existant : [kev.py](../apps/api/app/routes/kev.py), `ai_fix_suggestion` dans [analysis.py](../apps/api/app/routes/analysis.py) | Enrichissements conditionnés aux données et à la configuration ; ne remplacent pas les mesures ni la revue humaine.                                        |
| Retour PR Azure DevOps            | Partiel : `_post_ado_pr_decoration` et `_post_ado_pr_comment` dans [analysis.py](../apps/api/app/routes/analysis.py)           | Statut et commentaire existent ; vérifier actualisation, lien profond et reprise avant de promettre un parcours PR complet.                                |
| Notifications et audit            | Existant : [notify.py](../apps/api/app/notify.py), [audit_log.py](../apps/api/app/routes/audit_log.py)                         | Les notifications en threads daemon n'offrent pas de livraison durable.                                                                                    |
| Traitement collaboratif           | Absent des [modèles](../apps/api/app/models.py) : assignation, discussion et transitions par finding                           | Ajouter propriétaire, état, réouverture, échéance et liens Azure Boards.                                                                                   |
| Suppression de règles             | Partiel : `suppress_rule` dans [rules.py](../apps/api/app/routes/rules.py)                                                     | Une suppression globale n'est pas une dérogation ciblée et expirante.                                                                                      |
| Identités et autorisations        | P0 : sessions actives, OIDC vérifié, grants organisation/projet et tokens CI limités                                           | Les routes appliquent les droits serveur et filtrent les collections ; voir la [matrice](security-access.md).                                               |

## Lire les scores avec leurs limites

La [refonte de l'interface](interface.md) documente le thème clair, les états de mesure absente, la lecture seule des gates, le tableau d'évolution et les contrôles locaux. Elle modifie le frontend du checkout ; les observations de production ci-dessus restent un instantané antérieur et ne prouvent pas son déploiement.

Sécurité, fiabilité, maintenabilité, couverture et duplication doivent rester des dimensions séparées. Un nombre de findings nul peut signifier absence de détection ou outil non exécuté. Les formules du runner et les valeurs de secours de l'API ne garantissent pas une échelle comparable entre langages et versions d'outils.

L'historique cible doit conserver commit, branche, outils et versions, profil de règles, périmètre analysé, complétude et version du gate/formule. Un changement de méthode doit apparaître comme une rupture de comparabilité ; les anciennes notes ne seront pas réécrites silencieusement.

## Référence Sonar et limites de la comparaison

L'[intégration Azure DevOps de Sonar](https://www.sonarsource.com/integrations/azure/devops/) relie dépôts, analyses de branches et retours PR. Les [quality gates](https://docs.sonarsource.com/sonarqube-server/quality-standards-administration/managing-quality-gates/introduction) expriment une politique de qualité. La cible du hub reprend ces parcours : configuration guidée, signal explicable, nouveau code réel et action depuis la PR.

La parité des moteurs, règles par langage, analyses sémantiques et intégrations IDE n'est pas acquise par l'agrégation des rapports. Les fonctions SBOM/licences constituent aussi une extension propre au hub. Les [lots produit](roadmap.md) distinguent ces ambitions des fonctions déjà disponibles.
