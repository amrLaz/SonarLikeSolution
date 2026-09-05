---
title: Gate sur le nouveau code P3
description: Conditions globales ou limitées au diff Git, preuves de calcul et limites du premier incrément P3.
---

# Gate sur le nouveau code

Le parcours d'ingestion accepte un `scope` par condition de profil : `global`
(défaut compatible avec les profils existants) ou `new_code`. Le contrat legacy
`POST /api/v1/analyses` reste inchangé. L'éditeur de profils permet de publier
une nouvelle version JSON, puis de l'affecter au projet.

```json
{
  "profile_id": "dotnet-pr",
  "version": "2",
  "required_tools": ["scanner"],
  "required_metrics": ["bugs"],
  "rules": [{ "tool": "scanner", "rule_id": "R1", "category": "bug" }],
  "conditions": [{ "metric": "bugs", "operator": "max", "threshold": 0, "scope": "new_code" }]
}
```

Cet exemple utilise une règle fictive de test : l'administrateur doit renseigner
les identifiants réellement produits. Le profil décrit les mesures et le gate ;
il ne configure pas encore l'exécution des analyseurs (reste de P3.4).

Les dimensions disponibles sur le nouveau code sont `bugs`, `code_smells`,
`vulnerabilities`, `security_hotspots` et `coverage`. Les dimensions SBOM restent
globales ; un scope nouveau code est rejeté pour ces dimensions. Les conditions
globales et nouveau code peuvent coexister. Une dette historique n'échoue pas une
condition nouveau code, mais reste soumise à toute condition globale explicite.

La comparaison précède l'évaluation du gate. Elle utilise les SHA du manifeste,
une baseline du même projet et dépôt, des profils identiques et les mêmes
producteurs/versions. L'absence historique du champ `scope` est normalisée en
`global` avant cette comparaison ; elle ne rend pas une ancienne baseline
incompatible à elle seule. Une baseline absente, purgée ou incompatible donne `unknown`.
Un résultat ambigu rend la dimension concernée inconnue. Les compteurs utilisés
par le gate portent sur toutes les occurrences, indépendamment des 100 détails
conservés dans la synthèse de comparaison.

La couverture croise les lignes exécutables reçues et les lignes ajoutées du
diff. Les rapports sont fusionnés par `(chemin, ligne)` avec un OU des hits ;
aucune moyenne de pourcentages. Un fichier modifié absent du corpus de couverture
rend la mesure inconnue. Si le corpus est connu mais aucune ligne exécutable
n'est modifiée, la condition est `not_applicable` avec valeur nulle, numérateur
et dénominateur zéro. Une couverture non produite ne devient jamais non applicable.
Le périmètre reste celui des rapports : le hub ne lit pas les sources pour
certifier que le producteur a couvert toutes les lignes exécutables.

L'instantané conserve scope, mesure, opérateur, seuil, résultat, motif, provenance,
baseline et SHA base/head. Pour la couverture, il conserve numérateur et
dénominateur. Les profils utilisant le nouveau code portent la formule `imports/2` ;
les calculs globaux conservent `imports/1`. Les résultats historiques ne sont pas
réécrits lors d'une correction ou d'une modification de profil.

L'interface **Preuves de calcul** expose ces champs et l'état non applicable.
**New Code** affiche les références et totaux de la comparaison. Les exceptions
de profil P1 restent figées à la publication ; les décisions collaboratives P2
ne participent pas encore au gate (P3.6).

## Validation et périmètre

`NewCodeGateChecks` couvre notamment les comptes au-delà de la troncature,
l'ambiguïté, les scopes invalides, la couverture et les données absentes.
`IngestionChecks` exerce le worker et la persistance via HTTP/PostgreSQL/Azurite :
défaut nouveau refusé, correction acceptée malgré un défaut historique,
baseline absente et conservation du verdict précédent, avec refus interprojets.

Les [preuves SARIF](p3-evidence.md), l'explorateur et les [périmètres](p3-code-scopes.md),
la [couverture et duplication](p3-code-quality.md), les [profils exécutables](p3-profiles.md)
et la [revue sécurité](p3-security-review.md) complètent ce gate. Le pilote
organisationnel et la campagne de charge restent distincts des checks locaux ;
les preuves de livraison sont dans [déploiement P3](p3-deployment.md).
