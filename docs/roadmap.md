---
title: Roadmap produit du hub
description: Fonctionnalités priorisées, dépendances et critères d'acceptation pour une expérience de qualité organisationnelle sur Azure DevOps.
---

# Roadmap produit du hub

## Ambition et ordre de livraison

Offrir aux développeurs un résultat actionnable dans leur PR, aux équipes qualité/sécurité un traitement partagé des problèmes et aux responsables une progression fiable de leurs projets. La cible porte sur quelques centaines de projets et agrège les moteurs existants. Elle ne consiste pas à réécrire les analyseurs SonarQube.

Les fonctions ci-dessous sont **à réaliser ou à compléter**, selon la [matrice de l'existant](fonctionnement.md). Les efforts sont relatifs : S = changement ciblé, M = plusieurs parcours/composants, L = lot transversal. Ils ne constituent pas un engagement calendaire.

Ordre : P0 confiance → P1 ingestion et performances → P1 intégration/PR → P2 collaboration et pilotage. L'instrumentation commence dès P0. Les profils de règles et la complétude doivent être définis avant d'utiliser un score pour bloquer un build.

## P0 — Rétablir la confiance dans les accès et les résultats

**État du checkout : implémenté et validé localement.** L'activation nécessite des organisations, projets, utilisateurs et tokens configurés, puis un pilote Azure DevOps .NET/React/IaC. Le gate demeure informatif pendant ce pilote.

| Fonctionnalité / valeur                                       | Dépendances et effort                        | Risque à traiter                                                    | Acceptation                                                                                                                                                           |
| ------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0.1 Authentification effective et droits organisation/projet | Inventaire des routes et consommateurs ; L   | Droits incorrects, fuite entre projets                | Sans identité ou avec token d'un autre projet : accès refusé ; comptes locaux/Entra et CI validés séparément ; aucun secret d'initialisation dans les logs.           |
| P0.2 Mesures réelles et complétude                            | Catalogue des outils attendus par profil ; M | Faux vert quand un scanner échoue ou manque                         | Aucun IOC fictif ni score simulé dans un run métier ; états absent/échoué/non mesuré/zéro distincts dans API, UI et gate.                                             |
| P0.3 Verdict traçable                                         | P0.2 ; M                                     | Valeurs affichées différentes des conditions effectivement évaluées | Chaque échec donne condition, mesure, seuil et provenance ; même analyse produit le même verdict ; règles/formules versionnées.                                       |
| P0.4 Cohérence des écrans                                     | P0.2 ; M                                     | Parcours Issues vide malgré des findings et catégories trompeuses   | Pour une analyse et des filtres identiques, listes/compteurs expliquent leur périmètre ; secrets séparés des CVE ; options non autorisées clairement non modifiables. |

Le mode `full-test` du runner partagé doit rester réservé à un environnement et un projet de validation isolés. Les tokens des producteurs exigent des scopes et projets explicites.

## P1 — Intégrer les rapports sans alourdir les builds

| Fonctionnalité / valeur                         | Dépendances et effort                                | Risque à traiter                                                 | Acceptation                                                                                                                                                         |
| ----------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1.1 Publication universelle et onboarding      | P0.1/P0.2, contrat [intégration](integration.md) ; L | Copies divergentes et paramètres impossibles à reproduire        | Une connexion et des chemins de rapports suffisent ; contexte ADO déduit ; exemple versionné et diagnostic du premier import ; aucun second test/scan implicite.    |
| P1.2 Import SARIF et couverture                 | P1.1, catalogue formats/versions ; L                 | Perte de localisation, confusion entre outils et niveaux         | Jeux de référence valides importés avec règles, fichiers/lignes et provenance ; rejet explicite des formats invalides ; couverture absente distincte de zéro.       |
| P1.3 SBOM CycloneDX/SPDX                        | Socle P1.2 ; L                                       | Composants homonymes, licences ambiguës, vulnérabilités périmées | Inventaire versionné de composants directs/transitifs et licences ; lien composant/CVE/projet ; provenance et fraîcheur visibles ; politique de licence explicable. |
| P1.4 Ingestion durable et consultations bornées | P0, instrumentation ; L                              | Doublons, mémoire non bornée, perte au redémarrage               | Rapports bruts conservés, retries idempotents, queue observable ; pagination et synthèses serveur ; campagne [performance](performances.md) reproductible.          |
| P1.5 Profils et gouvernance des règles          | P0.3, formats normalisés ; M                         | Comparaison trompeuse entre stacks                               | Profils versionnés par stack et projet, exceptions explicites ; audit de changement ; afficher quand un outil ne mesure pas une dimension.                          |

Le lot P1.4 est un prérequis de généralisation, pas une optimisation après livraison. Le client partagé est la source canonique.

## P1 — Faire de la PR le point d'action

| Fonctionnalité / valeur     | Dépendances et effort                                    | Risque à traiter                                                              | Acceptation                                                                                                                                                       |
| --------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1.6 Nouveau code réel      | P1.2/P1.5, baseline branche cible et métadonnées Git ; L | Nouveau code fabriqué, renames/shallow clone mal interprétés                  | Findings nouveaux/résolus/persistants issus du diff ; baseline absente explicitée ; aucun calcul pseudo-aléatoire ; comparaison reproductible entre deux commits. |
| P1.7 Gate PR et retours ADO | P1.4/P1.6 ; M                                            | Verdict d'un ancien commit, commentaires multiples, fusion malgré gate requis | Statut rattaché au bon commit ; mise à jour sans doublon ; détails des nouveaux problèmes ; validation de la branch policy sur un dépôt de test.                  |

La politique distingue échec technique et non-respect qualité. Une attente dépassée ne signifie jamais réussite. Le mode informatif précède l'activation bloquante ; la politique de blocage est décidée par les responsables du projet avant généralisation.

## P2 — Collaborer et piloter la progression

| Fonctionnalité / valeur                    | Dépendances et effort                   | Risque à traiter                                            | Acceptation                                                                                                                                                              |
| ------------------------------------------ | --------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P2.1 Propriétaires, équipes et assignation | P0.1, identité finding durable P1.2 ; M | Attribution perdue au scan suivant                          | Assignation conservée entre analyses, filtres « mes problèmes » et équipe, droits serveur testés.                                                                        |
| P2.2 Cycle de vie et revue                 | P2.1 ; L                                | Faux positif global ou suppression définitive non justifiée | Commentaires, états et réouverture auditables ; exception par périmètre avec motif/expiration ; revue distincte des hotspots ; décisions conservées après purge.         |
| P2.3 Azure Boards et notifications ciblées | P2.2, livraison durable P1.4 ; M        | Tickets/commentaires dupliqués, bruit de notifications      | Work Item lié au finding et synchronisation traçable ; abonnement ciblé sur changement significatif ; reprise sans doublon.                                              |
| P2.4 Portefeuille et tendances comparables | P0.3/P1.4/P1.6 ; L                      | Score moyen masque un projet critique ou une mesure absente | Vue organisation/équipe/projet/branche, régressions et objectifs ; dimensions séparées, complétude/fraîcheur et ruptures de formule affichées.                           |
| P2.5 Historique durable et recherche       | P2.4 ; M                                | Purge détruit progression ou liens partagés                 | Synthèses conservées après suppression des rapports détaillés ; navigation période/commit, filtres et liens partageables ; export avec périmètre et version des mesures. |

Les critères UX transversaux comprennent clavier, focus visible, libellés explicites, états de chargement/erreur, tableaux accessibles en alternative aux courbes, et présentation adaptée aux petits écrans. La consultation live confirme des courbes mais ne constitue pas un audit complet d'accessibilité.

## Extension ultérieure

Après validation des lots précédents, évaluer l'intégration IDE, les règles avancées par langage, l'analyse de flux, la corrélation inter-outils, les politiques de risque SBOM et le retraitement sur nouvelles bases de vulnérabilités. Leur intérêt et leur coût doivent être évalués avec les équipes ; une suggestion IA n'est pas un substitut à une analyse déterministe ni à une décision de revue.

## Livraison et critères transversaux

Pour chaque lot : contrat documenté, tests ciblés, pilote sur projets représentatifs (.NET, React et IaC), puis déploiement progressif via Azure DevOps et Terraform. Chaque capacité est activée après validation du pilote.

La validation couvre notamment : import répété, rapports complémentaires d'un build, scanner absent, format invalide, accès interprojets refusé, redémarrage worker, 429/timeout ADO, conservation des rapports après gate échoué, progression réelle et rétention. Les budgets et paliers sont définis dans [performances](performances.md). Les objectifs de disponibilité, de restauration et le budget Azure seront chiffrés avec l'exploitation à partir des mesures du pilote.
