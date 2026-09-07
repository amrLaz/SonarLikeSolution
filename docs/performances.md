---
title: Performances et capacité du hub
description: Risques vérifiés, priorités d'optimisation et protocole de charge pour plusieurs centaines de projets.
---

# Performances et capacité du hub

## État implémenté et limites à mesurer

| Surface                | État du checkout P1                                                | Limite résiduelle                                                                                |
| ---------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Historiques d'analyse  | Projections de synthèse paginées et curseurs déterministes         | Tester les filtres/indices sur les volumes A/B/C                                                 |
| Findings et composants | Tables normalisées et détails paginés ; rapports hors des listes   | Mesurer les plans SQL et la densité réelle des rapports                                          |
| Ingestion              | Upload Blob borné et queue PostgreSQL durable avec baux/retries    | JSON en mémoire jusqu'à 50 MiB, 250 000 entrées normalisées par lot ; EF AddRange sans bulk COPY |
| Retours externes       | Jobs durables ADO/notifications pour P1, hors transaction d'import | Livraison externe au moins une fois ; verrous par PR pendant les appels ADO                      |
| Publication directe    | Contrat POST conservé, mesures et gate                             | Décoration synchrone et notifications mémoire distinctes de l'ingestion durable                  |
| Rétention              | Maintenance horaire durable et conservation des synthèses P1       | Lots de 100 détails ; mesurer retard de purge et scan des objets orphelins                       |
| Coût CI                | Client publication seule disponible ; artefacts producteurs isolés | Ancien stage full reste coûteux ; ne pas superposer deux parcours par défaut                     |

Les sources sont les [routes de consultation](../apps/api/Endpoints/InsightEndpoints.cs),
le [worker](../apps/api/Services/IngestionWorker.cs), le
[processeur](../apps/api/Services/IngestionProcessor.cs).
Une borne de requête ne prouve pas à elle seule un
SLO sous concurrence.

La configuration Terraform B1/B1ms est un point de départ, **pas une capacité validée pour 20 analyses simultanées ni pour plusieurs centaines de projets**. Le nombre de projets seul ne détermine pas la charge : fréquence, historique, concurrence et densité de findings comptent davantage.

## Mesures et optimisations restantes

1. Compléter les mesures de parsing/normalisation/SQL et livraison externe ; corréler build, ingestion, révision et analyse aux durées client déjà journalisées.
2. Vérifier plans SQL et indices sur les filtres projet/branche/date/état ; mesurer aussi catalogue projets et projets possédant beaucoup de branches.
3. Mesurer uploads, consommation mémoire des parseurs et cadence de la queue avec le plafond 50 MiB/rapport et 250 MiB/lot ; évaluer bulk COPY seulement si le coût EF mesuré le justifie.
4. Vérifier purge, reprises de baux et effets externes sous panne ; dimensionner SKU/pools à partir des mesures, avant tout cache supplémentaire.

Budget SQL : `répliques × processus × plafond du pool + préparation du schéma + réserve exploitation` doit rester inférieur au plafond exploitable PostgreSQL. Le conteneur API démarre un processus .NET ; des chaînes de connexion distinctes peuvent créer des pools supplémentaires. Vérifier le plafond réel sur l'environnement de test ; ajouter une réplique web multiplie les pools, pas la capacité de la base.

Les checks de [validation](validation.md) vérifient le fonctionnement. Le protocole de charge ci-dessous sert à mesurer la capacité.

## Protocole de charge hors production

Ces volumes sont des **jeux de test proposés**, pas la volumétrie constatée de l'organisation. Générer des données fictives et des rapports valides représentatifs dans une base isolée ; ne pas copier des sources ou secrets métier.

| Palier | Projets | Analyses conservées par projet | Rapports par analyse | Publications simultanées | Lecteurs simultanés |
| ------ | ------: | -----------------------------: | -------------------: | -----------------------: | ------------------: |
| A      |     100 |                            100 |                    3 |                        5 |                  10 |
| B      |     300 |                            300 |                    3 |                       20 |                  30 |
| C      |     500 |                            500 |                    5 |                       50 |                  50 |

Pour chaque palier, varier indépendamment taille de rapport (1, 10, 50 Mo), densité (100, 10 000, 100 000 findings) et concentration sur un projet. Ne pas remplir tous les rapports historiques au volume maximal par défaut : comparer une distribution réaliste puis une rafale défavorable. Les rapports au-delà d'une limite configurée doivent être rejetés explicitement ; le contrat accepte au maximum 50 MiB par rapport, sous réserve des bornes de parsing et du total de 250 MiB par lot. Une taille acceptée ne préjuge pas de sa latence.

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

Le lot sera accepté après campagne complète reproductible, comparaison aux budgets,
explication des dépassements et absence de perte de données. Le smoke local
(PostgreSQL/Azurite/API .NET) a réussi 75 publications et 6 064 lectures : p95 stable
publication 1,187 s, lecture 0,032 s. Il emploie 2 projets, 2 synthèses historiques
par projet, 3 rapports de 4 096 octets et 10 findings par rapport. Il ne valide
aucun palier A/B/C.

**La campagne A/B/C standard n'a pas été exécutée**, ni la matrice complète de
formats/tailles/densités, ni la campagne de résilience distante. Les chiffres du
smoke ne justifient aucune extrapolation de SKU, de coût ou de capacité Azure.
