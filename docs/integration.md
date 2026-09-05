---
title: Intégration des analyses et rapports
description: Contrat actuel de publication et exigences du futur parcours multi-rapports Azure DevOps.
---

# Intégration des analyses et rapports

## Choisir le bon parcours

Les templates partagés sont versionnés dans **Up.France.ODI.AzurePipelines**. Son document `docs/report-integration.md` fait autorité sur leurs paramètres et sorties ; le README de ce dépôt y mène. Utiliser les paramètres du template partagé.

Trois parcours coexistent dans le dépôt partagé : `platform-sast-stage.yml` orchestre une analyse vers le hub ; `az-devsecops-scan-tpl.yml` produit des JSON et un artefact avec gate local ; les builds .NET/React produisent notamment couverture, SARIF et SBOM selon les étapes activées. Ces derniers ne publient pas automatiquement leurs rapports vers le hub.


Le stage partagé exécute le mode métier `full` du runner canonique. Les findings sont transmis dans la création d'analyse ; aucune publication individuelle vers une route inexistante n'est effectuée.

## Contrat disponible

La source exacte est [AnalysisRequest](../apps/api/Contracts/AnalysisContracts.cs) et les [routes d'analyse](../apps/api/Endpoints/AnalysisEndpoints.cs) ASP.NET Core 10. La route de création est `POST /api/v1/analyses` ; la collection est consultable en `GET /api/v1/analyses`.

| Champ / mécanisme | Contrat actuel                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identité          | `project_key` (au moins 2 caractères), `commit_sha` (au moins 6), `branch` non vide                                                                                             |
| Origine           | `ci_provider` : `azure-devops`, `github-actions` ou `local`                                                                                                                     |
| Détails           | `affected_files` est un dictionnaire de fichiers/findings, pas un document SARIF                                                                                                |
| Contexte PR       | `pr_id`, `pr_repo_id`, `pr_ado_project`, `pr_target_branch`, `pr_ado_org_url`, `platform_url`                                                                          |
| Complétude        | `measurements` distingue `measured`, `absent`, `failed` et `not_measured`; `tool_executions` conserve le résultat et la version de chaque outil. Zéro est une valeur mesurée.   |
| Profil            | `profile_id`, `profile_version` et `formula_version` doivent correspondre au profil affecté au projet. Les profils P0 version 1 couvrent .NET, React, IaC et le runner partagé. |
| Authentification  | Le Bearer est un token CI actif, non expiré, autorisé pour le projet et doté de `analysis:write`. `analysis:read` et `integration:write` sont séparés.                          |

La publication exige `project_key`, `commit_sha`, `branch`, `ci_provider`, `profile_id`, `profile_version`, `formula_version`, `measurements` et `tool_executions`. Tout champ inconnu est refusé. Le verdict est calculé dans [GateEvaluation](../apps/api/Services/GateEvaluation.cs). La réponse expose `completeness`, `technical_state` et `gate_snapshot`, avec les sept conditions évaluées. Un échec mesuré produit `fail` ; une donnée requise absente ou un outil indisponible produit `unknown` ; seul un jeu complet peut produire `pass`.

[ApiJson.cs](../apps/api/ApiJson.cs) configure les noms JSON `snake_case`. Les booléens sont des valeurs JSON `true`/`false`. Les erreurs utilisent `application/problem+json` et `detail` : 400 pour un corps JSON invalide, 422 pour une validation métier. Les dates sont ISO 8601 UTC. Le catalogue [routes.json](../tests/contracts/routes.json) et les scénarios [CodeInsights.Checks](../tests/CodeInsights.Checks) définissent les checks HTTP.

Le catalogue version 1 attend Semgrep, Trivy et Gitleaks pour les profils `p0-dotnet` et `p0-react`. Le profil `p0-iac` attend Checkov, Trivy et Gitleaks, avec le score sécurité et les vulnérabilités comme dimensions obligatoires. `platform-sast` attend les quatre outils et les sept dimensions du gate. Chaque projet reçoit explicitement un profil et sa version.

## Parcours cible à développer

L'équipe projet choisit sa connexion au hub et ses chemins de rapports ; le template déduit dépôt, build, commit, branche et PR d'Azure DevOps. Il consomme les fichiers déjà produits, sans réinstaller tous les scanners ni relancer les tests. Un scan supplémentaire reste explicite lorsqu'aucun producteur ne couvre le besoin.

Le parcours se termine par un lien d'analyse et un état distinct : accepté pour traitement, terminé, incomplet ou en échec. Le gate s'applique après finalisation des rapports attendus. L'artefact de diagnostic reste disponible même si le gate échoue.

## Contrats futurs, sans endpoint promis

| Interface à ajouter           | Exigences minimales                                                                                                                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Publication versionnée        | Contexte organisation/projet/dépôt/build/commit/branche/PR ; manifeste de rapports avec format/version, producteur/version, taille, empreinte et résultat d'exécution de l'outil                                  |
| Import de rapports            | SARIF, CycloneDX, SPDX puis couverture selon les versions explicitement supportées ; validation des tailles et chemins, diagnostic de rejet ; aucune résolution distante automatique de références non approuvées |
| Suivi d'ingestion             | Identifiant stable, état et progression, rapports reçus/attendus, erreurs par rapport, verdict final et lien UI ; attente du gate bornée côté CI                                                                  |
| Idempotence et enrichissement | Même publication rejouée sans doublon ; plusieurs outils d'un même build rattachés à la même analyse ; rapport corrigé traité comme révision traçable                                                             |
| Consultation                  | Listes paginées, filtres serveur, synthèses sans contenus bruts ; ordre déterministe et bornes de page                                                                                                            |
| Finding durable               | Identité stable et provenance par outil, occurrences par analyse, première/dernière observation, état et décisions collaboratives ; éviter de fusionner des problèmes différents                                  |
| Retour Azure DevOps           | Statut/commentaire actualisé après finalisation, limité au bon dépôt/commit/PR ; reprise sans multiplication de commentaires                                                                                      |

Le nom exact des nouvelles routes sera défini lors de l'implémentation. Publier une version unique du client/template pour les consommateurs.

## Acceptation du parcours

- Un build existant publie ses rapports sans nouvelle exécution de ses tests/scanners.
- Un upload répété ne crée pas de doublon ; deux outils complètent une analyse commune.
- Rapport invalide, format non supporté, outil absent et mesure zéro restent distinguables.
- Le token d'un autre projet est refusé ; l'identité de pipeline ne donne pas accès à l'administration.
- Après timeout, réponse 429 ou arrêt worker, la publication reprend sans perte ni faux succès.
- Une PR reçoit le verdict du bon commit ; un échec de gate conserve rapports et explication.

Voir les [lots P0/P1](roadmap.md) et le [protocole de charge](performances.md).
