---
title: Profils exécutables et catalogue producteur P3
description: Catalogue indépendant des occurrences, configurations natives versionnées et preuves de configuration effective.
---

# Profils exécutables et catalogue producteur

Les versions de profil conservent dans leur définition immutable un `rule_catalog`
indépendant des occurrences et des `analyzer_configurations`. Aucun texte
d'explication ou conseil éditorial n'est rédigé dans CodeInsights. Une règle décrit
`tool`, `tool_version`, `rule_id`, `language`, `category`, `parameters` (objet),
un lien HTTPS `documentation_url` et une `documentation_version` facultatifs.
Le lien provient du producteur ; sa présence ne prouve pas sa disponibilité ni
sa correspondance avec la version exécutée. La classification bug/code smell
appartient à cette version de profil.

Une configuration décrit `tool`, `tool_version`, `format`, `path` relatif et
`content`. Trois formats natifs sont acceptés : `editorconfig`, `semgrep-json`
et `eslint-flat-json`. Les deux premiers conservent les octets UTF-8 fournis ;
le dernier encapsule le tableau JSON en `module.exports = <tableau>;` dans un
fichier `.cjs` consommable par ESLint. Cette voie couvre les règles ESLint natives ;
plugins et parsers nécessitant du code exécutable restent configurés dans le dépôt.
Le service vérifie la structure, les bornes et les chemins ; l'analyseur reste
l'autorité de validation sémantique de sa configuration et doit réussir dans la CI.

Références : [EditorConfig .NET](https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/configuration-files),
[configuration ESLint](https://eslint.org/docs/latest/use/configure/configuration-files),
[règles Semgrep](https://semgrep.dev/docs/writing-rules/rule-ideas).

## Contrats

- `POST /api/v1/profiles` publie une nouvelle version, réservée aux administrateurs.
- `GET /api/v1/profiles/{id}/versions/{version}/catalogue` fournit des règles
  paginées (50, maximum 100), filtrables par `search` et `language`. Aucune occurrence
  préalable n'est nécessaire ; le catalogue ne prétend pas que la règle a tourné.
- `GET /api/v1/profiles/projects/{key}/configuration` exporte le profil affecté,
  ses fichiers natifs et SHA-256, avec empreinte globale. L'accès au projet est vérifié.
- `GET /api/v1/profiles/{id}/versions/{version}/diff/{previous}` compare règles,
  conditions, outils et empreintes de deux versions.
- `GET /api/v1/profiles/projects/{key}/impact?profileId=…&version=…` prévisualise
  ce changement avant l'affectation. Cette comparaison ne rejoue pas les analyses
  et ne prétend pas prédire leurs verdicts.
- `PUT /api/v1/profiles/projects/{key}` affecte une version publiée. Choisir
  une ancienne version réalise le retour arrière ; aucune version n'est réécrite.

Les configurations sont limitées à 100 fichiers et 1 MiB UTF-8 par profil ;
le catalogue à 10 000 règles. Les chemins sont relatifs, sans traversée,
identifiants de disque ni doublons insensibles à la casse. Les contenus
exportés ne sont jamais exécutés par le serveur.

## Consommation CI canonique

Télécharger l'export authentifié du projet, puis utiliser le client partagé :

```text
python DevSecOps/publish_reports.py --export-config profile.json --output-directory <sources>
```

L'export refuse de remplacer un fichier existant différent. Faire consommer ces
fichiers par les étapes d'analyse déjà présentes : `.editorconfig` dans la portée
du projet .NET, `semgrep scan --config <fichier.json>` ou
`eslint --config <fichier.cjs>`. L'export ne lance aucun de ces programmes.
Après leur exécution, publier avec `--effective-config profile.json
--configuration-root <sources>`, ou le paramètre `effectiveConfig` du template
`platform-publish-reports-tpl.yml`.

Le manifeste contient `effective_configurations` : outil/version, chemin et
SHA-256 calculé sur les **octets réellement présents**, même s'ils divergent de
l'export. La présence d'un fichier ne certifie pas à elle seule son utilisation
par le scanner : le raccordement de l'étape et le rapport producteur restent
des preuves du pilote CI. Le serveur compare empreinte attendue/effective et
versions des rapports mesurés : `matched`, `missing`, `drift` ou `not_configured`.
L'absence d'une configuration historique ne devient pas une attestation.

L'empreinte globale est SHA-256 UTF-8 de la concaténation des fichiers triés
par chemin ordinal, chacun donnant `tool\nversion\npath\nsha256_minuscule\n`.
Les instantanés conservent la dérive ; aucune correction de profil ne modifie
un verdict passé.

## Estimation de remédiation

Une règle peut fournir `remediation: {model: "constant", duration_seconds: N,
documentation_url: "https://…"}` lorsque ce modèle vient du producteur.
La durée doit être positive, au maximum un an, avec sa source HTTPS.
L'agrégation exige la correspondance outil/version/règle ; sans modèle elle
reste non mesurée. Une somme partielle annonce combien de findings sont
modélisés et non modélisés, ses sources, le profil et `producer_constant_seconds/v1`.
Il s'agit d'une estimation en secondes, sans équivalence avec une note SonarQube.

## Vérification

`ExecutableProfileChecks` couvre export natif, hash exact, absence, dérive de
version/contenu, traversée de chemins et durée partielle. Les tests Python du
client canonique couvrent export non destructif, contenu altéré et manifeste
avec empreinte/configuration de baseline. L'acceptation Azure exige encore
les analyseurs réels configurés puis leurs rapports publiés sur le pilote.
