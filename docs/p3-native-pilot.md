---
title: Pilote local des configurations natives P3
description: Exécution réelle et import des SARIF natifs Roslyn, ESLint et Semgrep avec configuration effective et racine explicite.
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

Le premier import des trois rapports natifs a été refusé explicitement : Roslyn
et le formatter ESLint émettent des URI `file:///…` absolues, alors que le contrat
d’import exige des chemins relatifs au dépôt. `PathMap` de Roslyn ne change pas
ces localisations dans le SARIF testé. Le contrat a été complété avec `source_root`
explicite pour normaliser ces chemins côté serveur, sous la seule racine autorisée.
Aucun rapport n’a été réécrit.
Reçu : `1496eb8d-aec7-4cc5-abee-515fa29fa197`, état `failed`, verdict `unknown`,
motif `Expected a repository-relative path.`

Après ce complément, les **trois originaux natifs ont été importés avec succès**.
Les producteurs Windows et Docker ont été publiés séparément car leurs racines
diffèrent : racine absolue Windows du corpus pour Roslyn, `/pilot` pour ESLint et
`/pilot/semgrep` pour Semgrep. Les localisations hors racine ne sont pas acceptées.
Les trois reçus finaux sont `completed`, technique `complete`, gate `fail`
attendu pour le défaut détecté ; leur configuration est `matched`.

| Producteur | Analyse finale | Localisation normalisée | Empreinte de configuration attendue = effective |
| --- | --- | --- | --- |
| Roslyn | `958797d0-7afb-4bdd-85d0-53e4f2028ee7` | `dotnet/Program.cs:1`, CS0168 | `a5f937c0c1ed0e6fabe019bebb8edd3f092da639a18853163caefcb9020fde1c` |
| ESLint | `22e5e4b3-66c6-4e67-9deb-29f553a67db0` | `eslint/app.js:1`, no-eval | `486f29a702428a2425c0cb80fdee56405218ec3ceb42705a4ed32e4a3263bb58` |
| Semgrep | `33fb7021-c3f4-43fd-afdb-b1bc7cd97edb` | `pod.yaml:10`, native-privileged-container | `a0184598dc4f95d08c688f70e6ef04487c01fe2eeffdd6546573a8c8ce79078b` |

Les originaux ont été retéléchargés depuis les trois reçus
`1bd10e17-726f-4254-952d-02f1de11ad46`,
`1f4f56f1-cc2a-4a3e-93b9-91b0d11812e9` et
`9be6f3df-5935-4ee3-9838-b55eecf442c7`. Leurs SHA-256 sont identiques aux
fichiers émis par les scanners : **aucun octet des rapports n’a changé**.

Le SARIF natif Semgrep utilise déjà un chemin relatif et a été publié séparément
sur `native-p3-semgrep-460965`, avec son profil exporté inchangé.
Son empreinte de configuration attendue est
`a0184598dc4f95d08c688f70e6ef04487c01fe2eeffdd6546573a8c8ce79078b`.
L’import du défaut (`5d763c1e-889e-4afa-b46c-cc25f6ee96da`) est `completed`,
état technique `complete`, gate `fail` : un finding mesuré dépasse le seuil zéro.

Après correction et nouvelle exécution native, le reçu
`d69d63e8-a35a-45a2-b4a8-6355c1b6a01d` est `completed`, technique `complete`,
gate `pass`, compteur mesuré zéro. Les deux analyses conservent leurs verdicts
distincts (`e9c58a9b-280e-4656-adc4-e900cad917cf` puis
`6d4b498c-f5f0-4d77-823b-64a73c2b7076`). Les instantanés API des deux résultats
attestent `configuration.state: matched` avec les empreintes attendue et effective
égales à `a0184598dc4f95d08c688f70e6ef04487c01fe2eeffdd6546573a8c8ce79078b`.
La correction concerne uniquement le corpus ; le fichier de configuration reste
identique. Aucune réécriture du premier résultat n’a été nécessaire.

## Portée de la validation

Ce pilote vérifie la consommation native des trois types d’export, leur import
avec racine explicite, leurs empreintes et la conservation des originaux.
Il distingue échec qualité attendu et échec d’import. Il ne démontre pas un scan
sémantique exhaustif, une configuration React avec plugins, l’intégration Azure
DevOps ni les permissions ou branch policies Azure.
Les originaux, exports et résultats sont conservés dans le répertoire
temporaire du pilote, sans secrets dans cette documentation.
