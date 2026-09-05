---
title: Preuves SARIF et liens de code P3
description: Métadonnées de localisation et documentation du producteur, sans copie de source.
---

# Preuves SARIF et liens de code

L'import SARIF conserve les positions principales, les localisations associées
et les étapes des `codeFlows.threadFlows`, avec leurs index de flux et de thread.
Les régions conservent lignes et colonnes lorsqu'elles sont renseignées. Aucun
snippet de code n'est copié dans les métadonnées. La limite est de 200 positions
par résultat ; `locations_truncated` indique le dépassement. Le rapport original
reste la preuve complète, soumis à sa rétention et à ses droits d'accès existants.
La sérialisation normalisée partage aussi un budget cumulé de 50 Mio UTF-8
par ingestion, toutes occurrences et tous rapports confondus. Un dépassement
échoue explicitement : une occurrence multi-position répétée ne peut amplifier
sans limite les métadonnées persistées.

Les liens de fichier Azure DevOps exigent un dépôt HTTPS reconnu (`dev.azure.com`
ou organisation `visualstudio.com`), un chemin relatif et un SHA complet de 40 ou
64 caractères hexadécimaux. Ils ciblent le commit de la publication et la ligne
fournie. Aucun repli sur HEAD ou une branche mutable. Les URI contenant des
identifiants, une query ou un fragment ne sont pas reprises pour le dépôt.
Une localisation avec `uriBaseId` non résolu ne produit pas de lien de code :
la relation avec la racine du dépôt n'est pas prouvée.

Pour les rapports SARIF natifs produisant des chemins absolus, le manifeste peut
déclarer `source_root` explicitement : racine Windows `C:/agent/source`, POSIX
`/agent/source`, ou URI locale `file:///...`. Les chemins SARIF ne sont convertis
en chemins relatifs que s'ils sont strictement enfants de cette racine. Les
chemins Windows se comparent sans distinction de casse, les chemins POSIX avec
distinction de casse. Un préfixe voisin (`source-other`), une traversée même
encodée, une URI UNC, une query ou un fragment sont refusés. Sans racine déclarée,
un chemin absolu reste refusé. Aucun fichier source n'est lu et le rapport natif
stocké demeure inchangé. Le chemin normalisé et la preuve de localisation
permettent alors le lien au SHA analysé ; aucune racine n'est devinée.

La documentation provient exclusivement de `tool.driver.rules[].helpUri` pour
la règle correspondante. Un lien HTTPS sans identifiants est conservé avec la
provenance `sarif.tool.driver.rules.helpUri` et l'état `producer_link_unverified`.
Il s'agit d'un lien déclaré par le producteur : CodeInsights n'a vérifié ni sa
disponibilité réseau, ni la propriété de son domaine. Aucun accès externe, cache
ou contenu éditorial n'est ajouté. Les descripteurs d'extensions non résolus ne
sont pas associés à une documentation de règle du driver par homonymie.

La version de l'analyseur provient de `semanticVersion`, sinon `version` ; elle
ne constitue pas une version documentaire. `documentation_version` reste inconnu.
Une version du producteur dépassant 200 caractères n'est pas conservée.
Une règle inconnue ou un lien absent/non sûr produit `unavailable`, sans modifier
le résultat d'import ni le verdict du gate. Les anciens résultats ont des preuves
vides : la migration n'invente pas de documentation ou de localisation.

Les checks exécutables de `FindingEvidenceChecks`, appelés par les checks
d'import, couvrent provenance, positions et flux, absence de snippets, liens
non sûrs, SHA abrégé, hôte trompeur, URI base non résolue et troncature.
La validation d'une règle officielle du pilote, des droits réels ADO et du
scénario correction/republication reste nécessaire à l'acceptation P3.
