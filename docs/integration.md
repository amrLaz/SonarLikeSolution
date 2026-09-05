---
title: Intégration des analyses et rapports
description: Contrat actuel de publication et exigences du futur parcours multi-rapports Azure DevOps.
---

# Intégration des analyses et rapports

## Choisir le bon parcours

Les templates partagés sont versionnés dans **Up.France.ODI.AzurePipelines**. Son document `docs/report-integration.md` fait autorité sur leurs paramètres et sorties ; le README de ce dépôt y mène. Les [copies locales](../templates/README.md) et [SonarLikeSolution](../sonarlikesolution/README.md) restent des parcours historiques et ne garantissent pas le contrat P0. Utiliser les paramètres du template partagé, sans supposer leur équivalence avec ces wrappers locaux.

Trois parcours coexistent dans le dépôt partagé : `platform-sast-stage.yml` orchestre une analyse vers le hub ; `az-devsecops-scan-tpl.yml` produit des JSON et un artefact avec gate local ; les builds .NET/React produisent notamment couverture, SARIF et SBOM selon les étapes activées. Ces derniers ne publient pas automatiquement leurs rapports vers le hub.

Les runners locaux historiques contiennent notamment PHPMD/Psalm et la préparation PHPUnit/PCOV, un traitement spécialisé des diagnostics Roslyn avec `AnalysisMode`, ainsi qu'une génération de couverture Node multi-projets. Ces variantes ne font pas partie du contrat P0 du runner partagé ; leur éventuel transfert nécessite un besoin consommateur et une validation du contrat actuel.

Le stage partagé exécute le mode métier `full` du runner canonique. `full-test` est refusé hors de l'environnement et du projet de validation explicitement configurés. Les findings sont transmis dans la création d'analyse ; aucune publication individuelle vers une route inexistante n'est effectuée.

## Contrat disponible

La source exacte est [AnalysisRequest et les routes d'analyse](../apps/api/app/routes/analysis.py). La route de création est `POST /api/v1/analyses` ; la collection est consultable en `GET /api/v1/analyses`.

| Champ / mécanisme | Contrat actuel                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identité          | `project_key` (au moins 2 caractères), `commit_sha` (au moins 6), `branch` non vide                                                                                             |
| Origine           | `ci_provider` : `azure-devops`, `github-actions` ou `local`                                                                                                                     |
| Mesures           | Champs `reported_*` bornés et facultatifs pour la compatibilité ; une absence reste `null`, jamais zéro. Le bloc `measurements` fait autorité.                                  |
| Détails           | `affected_files` est un dictionnaire de fichiers/findings, pas un document SARIF                                                                                                |
| Contexte PR       | `pr_id`, `pr_repo_id`, `pr_ado_project`, `pr_target_branch`, `pr_ado_org_url`, `reported_platform_url`                                                                          |
| Complétude        | `measurements` distingue `measured`, `absent`, `failed` et `not_measured`; `tool_executions` conserve le résultat et la version de chaque outil. Zéro est une valeur mesurée.   |
| Profil            | `profile_id`, `profile_version` et `formula_version` doivent correspondre au profil affecté au projet. Les profils P0 version 1 couvrent .NET, React, IaC et le runner partagé. |
| Simulation        | Les champs `simulated_*` sont ignorés en métier et refusés hors du couple `PLATFORM_VALIDATION_MODE=true` / `PLATFORM_VALIDATION_PROJECT_KEY`.                                  |
| Authentification  | Le Bearer est un token CI actif, non expiré, autorisé pour le projet et doté de `analysis:write`. `analysis:read` et `integration:write` sont séparés.                          |

Le modèle permet des champs supplémentaires. Cela ne fournit ni versionnement de formats, ni validation SARIF/SBOM, ni garantie d'idempotence. Le verdict est calculé dans `evaluate_quality_gate` ; il faut examiner les mesures reçues et leur complétude avant de l'interpréter.

La réponse conserve les champs historiques et ajoute `completeness`, `technical_state` et `gate_snapshot`. L'instantané contient aussi ces deux états, le profil, sa version, la formule autorisée par le catalogue et les sept conditions évaluées. Un ancien payload reste accepté, avec `legacy_unverified` et un verdict non certifié. Un échec mesuré produit `fail`; sans échec mesuré, une condition requise absente, un outil requis indisponible ou une version de formule inconnue produit `unknown`; seul un jeu complet peut produire `pass`.

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

Le nom exact des nouvelles routes sera défini lors de l'implémentation. Garder le contrat propriétaire pendant une période de migration mesurée, via un adaptateur, puis annoncer sa fin de support après migration des consommateurs. Publier une version unique du client/template plutôt que synchroniser manuellement plusieurs scripts divergents.

## Acceptation du parcours

- Un build existant publie ses rapports sans nouvelle exécution de ses tests/scanners.
- Un upload répété ne crée pas de doublon ; deux outils complètent une analyse commune.
- Rapport invalide, format non supporté, outil absent et mesure zéro restent distinguables.
- Le token d'un autre projet est refusé ; l'identité de pipeline ne donne pas accès à l'administration.
- Après timeout, réponse 429 ou arrêt worker, la publication reprend sans perte ni faux succès.
- Une PR reçoit le verdict du bon commit ; un échec de gate conserve rapports et explication.

Voir les [lots P0/P1](roadmap.md) et le [protocole de charge](performances.md).
