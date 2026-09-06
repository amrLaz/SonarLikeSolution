---
title: Couverture détaillée, duplication et maintenabilité
description: Formats producteurs, comptages et limites des mesures P3.3 et P3.5.
---

# Couverture détaillée, duplication et maintenabilité

Les rapports complètent le manifeste d'ingestion version 1, sans changement du
POST historique `/api/v1/analyses`. Le hub importe des résultats existants ; il
n'exécute aucun nouveau scanner. Les métadonnées normalisées sont limitées à
250 000 entrées et 50 Mio UTF-8 par ingestion et disparaissent avec ses détails.

## Formats producteurs

| Format / version de l'adaptateur | Production et données conservées                                                                                                                                                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lcov` / `1` ou `1.0`            | `DA` pour les lignes ; `BRDA` pour les branches identifiées par fichier, ligne, bloc et branche. `BRF` doit correspondre aux détails présents.                                                                                                                 |
| `cobertura` / `1` ou `1.0`       | Lignes de classe ; `condition-coverage="50% (1/2)"` conserve les deux entiers, jamais le pourcentage arrondi. `branches-valid`, lorsqu'il existe, doit correspondre aux détails. `class@complexity` fournit une complexité de classe, attribuée au producteur. |
| `jscpd` / `1`                    | JSON natif `jscpd --reporters json ./src` : `duplicates[]`, `firstFile` et `secondFile` avec `name/start/end`, langage, lignes et tokens. Les fragments source sont ignorés. `tool_version` du manifeste est obligatoire.                                      |
| `cloc` / `1`                     | JSON natif `cloc --by-file --json --out=cloc.json src` : entrée par chemin avec `language` et `code`. `header.cloc_version` doit correspondre exactement au `tool_version` du manifeste. Les sorties agrégées par langage ne sont pas acceptées.               |

Les versions `1` de jscpd/cloc identifient l'adaptateur, pas la version du moteur.
Chaque rapport conserve outil, version de l'outil et identifiant du rapport.
Les chemins doivent être relatifs à la racine analysée. Les URI, chemins absolus
et traversées de répertoire sont refusés. Références natives :
[JSON jscpd](https://jscpd.dev/reporters/json) et
[options cloc](https://github.com/AlDanial/cloc).

## Fusion et états

Les lignes sont réunies par fichier/ligne, couvertes si au moins un rapport les
couvre. Les branches LCOV du même producteur/version sont réunies par identité
exacte et couvertes par union des hits positifs. Les numérateurs et dénominateurs
sont ensuite additionnés ; aucune moyenne de pourcentages n'est calculée.

Les conditions Cobertura ne donnent pas l'identité de chaque résultat booléen.
Deux rapports superposés sur une même ligne sont donc `ambiguous`, même avec des
comptages égaux : il est impossible de prouver leur union. Des versions de
producteurs différentes sur la même branche sont également ambiguës. Branches
LCOV et conditions Cobertura restent deux dimensions distinctes.

`not_measured` signale une dimension non fournie ; `not_applicable` un ensemble
mesuré sans élément applicable ; `unavailable` une comparaison Git indisponible.
Aucun de ces états ne vaut 100 %. Une métrique absente ne doit jamais satisfaire
une condition de gate. Les blocs dupliqués restent un compteur de blocs prouvés,
sans pourcentage artificiel ni déduction à partir des code smells.

La taille est le nombre de lignes de code déclaré par cloc. La complexité est
la somme des valeurs de classes distinctes publiées par Cobertura, sans prétendre
qu'elles ont une définition identique entre producteurs. Des valeurs ou versions
contradictoires produisent une mesure inconnue. Aucun score ou équivalence avec
SonarQube n'est créé. Les modèles d'estimation de remédiation et la classification
des règles appartiennent au catalogue versionné ; aucune durée n'est déduite de
la sévérité ou du message d'une occurrence.

## Consultation et nouveau code

Les totaux utiles sont présentés dans Projects et dans les preuves du Quality Gate. Les données détaillées restent internes au calcul : elles ne justifient plus une vue Code concurrente à Issues.

Les lignes/branches de nouveau code utilisent les lignes ajoutées du diff figé.
Un bloc dupliqué appartient au nouveau code lorsqu'une de ses deux plages
intersecte les lignes ajoutées du périmètre. Sans diff, les valeurs sont inconnues.
La taille et la complexité de classes restent globales : les rapports natifs ne fournissent pas de répartition ligne par ligne permettant de calculer leur part de nouveau code. Les liens de fichier exposés par Issues ciblent exclusivement le SHA analysé.

Les checks exécutables `CodeQualityChecks` couvrent union LCOV, ambiguïté
Cobertura, diff absent, nouveau code, comptages cloc, duplications réelles,
absence de fragments persistés et rejets des chemins/valeurs invalides.
