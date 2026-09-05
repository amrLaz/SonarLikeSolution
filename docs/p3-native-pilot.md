---
title: Pilote local des configurations natives P3
description: Exécution réelle de Roslyn, ESLint et Semgrep avec les exports du profil ; limites d'import des chemins absolus.
---

# Pilote local des configurations natives

Le 5 septembre 2026, trois configurations ont été publiées dans un profil
de l’API locale (`native-p3-460965`, version `1`), téléchargées par son endpoint
de configuration et matérialisées avec le client canonique
`DevSecOps/publish_reports.py --export-config`. Les scanners ont réellement
consommé ces fichiers dans un répertoire temporaire isolé.
Aucune dépendance n’a été ajoutée au runtime ni au dépôt. Les scans Docker
utilisent `--network none` ; Semgrep désactive métriques et vérification de version.

Empreinte globale des trois configurations exportées :
`40be280479482e8870aff42ecdf9dc4e4fd9cd64c5f7277dad367b9de734daf7`.

| Producteur réel | Configuration consommée | Résultat observé |
| --- | --- | --- |
| SDK .NET `10.0.104`, Roslyn `5.0.0-2.26119.110` | `.editorconfig` contenant `dotnet_diagnostic.CS0168.severity = error` | La compilation du corpus échoue avec CS0168 en **erreur**, prouvant l’application du niveau exporté ; SARIF 2.1.0 natif produit. |
| ESLint `9.39.1` sous Node `20.20.2` | Export `eslint-flat-json` devenu `.cjs`, règle native `no-eval: error` | Une fonction JavaScript contenant `eval` produit un finding `no-eval` et un code de sortie `1` ; SARIF 2.1.0 généré par `@microsoft/eslint-formatter-sarif 3.1.0`. |
| Semgrep OSS `1.175.1` | Export JSON avec une règle de **test du pilote** recherchant `privileged: true` dans un manifeste Kubernetes YAML | Une règle et un fichier effectivement analysés, un finding ; après correction du manifeste à `false`, aucun finding. |

L’image Semgrep tirée pour le pilote est identifiée par
`sha256:51c9f53a4fce0d55e9abd08d7b96968654248a4b1122e77f20e0a49c0072446c`.
La règle IaC est un témoin de consommation de configuration ; elle ne constitue
pas un catalogue de sécurité Kubernetes validé. Le corpus JavaScript ne valide
pas les plugins ou parsers spécifiques React/TypeScript.

## Publication des rapports natifs

Le pilote appelle les fonctions du client canonique de publication seule. Une
adaptation locale du manifeste définit `ci_provider: local` et vide les champs PR
pour empêcher tout effet distant ; elle ne modifie aucun octet des SARIF.
Les identifiants de commit sont des valeurs de fixture, sans comparaison Git
ni preuve de PR Azure DevOps. Authentification et données sont locales isolées.

Le premier import des trois rapports natifs est refusé explicitement : Roslyn
et le formatter ESLint émettent des URI `file:///…` absolues, alors que le contrat
d’import exige des chemins relatifs au dépôt. `PathMap` de Roslyn ne change pas
ces localisations dans le SARIF testé. Aucun rapport n’a été réécrit pour masquer
cette incompatibilité ; cette limite reste à traiter dans un parcours de
normalisation explicitement borné à la racine du checkout.
Reçu : `1496eb8d-aec7-4cc5-abee-515fa29fa197`, état `failed`, verdict `unknown`,
motif `Expected a repository-relative path.`

Le SARIF natif Semgrep utilise déjà un chemin relatif et a été publié séparément
sur `native-p3-semgrep-460965`, avec son profil exporté inchangé.
Son empreinte de configuration attendue est
`a0184598dc4f95d08c688f70e6ef04487c01fe2eeffdd6546573a8c8ce79078b`.
L’import du défaut (`5d763c1e-889e-4afa-b46c-cc25f6ee96da`) est `completed`,
état technique `complete`, gate `fail` : un finding mesuré dépasse le seuil zéro.

## Portée de la validation

Ce pilote vérifie la consommation native des trois types d’export et distingue
échec qualité attendu et échec d’import. Il ne démontre pas l’import direct des
deux SARIF à URI absolues, un scan sémantique exhaustif, une configuration React
avec plugins, l’intégration Azure DevOps ni les permissions ou branch policies
Azure. Les originaux, exports et résultats sont conservés dans le répertoire
temporaire du pilote, sans secrets dans cette documentation.
