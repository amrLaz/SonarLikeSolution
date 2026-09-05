---
title: Ingestion multi-rapports P1
description: Contrat et limites de l'ingestion durable, formats, profils, comparaison Git et retours PR.
---

# Ingestion multi-rapports P1

Le checkout contient le parcours P1 et son client canonique dans le dépôt partagé
`Up.France.ODI.AzurePipelines`. La validation locale couvre l'import et un smoke
de charge ; elle ne remplace ni la campagne A/B/C complète ni le pilote Azure
DevOps et sa branch policy. Le contrat legacy `POST /api/v1/analyses` reste séparé.

## Publier des rapports déjà produits

Le template partagé `platform-publish-reports-tpl.yml` appelle
`DevSecOps/publish_reports.py`, sans scanner ni test supplémentaire. Fournir
URL/token, chemins, formats/versions et producteurs/versions. Déclarer le projet
ou associer son dépôt pour permettre la résolution serveur ; le jeton doit être
autorisé sur ce projet. Affecter un profil publié avant le premier import.

| Appel                                             | Résultat                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/ingestions`                         | Valide le manifeste version 1 et retourne identifiants ingestion/analyse, révision et rapports attendus |
| `PUT /api/v1/ingestions/{id}/reports/{report_id}` | Transfère l'original brut et vérifie longueur et SHA-256                                                |
| `POST /api/v1/ingestions/{id}/finalize`           | Refuse les uploads encore attendus ; met le traitement complet en queue                                 |
| `GET /api/v1/ingestions/{id}`                     | Reçu, état technique, gate, erreurs, rapports, snapshot et lien d'analyse                               |
| `GET /api/v1/ingestions/{id}/reports/{report_id}` | Original autorisé ; HTTP 410 après purge                                                                |
| `GET /api/v1/ingestions/queue`                    | Vue administrateur des jobs par type/état, nombre, plus ancienne création et maximum de tentatives      |

Le manifeste porte `schema_version`, `project_key` optionnel, `repository_url`,
`ci_provider`, `build_id`, `commit_sha`, `branch`, `source_sha`, `target_sha`, le
contexte PR optionnel, les rapports et `git_diff`. Chaque descripteur contient
`report_id`, `format`, `format_version`, `tool`, `tool_version`, `state`,
`size_bytes`, `sha256`. États déclarés : `measured`, `absent`, `failed`,
`not_measured`. Un rapport mesuré doit être non vide ; absence et zéro finding
dans un rapport valide restent distincts. Source exacte :
[IngestionContracts.cs](../apps/api/Contracts/IngestionContracts.cs).

La même identité projet/provider/dépôt/build/commit et le même manifeste
retrouvent le même reçu. Une contribution modifiée crée une révision de la même
analyse, conserve les rapports complémentaires précédents et réutilise les blobs
identiques. Branche et commits source/cible ne peuvent changer entre contributions.
Une révision ancienne terminant après une nouvelle ne remplace pas sa synthèse.

Les limites par défaut sont 100 rapports, 50 MiB par rapport et 250 MiB de contenu
par lot. L'upload utilise des blocs de 64 KiB ; les parseurs bornent profondeur et
volume mais lisent le rapport en mémoire. Limite de 250 000 entrées normalisées
par publication et timeout de parsing de 120 s. XML interdit DTD/résolveur externe ;
les chemins doivent rester relatifs au dépôt. Les archives compressées et les
références externes à télécharger ne font pas partie du contrat.

## Formats, mesures et gouvernance

| Format/version                         | Informations utilisées                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| SARIF 2.1.0                            | Outil, règle, message, niveau original/normalisé, localisation et fingerprint disponible                 |
| Cobertura XML, LCOV texte (`1`, `1.0`) | Lignes exécutables et couvertes, fusion fichier/ligne sans moyenne de pourcentages                       |
| CycloneDX JSON 1.4 à 1.7               | Composants, purl, versions, licences, dépendances et vulnérabilités incluses avec source/date disponible |
| SPDX JSON 2.3                          | Packages, purl, licences déclarées, relations et racines décrites                                        |

Le graphe fourni détermine `root`, `direct`, `transitive` ou `unknown`. Les liens
CVE proviennent exclusivement du rapport CycloneDX : aucun accès à un catalogue
de vulnérabilités ni rafraîchissement distant n'est effectué. Un SPDX 2.3 ou un
SBOM sans vulnérabilité ne démontre pas une absence de CVE ; la mesure reste non
mesurée. La fraîcheur affichable est celle du rapport/import et des dates fournies.

Les profils publiés sont immuables par identifiant/version, avec stack, outils et
dimensions requis, classification explicite des règles, conditions et listes de
licences autorisées/refusées. La décision licence compare les valeurs déclarées :
elle n'évalue pas la logique des expressions SPDX composées. Toute valeur non
couverte exige une revue. Les affectations et exceptions avec motif/expiration
sont administrées par les routes `/api/v1/profiles` et auditées. Profil et
exceptions actives sont figés à la création de l'ingestion (`ProfileSnapshot`,
`ExceptionSnapshot`) ; une reprise ne relit pas des exceptions modifiées entre-temps.
Les exceptions appliquées figurent aussi dans le snapshot du gate.

Le gate porte sur les mesures normalisées du profil (`imports/1`). Une condition
mesurée hors seuil donne `fail`, une information nécessaire absente donne
`unknown`. Un profil sans condition ne donne pas `pass`. Le client termine en
erreur sur échec technique, timeout, état incomplet ou gate `unknown`, même en
mode informatif. Un gate `fail` est informatif par défaut et devient bloquant
avec `failOnQualityGate=true`.

## Traitement durable, comparaison et consultation

PostgreSQL conserve les jobs d'ingestion, ADO, notification et maintenance.
Les workers utilisent `FOR UPDATE SKIP LOCKED`, un bail renouvelé et cinq
tentatives au maximum ; concurrence par processus 2 par défaut, bornée à 1–8.
Un job en cours dont le bail expire est repris. Les erreurs de document invalides
sont terminales ; les erreurs transitoires ont un délai de reprise borné.
Les effets externes sont séparés de l'import et peuvent être livrés plusieurs
fois après une réponse perdue : aucune garantie d'envoi externe exactement une fois.

La maintenance horaire remplace la purge directement attendue au démarrage HTTP.
Les publications non finalisées depuis 24 h deviennent échouées ; les détails P1
de plus de 90 jours sont purgés par lots de 100. Synthèses, snapshots et identités
d'analyse P1 restent conservés. Les blobs partagés sont supprimés quand plus
aucun rapport ne les référence ; les objets orphelins sont nettoyés. Ces tâches
de blobs nécessitent une configuration de stockage.

Le client compare la cible figée au commit réellement analysé, y compris le
commit de merge ADO ; `source_sha` reste le SHA source PR. Il transmet renommages,
lignes ajoutées et correspondance des lignes inchangées. Une comparaison nécessite
une analyse complète du même dépôt au SHA cible, des détails conservés, le même
profil et des producteurs compatibles. Sinon l'API donne une cause `unavailable`.
Le rapprochement conserve `new`, `persistent`, `resolved` et `indeterminate` ;
le résumé détaille au plus 100 findings et indique sa troncature. Il n'invente
pas de nouvelle couverture lorsque les lignes du diff ne sont pas mesurées.

Les routes `/api/v1/insights/analyses`, `/summary` et les détails
`/analyses/{id}/findings`, `/components`, `/comparison` servent l'interface.
`GET /api/v1/analyses` utilise désormais la même liste de synthèses paginée :
`limit` entre 1 et 100, défaut 50, continuation par `Link` et `X-Next-Cursor`.
Les filtres de listes sont projet, branche et période ; les findings ajoutent
catégorie, sévérité, règle et chemin. Les réponses de liste n'embarquent pas les
rapports bruts. Le GET des projets reste un catalogue complet ; une synthèse
limite les projets par page mais peut détailler toutes leurs branches.

## PR Azure DevOps et limites de validation

Le job P1 vérifie association projet/dépôt, configuration d'organisation et PAT,
PR active, SHA source/cible et itération. Le statut est rattaché à cette itération ;
une ancienne analyse ne doit pas approuver un nouveau commit. La finalisation
programme un job `ado-pending` : le statut de l'itération repasse en attente
pendant le traitement, puis reçoit le résultat terminal. Si ce job passe après
la fin de l'import, il utilise l'état terminal courant plutôt que rétablir un
ancien `pending`. Les retries
identiques évitent un nouveau statut et le commentaire marqué est mis à jour.
Un état incomplet ou `unknown` est une erreur ADO. Le mode informatif peut accepter
un `fail` mesuré ; le mode bloquant le refuse. Le lien cible vient de
`Ingestion:PlatformUrl`, pas d'une URL arbitraire du rapport.

Le parcours legacy garde ses retours PR synchrones et ses notifications en
mémoire ; il ne bénéficie pas des garanties de reprise/itération du parcours P1.
La branch policy requise, les droits du PAT, les retours réels et les retries ADO
doivent encore être validés sur un dépôt de test autorisé. Aucun déploiement
Azure ou changement de branch policy n'est attesté par la validation locale.

Le [smoke local](p1-load.md) a réussi 75 publications et 6 064 lectures sans erreur,
avec p95 stable de 1,187 s pour la publication et 0,032 s pour les lectures.
Le client canonique a publié puis rejoué le même lot avec `pass` et identifiants
inchangés. La campagne complète A/B/C, les matrices de taille/densité et les
budgets de capacité restent à exécuter avant généralisation.
