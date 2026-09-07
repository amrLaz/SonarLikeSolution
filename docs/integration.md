---
title: Intégration des analyses et rapports
description: Contrat actuel de publication et parcours durable multi-rapports Azure DevOps.
---

# Intégration des analyses et rapports

## Choisir le bon parcours

Les templates partagés sont versionnés dans **Up.France.ODI.AzurePipelines**. Son document `docs/report-integration.md` fait autorité sur leurs paramètres et sorties ; le README de ce dépôt y mène. Utiliser les paramètres du template partagé.

Trois parcours coexistent dans le dépôt partagé : `platform-sast-stage.yml` orchestre une analyse vers le hub ; `az-devsecops-scan-tpl.yml` produit des JSON et un artefact avec gate local ; les builds .NET/React produisent notamment couverture, SARIF et SBOM selon les étapes activées. Ces derniers ne publient pas automatiquement leurs rapports vers le hub.

Le stage partagé exécute le mode métier `full` du runner canonique. Les findings sont transmis dans la création d'analyse ; aucune publication individuelle vers une route inexistante n'est effectuée.

## Publication directe

La source exacte est [AnalysisRequest](../apps/api/Contracts/AnalysisContracts.cs) et les [routes d'analyse](../apps/api/Endpoints/AnalysisEndpoints.cs) ASP.NET Core 10. La route de création est `POST /api/v1/analyses` ; son corps reste inchangé. La collection `GET /api/v1/analyses` sert désormais des synthèses paginées, avec `limit` (1–100, défaut 50), `Link` et `X-Next-Cursor`. Les détails sont consultés séparément.

| Champ / mécanisme | Contrat actuel                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identité          | `project_key` (au moins 2 caractères), `commit_sha` (au moins 6), `branch` non vide                                                                                             |
| Origine           | `ci_provider` : `azure-devops`, `github-actions` ou `local`                                                                                                                     |
| Détails           | `affected_files` est un dictionnaire de fichiers/findings, pas un document SARIF                                                                                                |
| Contexte PR       | `pr_id`, `pr_repo_id`, `pr_ado_project`, `pr_target_branch`, `pr_ado_org_url`, `platform_url`                                                                                   |
| Complétude        | `measurements` distingue `measured`, `absent`, `failed` et `not_measured`; `tool_executions` conserve le résultat et la version de chaque outil. Zéro est une valeur mesurée.   |
| Profil            | `profile_id`, `profile_version` et `formula_version` doivent correspondre au profil affecté au projet. Les profils P0 version 1 couvrent .NET, React, IaC et le runner partagé. |
| Authentification  | Le Bearer est un token CI actif, non expiré, autorisé pour le projet et doté de `analysis:write`. `analysis:read` et `integration:write` sont séparés.                          |

La publication exige `project_key`, `commit_sha`, `branch`, `ci_provider`, `profile_id`, `profile_version`, `formula_version`, `measurements` et `tool_executions`. Tout champ inconnu est refusé. Le verdict est calculé dans [GateEvaluation](../apps/api/Services/GateEvaluation.cs). La réponse expose `completeness`, `technical_state` et `gate_snapshot`, avec les sept conditions évaluées. Un échec mesuré produit `fail` ; une donnée requise absente ou un outil indisponible produit `unknown` ; seul un jeu complet peut produire `pass`.

[ApiJson.cs](../apps/api/ApiJson.cs) configure les noms JSON `snake_case`. Les booléens sont des valeurs JSON `true`/`false`. Les erreurs utilisent `application/problem+json` et `detail` : 400 pour un corps JSON invalide, 422 pour une validation métier. Les dates sont ISO 8601 UTC. Le catalogue [routes.json](../tests/contracts/routes.json) et les scénarios [CodeInsights.Checks](../tests/CodeInsights.Checks) définissent les checks HTTP.

Le catalogue version 1 attend Semgrep, Trivy et Gitleaks pour les profils `p0-dotnet` et `p0-react`. Le profil `p0-iac` attend Checkov, Trivy et Gitleaks, avec le score sécurité et les vulnérabilités comme dimensions obligatoires. `platform-sast` attend les quatre outils et les sept dimensions du gate. Chaque projet reçoit explicitement un profil et sa version.

## Parcours multi-rapports P1 disponible localement

Le template canonique `platform-publish-reports-tpl.yml` publie les rapports déjà
produits sans réinstaller les scanners ni relancer les tests. Le contexte ADO est
déduit du build ; l'association dépôt/projet et le profil versionné doivent être
configurés côté hub. Le mode `full` du stage partagé reste un parcours de scan.

Le contrat version 1 est `POST /api/v1/ingestions`, suivi des uploads bruts
`PUT /api/v1/ingestions/{id}/reports/{report_id}`, du POST `/finalize` et du GET du
reçu. SARIF 2.1.0, Cobertura, LCOV, CycloneDX JSON 1.4–1.7 et SPDX JSON 2.3 sont
pris en charge. Le manifeste déclare les producteurs attendus, leur état, les
empreintes et le contexte Git. Une absence n'est jamais remplacée par zéro.

Les originaux sont conservés en Blob Storage ; PostgreSQL assure reçu, révisions,
normalisation et jobs durables. La même publication rejouée conserve son identité ;
les contributions complémentaires enrichissent la même analyse. Le gate suit la
finalisation et le traitement, puis les retours ADO/notifications ont leurs propres
jobs. Le client échoue sur `unknown`, échec technique, état incomplet ou timeout.

Voir le [contrat P1 détaillé](p1-ingestion.md) pour les formats, profils,
permissions, limites, états, diff Git, idempotence, pagination et configuration.
Les [routes](../apps/api/Endpoints/IngestionEndpoints.cs) et
[DTO](../apps/api/Contracts/IngestionContracts.cs) sont la source exacte.

## Validation et activation

L'onboarding production des dépôts pilotes et la remise en état après une
réinitialisation de la base passent par la pipeline manuelle
`.azuredevops/provision-sast-projects.yml`. Elle restaure et active le fournisseur
Entra depuis le secret Key Vault `codeinsights-entra-client-secret`, enregistre les projets avec le
profil `platform-sast` version `1`, génère un jeton limité à `analysis:read`,
`analysis:write` et `integration:write`, puis stocke sa valeur dans le secret Key
Vault `codeinsights-ci-token`. Ce dernier scope permet au stage `v1.1.7`
d'enregistrer le lien vers le dépôt et la pipeline avant l'analyse. La valeur
n'est ni affichée ni versionnée. Les pipelines consommatrices y accèdent via le
groupe Key Vault `CodeInsights.Analysis`. Le compte Entra du pilote retrouve son
rôle administrateur et un accès aux trois projets sans suppression de ses
attributions existantes. Cette remise en état n'est appliquée qu'après sa première
reconnexion Entra, lorsque son identité existe de nouveau dans la base.
Lors du premier passage, la valeur Entra est fournie uniquement comme variable
secrète de queue `CodeInsightsEntraClientSecret` ; la connexion de service la
place dans Key Vault pour les exécutions suivantes. Elle ne doit jamais être
ajoutée au YAML, aux logs ou à une variable non secrète.

Le parcours P1 a été exercé localement sur PostgreSQL/Azurite/API .NET : import,
consultation, client canonique et republication idempotente avec gate `pass`.
Le [smoke](p1-load.md) a réussi 75 publications et 6 064 lectures. Il ne valide
pas la capacité A/B/C ni l'ensemble des matrices de rapports.

Le pilote Azure DevOps reste nécessaire : dépôt/organisation autorisés, droits
PAT, statut rattaché à l'itération, commentaire mis à jour et branch policy requise.
Le `POST /analyses` historique reste compatible, mais sa décoration rejoint désormais le même outbox durable que l’ingestion.
Voir les [lots P1 restant à accepter](roadmap.md) et les [budgets](performances.md).

## Cycle explicite, sources et décorations

Le cycle recommandé est `POST /api/v1/analyses/start`, transfert optionnel des sources, puis `POST /api/v1/analyses/{id}/complete` ou `/fail`. `provider_run_id` rend le start idempotent; une complétion identique est rejouable et un résultat terminal différent renvoie 409. Les écritures exigent `analysis:write`.

Les sources portant une issue se déclarent par `POST /api/v1/analyses/{id}/sources`, puis se transfèrent par `PUT .../sources/{source_id}`. Seuls les chemins relatifs sûrs et le texte UTF-8 sont acceptés. `GET /api/v1/issues/{occurrence_id}/prompt` exige une session autorisée et extrait 20 lignes avant/après. Une source absente ou purgée rend le prompt indisponible sans changer le gate.

Azure DevOps utilise le contexte stable `CodeInsights/quality-gate`, nettoie seulement les commentaires des threads gérés écrits par l’identité du PAT testé, republie les issues puis le statut final. GitHub utilise une GitHub App, un Check Run par analyse, `external_id=analysisId`, des annotations déterministes par lots de 50 et `annotations_count` pour reprendre un envoi incertain.
