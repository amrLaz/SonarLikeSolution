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

| Capacité                          | État et preuve                                                                                                                                                   | Conséquence et évolution                                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Projets, branches, analyses       | Existant : [modèles](../apps/api/Data/Entities.cs), [routes projets](../apps/api/Endpoints/ProjectEndpoints.cs)                                                  | Conserver cette base ; ajouter propriétaires et périmètres d'accès.                                                         |
| Portefeuille, historique, courbes | P2 : [synthèses conservées et tendances](p2-portfolio.md), objectifs et export                                                                                   | Dimensions séparées, ruptures de profil/formule, complétude et fraîcheur ; capacité globale encore à mesurer.               |
| Ingestion SARIF et SBOM           | P1 : [imports normalisés](../apps/api/Services/ReportImports.cs) et [ingestion durable](p1-ingestion.md)                                                         | SARIF 2.1.0, Cobertura/LCOV, CycloneDX JSON 1.4–1.7 et SPDX JSON 2.3 ; limites et formats invalides explicites.             |
| Scores en absence de mesures      | Corrigé en P0 : les valeurs simulées sont refusées hors validation et les états de mesure font autorité                                                          | Une mesure absente ou échouée produit un verdict inconnu, jamais une bonne note implicite.                                  |
| Nouveau code                      | P1 : comparaison de commits figés dans [IngestionProcessor.cs](../apps/api/Services/IngestionProcessor.cs)                                                       | Nouveaux/persistants/résolus/indéterminés ; baseline absente ou incompatible explicitement indisponible.                    |
| Quality gates                     | P0 conservé ; profils P1 immuables, exceptions figées et conditions tracées                                                                                      | Les dimensions non mesurées ne sont pas inventées ; politiques P1 distinctes des sept conditions historiques.               |
| Findings et SCA                   | P1 : occurrences et composants normalisés, licences et CVE fournies par les rapports ; suivi P2 indépendant                                                      | Pas de recherche CVE externe ; correspondance collaborative conservatrice sans fingerprint unique.                          |
| KEV et assistance IA              | Existant : [KevEndpoints.cs](../apps/api/Endpoints/KevEndpoints.cs), `ai_fix_suggestion` dans [AnalysisEndpoints.cs](../apps/api/Endpoints/AnalysisEndpoints.cs) | Enrichissements conditionnés aux données et à la configuration ; ne remplacent pas les mesures ni la revue humaine.         |
| Retour PR Azure DevOps            | Partiel : `_post_ado_pr_decoration` et `_post_ado_pr_comment` dans [AnalysisEndpoints.cs](../apps/api/Endpoints/AnalysisEndpoints.cs)                            | Statut et commentaire existent ; vérifier actualisation, lien profond et reprise avant de promettre un parcours PR complet. |
| Notifications et audit            | P1 : jobs PostgreSQL ; [audit](../apps/api/Endpoints/AuditEndpoints.cs) conservé                                                                                 | Retours P1 repris au moins une fois ; notifications du parcours historique encore en mémoire.                               |
| Traitement collaboratif           | P2 : [assignation et revue](p2-collaboration.md), [Boards et boîte personnelle](p2-boards.md)                                                                    | Droits serveur, décisions conservées après purge et réconciliation sans double création ; pilote Azure restant.             |
| Suppression de règles             | Partiel : `suppress_rule` dans [RuleEndpoints.cs](../apps/api/Endpoints/RuleEndpoints.cs)                                                                        | Une suppression globale n'est pas une dérogation ciblée et expirante.                                                       |
| Identités et autorisations        | P0 : sessions actives, OIDC vérifié, grants organisation/projet et tokens CI limités                                                                             | Les routes appliquent les droits serveur et filtrent les collections ; voir la [matrice](security-access.md).               |

## Lire les scores avec leurs limites

La [documentation de l’interface](interface.md) décrit le thème clair, les mesures absentes, la lecture seule des gates, le tableau d’évolution et les contrôles locaux.

Sécurité, fiabilité, maintenabilité, couverture et duplication doivent rester des dimensions séparées. Un nombre de findings nul peut signifier absence de détection ou outil non exécuté. Les formules du runner et les valeurs de secours de l'API ne garantissent pas une échelle comparable entre langages et versions d'outils.

L'historique cible doit conserver commit, branche, outils et versions, profil de règles, périmètre analysé, complétude et version du gate/formule. Un changement de méthode doit apparaître comme une rupture de comparabilité ; chaque résultat doit identifier sa méthode de calcul.

## Référence Sonar et limites de la comparaison

L'[intégration Azure DevOps de Sonar](https://www.sonarsource.com/integrations/azure/devops/) relie dépôts, analyses de branches et retours PR. Les [quality gates](https://docs.sonarsource.com/sonarqube-server/quality-standards-administration/managing-quality-gates/introduction) expriment une politique de qualité. La cible du hub reprend ces parcours : configuration guidée, signal explicable, nouveau code réel et action depuis la PR.

La parité des moteurs, règles par langage, analyses sémantiques et intégrations IDE n'est pas acquise par l'agrégation des rapports. Les fonctions SBOM/licences constituent aussi une extension propre au hub. Les [lots produit](roadmap.md) distinguent ces ambitions des fonctions déjà disponibles.
