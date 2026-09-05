---
title: Performances et capacité du hub
description: Risques vérifiés, priorités d'optimisation et protocole de charge pour plusieurs centaines de projets.
---

# Performances et capacité du hub

## Limites observées dans le code

| Point                      | Preuve                                                                            | Risque et première action                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Historique complet         | Lecture de la collection dans [AnalysisEndpoints.cs](../apps/api/Endpoints/AnalysisEndpoints.cs) | Taille croissante sans borne ; pagination et projection de synthèse |
| Agrégation navigateur      | `loadDashboard` dans [App.tsx](../apps/web/src/App.tsx)                           | Transfert, parsing et tri de toutes les analyses ; agrégats serveur                                                       |
| Findings JSON texte        | `AnalysisRecord` dans [Entities.cs](../apps/api/Data/Entities.cs) | Lecture d'un bloc volumineux pour une liste ; détails séparés et indexables |
| Effets externes attendus   | [AnalysisExternal.cs](../apps/api/Services/AnalysisExternal.cs) | Latence de publication dépendante d'Azure DevOps ; traitement durable après ingestion |
| Notifications en mémoire  | [NotificationService.cs](../apps/api/Services/NotificationService.cs) | Perte au redémarrage et concurrence non bornée ; file, reprise et limite de débit |
| Pool par processus         | [Program.cs](../apps/api/Program.cs) : pool Npgsql configuré par la chaîne de connexion | Pool distinct par chaîne de connexion et processus ; budgéter chaque réplique |
| Purge au démarrage         | [Program.cs](../apps/api/Program.cs), [RetentionService.cs](../apps/api/Services/RetentionService.cs) | Temps de démarrage et concurrence ; tâche contrôlée hors démarrage web |
| Coût CI                    | Stage et runner du dépôt partagé, décrits dans son `docs/report-integration.md`   | Installations/tests répétés, POST par finding, artefacts trop larges ; réutiliser les rapports et publier par lots bornés |

La configuration Terraform B1/B1ms est un point de départ, **pas une capacité validée pour 20 analyses simultanées ni pour plusieurs centaines de projets**. Le nombre de projets seul ne détermine pas la charge : fréquence, historique, concurrence et densité de findings comptent davantage.

## Ordre des optimisations

1. Instrumenter les durées scan, upload, attente, parsing, normalisation, gate, consultation et notification avec un identifiant de corrélation build/analyse.
2. Borner pages, requêtes et réponses ; séparer synthèses et détails ; mesurer les plans SQL avant d'ajouter des index adaptés aux filtres projet/branche/date/état.
3. Conserver les originaux dans Blob Storage ; découpler ingestion et effets externes ; borner concurrence, taille décompressée, durée de parsing et tentatives.
4. Mettre en place rétention différenciée et migrations contrôlées ; ajuster SKU/pools après mesure. Ajouter un cache seulement pour une lecture répétée dont le coût résiduel est démontré.

Budget SQL : `répliques × processus × plafond du pool + préparation du schéma + réserve exploitation` doit rester inférieur au plafond exploitable PostgreSQL. Le conteneur API démarre un processus .NET ; des chaînes de connexion distinctes peuvent créer des pools supplémentaires. Vérifier le plafond réel sur l'environnement de test ; ajouter une réplique web multiplie les pools, pas la capacité de la base.

Les checks de [validation](validation.md) vérifient le fonctionnement. Le protocole de charge ci-dessous sert à mesurer la capacité.

## Protocole de charge hors production

Ces volumes sont des **jeux de test proposés**, pas la volumétrie constatée de l'organisation. Générer des données fictives et des rapports valides représentatifs dans une base isolée ; ne pas copier des sources ou secrets métier.

| Palier | Projets | Analyses conservées par projet | Rapports par analyse | Publications simultanées | Lecteurs simultanés |
| ------ | ------: | -----------------------------: | -------------------: | -----------------------: | ------------------: |
| A      |     100 |                            100 |                    3 |                        5 |                  10 |
| B      |     300 |                            300 |                    3 |                       20 |                  30 |
| C      |     500 |                            500 |                    5 |                       50 |                  50 |

Pour chaque palier, varier indépendamment taille de rapport (1, 10, 50 Mo), densité (100, 10 000, 100 000 findings) et concentration sur un projet. Ne pas remplir tous les rapports historiques au volume maximal par défaut : comparer une distribution réaliste puis une rafale défavorable. Les rapports au-delà d'une limite configurée doivent être rejetés explicitement ; 50 Mo est un scénario de validation, pas une promesse de prise en charge actuelle.

Après 5 minutes de chauffe, mesurer 30 minutes de charge stable puis une rafale de 5 minutes ; répéter trois fois avec la même configuration et noter les dispersions. Exécuter séparément le chargement à froid. Comparer avant/après sur le même jeu, même image, même région et mêmes SKU. Le runner de charge sera créé dans le lot performance, sans ajouter de dépendance pour la documentation.

## Budgets initiaux à valider

| Mesure                                  | Objectif provisoire                                              |
| --------------------------------------- | ---------------------------------------------------------------- |
| API de synthèse projet/portefeuille     | p95 ≤ 1 s, page bornée, sans rapport brut                        |
| Affichage interactif du portefeuille    | p95 ≤ 2 s sur poste/réseau de test documentés                    |
| Acceptation après transfert du rapport  | p95 ≤ 2 s ; distinguer durée réseau et normalisation             |
| Rapport de 10 Mo jusqu'au gate final    | p95 ≤ 60 s au palier B, pour un format/profil documenté          |
| Erreurs techniques sous charge nominale | < 1 %, aucune perte silencieuse ni doublon                       |
| Reprise après rafale                    | Retard de file résorbé en ≤ 10 min après retour au débit nominal |

Mesurer aussi p50/p99, débit soutenable, backlog/âge maximal, mémoire navigateur/API/worker, CPU, I/O et verrous SQL, connexions, taille des réponses et octets transférés. Publier le coût Azure de la campagne et le coût par analyse ; ne pas extrapoler un tarif ou un SLO de production sans budget approuvé.

## Scénarios de résistance et critères de sortie

- Republier le même lot, puis un rapport complémentaire : ni doublon ni verdict prématuré.
- Arrêter le worker pendant le parsing, rétablir la base et simuler 429/timeouts ADO : reprise bornée et état consultable.
- Envoyer un document invalide, compressé excessivement ou hors limite : rejet explicite sans bloquer les autres projets.
- Purger des détails pendant les consultations : synthèses et décisions collaboratives conservées, latences mesurées.
- Vérifier l'équité entre un gros dépôt et plusieurs petits ; surveiller connexions et mémoire au scale-out.

Le lot est accepté après résultats reproductibles, comparaison aux budgets, explication des dépassements et absence de perte de données. Aucun benchmark n'a été exécuté dans cette intervention documentaire.
