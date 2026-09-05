---
title: Portefeuille et historique P2
description: Tendances comparables, objectifs et conservation des synthèses.
---

# Portefeuille et historique P2

`GET /api/v1/portfolio/history` consulte les analyses accessibles à l'identité,
avec filtres `organization_id`, `team_id` (équipe propriétaire du projet),
`project_key`, `branch`, `from`, `to` et préfixe `commit`. Les bornes de période
sont inclusives en UTC. `latest=true` sélectionne la dernière analyse de chaque
projet/branche dans ce périmètre. Les points restent séparés : aucune moyenne
interprojets ne masque une dimension absente ou une régression.

La pagination stable utilise `limit` (1–100, défaut 50) et `cursor` ;
`next_cursor`, `X-Next-Cursor` et `Link` signalent la suite. Une URL portant ces
filtres est partageable, mais le destinataire doit disposer de ses propres droits.
`GET /api/v1/portfolio/export` exporte la même page en JSON, avec le périmètre,
la date d'export, la version du schéma et les versions de chaque mesure. Un
export complet nécessite de parcourir toutes les pages ; il n'est jamais tronqué
silencieusement.

L'écran Portefeuille fournit les mêmes filtres et les conserve dans l'URL
(`portfolio_*`). Le tableau présente une dimension sélectionnée à la fois,
ses valeurs exactes, son évolution, les versions, la fraîcheur et les objectifs.
Les liens vers les analyses et leur référence conservent les droits habituels.
L'export de l'écran parcourt toutes les pages du filtre appliqué et rassemble
le JSON dans le navigateur ; cet assemblage a pour limite la mémoire du navigateur,
à remplacer par un export serveur en streaming si la charge mesurée le demande.
L'export est interrompu si l'écran est fermé. Les objectifs sont saisissables
uniquement par les administrateurs et les erreurs de sauvegarde restent visibles.

Chaque point expose les dimensions individuellement (`state`, `value`, `delta`,
`trend`), le gate, la complétude, les versions de profil/formule et la fraîcheur.
Le seuil de fraîcheur est explicitement de sept jours ; une date inconnue ou
future produit `unknown`. La comparaison prend le prédécesseur chronologique
immédiat du même projet et de la même branche, même s'il précède la période
consultée. Elle compare des instantanés de branche, pas le diff de nouveau code
PR. Les deux analyses doivent être terminées et complètes, avec les mêmes
identifiants et versions de profil et formule. Sinon `baseline_absent`,
`incomplete`, `version_unknown` ou `version_break` explique l'absence de delta. Une dimension
absente/non mesurée reste sans valeur ; zéro mesuré reste zéro.

`PUT /api/v1/portfolio/objectives` est réservé aux administrateurs et définit un
objectif par projet, branche et dimension : `project_key`, `branch`, `dimension`,
`target`, `profile_id`, `profile_version`, `formula_version`, `due_at`.
Les scores et la couverture sont des minima ; les nombres de problèmes et la
duplication sont des maxima. Les valeurs sont non négatives ; scores et
pourcentages sont bornés à 100. La modification est auditée. L'historique affiche
les objectifs actuellement configurés, pas une reconstitution de leurs versions
passées. Un changement de formule/profil signale `version_break`, une mesure
incomplète `unknown` ; la date cible reste visible indépendamment du résultat.

La rétention automatique legacy supprime les détails et occurrences, conserve
`analysis_records` comme synthèse durable et marque `details_purged`. Identifiant,
commit, branche, mesures, versions et verdict restent consultables après purge.
La rétention P1 conserve déjà ses synthèses ; le portefeuille expose également
son indicateur de purge. Les suppressions explicites administrateur par projet
ou branche restent destructives, contrairement à la rétention automatique.

Les checks exécutables `PortfolioChecks` couvrent zéro/absence, régressions,
ruptures de contrat, objectifs, fraîcheur et, avec `CODEINSIGHTS_TEST_DB` sur une
base locale jetable, conservation de la synthèse et idempotence de la purge.
Le pilote représentatif et les budgets de charge restent à valider ; ce lot
ne constitue pas une acceptation de généralisation.
