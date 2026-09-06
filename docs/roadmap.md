---
title: Roadmap produit du hub
description: Fonctionnalités priorisées, dépendances et critères d'acceptation pour une expérience de qualité organisationnelle sur Azure DevOps.
---

# Roadmap produit du hub

## Ambition et ordre de livraison

Offrir aux développeurs un résultat actionnable dans leur PR, aux équipes qualité/sécurité un traitement partagé des problèmes et aux responsables une progression fiable de leurs projets. La cible porte sur quelques centaines de projets et agrège les moteurs existants. Elle ne consiste pas à réécrire les analyseurs SonarQube.

Les fonctions ci-dessous sont **à réaliser ou à compléter**, selon la [matrice de l'existant](fonctionnement.md). Les efforts sont relatifs : S = changement ciblé, M = plusieurs parcours/composants, L = lot transversal. Ils ne constituent pas un engagement calendaire.

Ordre : P0 confiance → P1 ingestion et performances → P1 intégration/PR → P2 collaboration et pilotage → P3 expérience quotidienne de qualité du code → P4 extensions selon les usages. L'instrumentation commence dès P0. Les profils de règles et la complétude doivent être définis avant d'utiliser un score pour bloquer un build.

## P0 — Rétablir la confiance dans les accès et les résultats

**État du checkout : implémenté et validé localement.** L'activation nécessite des organisations, projets, utilisateurs et tokens configurés, puis un pilote Azure DevOps .NET/React/IaC. Le gate demeure informatif pendant ce pilote.

| Fonctionnalité / valeur                                       | Dépendances et effort                        | Risque à traiter                                                    | Acceptation                                                                                                                                                           |
| ------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0.1 Authentification effective et droits organisation/projet | Inventaire des routes et consommateurs ; L   | Droits incorrects, fuite entre projets                              | Sans identité ou avec token d'un autre projet : accès refusé ; comptes locaux/Entra et CI validés séparément ; aucun secret d'initialisation dans les logs.           |
| P0.2 Mesures réelles et complétude                            | Catalogue des outils attendus par profil ; M | Faux vert quand un scanner échoue ou manque                         | Aucun IOC fictif ni score simulé dans un run métier ; états absent/échoué/non mesuré/zéro distincts dans API, UI et gate.                                             |
| P0.3 Verdict traçable                                         | P0.2 ; M                                     | Valeurs affichées différentes des conditions effectivement évaluées | Chaque échec donne condition, mesure, seuil et provenance ; même analyse produit le même verdict ; règles/formules versionnées.                                       |
| P0.4 Cohérence des écrans                                     | P0.2 ; M                                     | Parcours Issues vide malgré des findings et catégories trompeuses   | Pour une analyse et des filtres identiques, listes/compteurs expliquent leur périmètre ; secrets séparés des CVE ; options non autorisées clairement non modifiables. |

Le mode `full-test` du runner partagé doit rester réservé à un environnement et un projet de validation isolés. Les tokens des producteurs exigent des scopes et projets explicites.

## P1 — Intégrer les rapports sans alourdir les builds

**État du checkout : fonctionnalités P1 implémentées, validation locale en cours de
consolidation ; acceptation de généralisation non acquise.** Le client canonique,
les imports, profils, queue durable, consultations et interface sont disponibles.
Les contrats et limites exactes sont dans [P1 ingestion](p1-ingestion.md).
Le smoke réel et la republication canonique ont réussi ; la campagne A/B/C complète
et le pilote Azure DevOps restent à exécuter. Les critères du tableau sont les
critères de sortie, pas une déclaration de validation intégrale.

| Fonctionnalité / valeur                         | Dépendances et effort                                | Risque à traiter                                                 | Acceptation                                                                                                                                                         |
| ----------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1.1 Publication universelle et onboarding      | P0.1/P0.2, contrat [intégration](integration.md) ; L | Copies divergentes et paramètres impossibles à reproduire        | Une connexion et des chemins de rapports suffisent ; contexte ADO déduit ; exemple versionné et diagnostic du premier import ; aucun second test/scan implicite.    |
| P1.2 Import SARIF et couverture                 | P1.1, catalogue formats/versions ; L                 | Perte de localisation, confusion entre outils et niveaux         | Jeux de référence valides importés avec règles, fichiers/lignes et provenance ; rejet explicite des formats invalides ; couverture absente distincte de zéro.       |
| P1.3 SBOM CycloneDX/SPDX                        | Socle P1.2 ; L                                       | Composants homonymes, licences ambiguës, vulnérabilités périmées | Inventaire versionné de composants directs/transitifs et licences ; lien composant/CVE/projet ; provenance et fraîcheur visibles ; politique de licence explicable. |
| P1.4 Ingestion durable et consultations bornées | P0, instrumentation ; L                              | Doublons, mémoire non bornée, perte au redémarrage               | Rapports bruts conservés, retries idempotents, queue observable ; pagination et synthèses serveur ; campagne [performance](performances.md) reproductible.          |
| P1.5 Profils et gouvernance des règles          | P0.3, formats normalisés ; M                         | Comparaison trompeuse entre stacks                               | Profils versionnés par stack et projet, exceptions explicites ; audit de changement ; afficher quand un outil ne mesure pas une dimension.                          |

Le lot P1.4 est un prérequis de généralisation, pas une optimisation après livraison.
Le client partagé est la source canonique. Le stockage Blob et la queue sont
implémentés ; les budgets de charge restent à valider. P1.3 conserve les CVE et
leur provenance lorsqu'elles sont incluses dans CycloneDX : aucun lookup distant,
aucun zéro CVE déduit d'un SPDX ou d'un SBOM sans données de vulnérabilité.

## P1 — Faire de la PR le point d'action

**État du checkout : comparaison Git et livraison ADO durable implémentées.**
La comparaison utilise les SHA figés, signale baseline absente/incompatible et
conserve les correspondances indéterminées. Les tests locaux ne remplacent pas
le contrôle de l'itération, des permissions et de la branch policy sur un dépôt
Azure DevOps réel ; le lot P1.7 n'est donc pas accepté en production.

| Fonctionnalité / valeur     | Dépendances et effort                                    | Risque à traiter                                                              | Acceptation                                                                                                                                                       |
| --------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1.6 Nouveau code réel      | P1.2/P1.5, baseline branche cible et métadonnées Git ; L | Nouveau code fabriqué, renames/shallow clone mal interprétés                  | Findings nouveaux/résolus/persistants issus du diff ; baseline absente explicitée ; aucun calcul pseudo-aléatoire ; comparaison reproductible entre deux commits. |
| P1.7 Gate PR et retours ADO | P1.4/P1.6 ; M                                            | Verdict d'un ancien commit, commentaires multiples, fusion malgré gate requis | Statut rattaché au bon commit ; mise à jour sans doublon ; détails des nouveaux problèmes ; validation de la branch policy sur un dépôt de test.                  |

La politique distingue échec technique et non-respect qualité. Une attente dépassée ne signifie jamais réussite. Le mode informatif précède l'activation bloquante ; la politique de blocage est décidée par les responsables du projet avant généralisation.

## P2 — Traiter et piloter les issues

**État du checkout : assignation et revue intégrées à Issues et vérifiées localement ; acceptation du pilote non acquise.** [Traitement des issues](p2-collaboration.md) décrit les contrats et limites. La correspondance sans fingerprint reste conservatrice ; les décisions de revue ne changent pas le gate. Aucun déploiement ni pilote Azure n'est déclaré réalisé.

| Fonctionnalité / valeur                    | Dépendances et effort                   | Risque à traiter                                            | Acceptation                                                                                                                                                              |
| ------------------------------------------ | --------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P2.1 Propriétaires, équipes et assignation | P0.1, identité finding durable P1.2 ; M | Attribution perdue au scan suivant                          | Assignation conservée entre analyses, filtres « mes problèmes » et équipe, droits serveur testés.                                                                        |
| P2.2 Cycle de vie et revue                 | P2.1 ; L                                | Faux positif global ou suppression définitive non justifiée | Commentaires, états et réouverture auditables ; exception par périmètre avec motif/expiration ; revue distincte des hotspots ; décisions conservées après purge.         |
| P2.3 Historique projet et recherche        | P0.3/P1.4/P1.6 ; M                      | Purge détruit progression ou liens partagés                 | Synthèses conservées, navigation période/commit, filtres URL et dimensions affichées séparément.                                                                          |

Les critères UX transversaux comprennent clavier, focus visible, libellés explicites, états de chargement/erreur, tableaux accessibles en alternative aux courbes, et présentation adaptée aux petits écrans. La consultation live confirme des courbes mais ne constitue pas un audit complet d'accessibilité.

## Écarts prioritaires vers une expérience SonarQube

**État du checkout au 5 septembre 2026 : P3.1 à P3.8 implémentés.** Le gate nouveau code, l'explorateur au SHA, la couverture détaillée et duplication, les profils exécutables, la remédiation documentée, la revue sécurité, les périmètres versionnés et les correspondances Git sont disponibles. Voir [livraison Azure](p3-deployment.md), [couverture et taille](p3-code-quality.md), [profils](p3-profiles.md) et [périmètres](p3-code-scopes.md). Les critères de pilote organisationnel et de charge restent distincts de la livraison logicielle. P4 reste à décider.

La comparaison porte sur les parcours utiles aux équipes, sans promettre une parité de moteurs, de langages ou d'éditions SonarQube. Les références fonctionnelles sont la distinction [nouveau code / code global](https://docs.sonarsource.com/sonarqube-server/user-guide/about-new-code) et les [mesures de qualité du code](https://docs.sonarsource.com/sonarqube-server/user-guide/code-metrics/metrics-definition) de SonarSource. Elles servent à définir la cible ; les seuils et formules CodeInsights devront être documentés et validés séparément.

| Socle disponible                                                                              | Écart à combler                                                                                                                                                                                                        | Lot       |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Le gate distingue les scopes globaux et nouveau code, avec comparaison préalable.           | [P3.1](p3-new-code.md) est vérifié localement ; le pilote Azure et les politiques réelles restent à accepter. | P3.1 |
| SARIF conserve localisations secondaires, flux et liens documentaires ; liens ADO au SHA analysé. | L'explorateur affiche les fichiers et annotations findings/couverture au SHA. Aucun extrait source n'est stocké. | P3.2 |
| Mesures natives versionnées de couverture, duplication, taille et complexité. | Les dimensions sans producteur restent non mesurées ; remédiation uniquement selon un modèle documenté du producteur. | P3.3/P3.5 |
| Catalogue indépendant et profils exécutables versionnés. | Export natif et empreinte effective ; la CI doit faire consommer cet export par les analyseurs. | P3.4 |
| P2 conserve assignation, exceptions et revue des hotspots. | P3 permet une politique explicite et versionnée, décisions figées pour le prochain verdict et historique conservé. | P3.6 |

## P3 — Qualité du code au quotidien

**Livraison logicielle : P3.1 à P3.8 implémentés ; résultats de validation et de déploiement dans [livraison Azure](p3-deployment.md).** Chaque lot complète P1/P2 et réutilise les producteurs, profils, droits et jobs existants. Les extensions de publication sont optionnelles dans le client canonique ; le contrat direct `POST /api/v1/analyses` reste inchangé.

| Fonctionnalité / valeur                                   | Dépendances et effort                  | Risque à traiter                                                            | Acceptation                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P3.1 Gate distinct sur le nouveau code                    | P1.6/P1.7 ; L                          | Dette historique bloque toute PR, ou baseline inconnue produit un faux vert | Conditions explicitement `global` ou `new_code` ; compteurs et couverture issus du même diff figé ; snapshot avec baseline, numérateur, dénominateur et seuil. Une baseline incompatible donne `unknown` ; aucune ligne exécutable modifiée donne un état non applicable explicite, jamais 100 % inventé. Une PR saine peut passer malgré une dette ancienne selon la politique choisie.                   |
| P3.2 Explorateur de code et preuves contextualisées       | P1.2/P1.4, droits dépôt/projet ; L     | Code d'un autre commit, fuite de sources ou de secrets                      | Arborescence et navigation fichier/ligne au SHA analysé, findings et couverture superposés, lien ADO au même commit. Restituer les localisations secondaires et flux SARIF quand fournis ; afficher leur absence sinon. Commencer par les liens ADO ; tout stockage d'extraits exige droits, masquage des secrets, taille et rétention bornés.                                                             |
| P3.3 Couverture détaillée et duplication réelle           | P1.2, P3.1, producteurs identifiés ; L | Pourcentages agrégés incorrects, duplication déduite des code smells        | Couverture lignes et branches/conditions séparée, totaux par fichier/répertoire et nouveau code ; fusion documentée sans moyenne de pourcentages. Import de blocs dupliqués avec les deux localisations et version du détecteur. Une dimension non produite reste non mesurée et ne satisfait pas un gate.                                                                                                 |
| P3.4 Catalogue complet et profils exécutables par langage | P1.5, client partagé ; L               | Règle affichée active mais jamais exécutée, profil modifié silencieusement  | Catalogue indépendant des occurrences : outil/version, identifiant, langage et paramètres ; explication, conseils de résolution, exemples et références issus du référentiel externe du producteur quand disponibles, avec provenance (voir ci-dessous). Aucun référentiel explicatif rédigé dans CodeInsights. Configuration versionnée des analyseurs déjà utilisés, export consommable par la CI, empreinte de configuration effective jointe au résultat ; dérive signalée. Diff entre versions, retour à une version publiée et impact visible avant affectation. |
| P3.5 Maintenabilité, fiabilité et dette explicables       | P3.3/P3.4 ; M                          | Une note arbitraire paraît équivalente à celle de SonarQube                 | Importer taille et complexité si disponibles ; séparer bugs et code smells par classification versionnée. Effort de remédiation en durée uniquement si une règle fournit un modèle documenté ; le présenter comme estimation. Toute note affiche formule, périmètre et version, sans équivalence Sonar implicite.                                                                                          |
| P3.6 Revue sécurité reliée à une politique de gate        | P2.2, P3.1/P3.4 ; M                    | Faux positif efface un échec passé ou revue manquante vaut approbation      | File de hotspots à revoir avec contexte de règle et priorité ; taux de revue avec dénominateur et périmètre. Option de politique pour les exceptions approuvées et expirantes, snapshot des décisions utilisées à la prochaine évaluation ; aucune réécriture d'un verdict historique. Réapparition, expiration et changement de preuve testés.                                                            |
| P3.7 Branches, versions et périmètres de monorepo         | P1.6, P3.1/P3.4 ; L                    | Baselines ou décisions mélangées entre composants et branches               | Définition versionnée du nouveau code par branche de référence ou analyse de référence, puis version de livraison si nécessaire. Associations dépôt/composant et chemins inclus/exclus explicites ; distinguer sources, tests, généré et tiers. Absence d'historique Git signalée ; vue branche principale/PR, archives et suppression de branches sans perte des décisions conservées.                    |
| P3.8 Identité des problèmes à travers les déplacements    | P2.1/P2.2, P1.6 ; M                    | Assignation perdue ou exception appliquée à un autre problème               | Étendre la correspondance conservatrice avec preuves Git de déplacement/renommage et fingerprints du producteur ; conserver l'historique des correspondances. Cas ambigus laissés à confirmer ; aucun transfert automatique d'une dérogation entre branches sans politique explicite.                                                                                                                      |

### P3.4 — Expliquer et résoudre une issue depuis le référentiel du producteur

Dans le détail d'une issue, proposer « Pourquoi cette issue ? », « Comment la résoudre ? » et « Documentation de la règle » à partir de la documentation existante du linter ou de l'analyseur. Cette capacité fait partie de P3 et ne dépend pas de l'assistance IA P4.4.

- **Source de vérité externe** : privilégier la référence officielle fournie dans le rapport ou les métadonnées de la règle ; à défaut, utiliser le catalogue officiel du producteur si la correspondance outil/identifiant/version est vérifiable. Ne pas déduire une règle à partir du seul texte du message ni fabriquer une URL.
- **Contenu non rédigé dans l'application** : CodeInsights référence ou restitue l'explication, les recommandations et les exemples publiés par le producteur. Aucun texte de référence maintenu manuellement dans le code, en base ou dans un catalogue éditorial interne ; aucune génération IA pour combler une documentation manquante. Une suggestion de correction contextuelle éventuelle reste distincte de cette documentation officielle.
- **Provenance visible** : afficher producteur, identifiant de règle, lien officiel et version documentaire lorsqu'elle est connue. Signaler si la documentation vise une autre version que l'analyseur exécuté. Le message et les preuves propres à l'occurrence restent ceux du rapport d'analyse.
- **Intégration minimale** : commencer par un lien vers la documentation officielle. Une restitution intégrée n'est ajoutée que si le producteur fournit un contenu réutilisable ; respecter ses conditions de réutilisation et assainir le contenu affiché. Un éventuel cache technique est daté et rafraîchissable, conserve sa provenance et ne devient pas un référentiel éditable dans CodeInsights.
- **Absence explicite** : si aucune source fiable n'existe, afficher « Documentation de la règle indisponible » avec l'identifiant et le message d'origine. Si seule l'explication existe, ne pas inventer de solution ; l'indisponibilité de la documentation ne change pas le verdict du gate.

Acceptation : sur une règle documentée du pilote, le développeur accède depuis l'issue à l'explication et aux conseils de correction officiels correspondant à cette règle, par lien ou restitution attribuée. Vérifier aussi une règle inconnue, une documentation sans conseil de résolution, une version différente et un lien indisponible : aucun contenu de remplacement inventé, aucune confusion avec une suggestion IA et aucune incidence sur l'ingestion ou le gate.

### Séquence de livraison recommandée

1. **Accepter le socle existant** : pilote ADO .NET/React/IaC, branch policy, reprise des effets externes et campagne de charge décrits dans P1/P2.
2. **Livrer P3.1**, avec les mesures déjà fiables : un gate compréhensible sur les changements apporte la valeur la plus immédiate sans attendre de nouveaux analyseurs.
3. **Livrer P3.4 et P3.2**, puis P3.3 : savoir quelles règles tournent, comprendre un problème dans son fichier et consulter les preuves de couverture/duplication.
4. **Compléter P3.5 à P3.8** selon les besoins du pilote : dette, revue sécurité, monorepos et continuité des décisions.

Le scénario d'acceptation P3 suit un même problème : une PR introduit un défaut détecté par une règle connue, le développeur ouvre la bonne ligne au bon commit, comprend le refus du gate, corrige et republie ; la PR passe et l'historique conserve les deux résultats. Ajouter les variantes scanner absent, baseline introuvable, déplacement de fichier, dérogation expirée et accès interprojets refusé. Une dette ancienne ne bloque pas une PR saine lorsque seul le nouveau code est soumis au gate.

## P4 — Extensions à décider avec les équipes

Ces lots ne sont pas des prérequis à la première expérience SonarQube-like. Valider leur usage et le coût des moteurs avant de les engager ; réutiliser les intégrations natives des outils existants avant de développer une extension ou un analyseur.

| Fonctionnalité / valeur                               | Dépendances et effort                          | Acceptation / limite                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P4.1 Retour dans l'IDE                                | P3.2/P3.4 ; M à L                              | Fournir d'abord la configuration des outils déjà utilisables dans l'IDE ; mêmes règles/versions qu'en CI, ouverture du fichier et diagnostic de dérive. Ne pas promettre une compatibilité avec le mode connecté SonarQube for IDE sans intégration vérifiée.                                                                      |
| P4.2 Analyse sémantique et flux avancés               | P3.2/P3.4, évaluation des moteurs/licences ; L | Mesurer sur un corpus .NET/React/IaC les vrais/faux positifs et temps de scan ; importer les traces des moteurs retenus. Matrice explicite langage/type d'analyse ; un import SARIF seul ne démontre pas une capacité d'analyse interprocédurale.                                                                                  |
| P4.3 Réévaluation SCA et politiques SBOM              | P1.3/P1.4 ; L                                  | Rafraîchir les CVE sur les SBOM conservés, tracer source/date et version de base, notifier une nouvelle exposition sans rebuild. Évaluer expressions SPDX, versions corrigées et avis VEX avec provenance ; aucun statut « non affecté » déduit sans preuve. Conserver le verdict initial et identifier toute nouvelle évaluation. |
| P4.4 Corrélation inter-outils et aide à la correction | P3.4/P3.8 ; L                                  | Relier les détections d'un même défaut en conservant chaque preuve et producteur ; règles de regroupement auditées, séparation possible, compteurs explicables. Une suggestion IA reste une proposition ; un correctif exige revue et validation par les outils avant toute résolution.                                            |

Une éventuelle vue « application » agrégeant plusieurs dépôts doit prolonger le portefeuille P2 uniquement si les équipes en ont besoin, avec périmètre versionné et sans moyenne qui masque un projet critique.

## Livraison et critères transversaux

Pour chaque lot : contrat documenté, tests ciblés, pilote sur projets représentatifs (.NET, React et IaC), puis déploiement progressif via Azure DevOps et Terraform. Chaque capacité est activée après validation du pilote.

La validation couvre notamment : import répété, rapports complémentaires d'un build, scanner absent, format invalide, accès interprojets refusé, redémarrage worker, 429/timeout ADO, conservation des rapports après gate échoué, progression réelle et rétention. Les budgets et paliers sont définis dans [performances](performances.md). Les objectifs de disponibilité, de restauration et le budget Azure seront chiffrés avec l'exploitation à partir des mesures du pilote.
