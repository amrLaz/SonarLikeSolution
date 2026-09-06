---
title: Collaboration et revue P2
description: Identité durable, assignation, décisions motivées et conservation après purge.
---

# Collaboration et revue

Les deux parcours de publication associent les occurrences à un finding
durable dans la transaction du résultat. La clé versionnée `finding/1` contient
le projet, la branche, l'outil et la règle. Un fingerprint unique dans le rapport
normalisé conserve cette identité après un déplacement ou un renommage. Sans
fingerprint exploitable, la correspondance exige le même fichier, la même ligne
et le même message : un déplacement ne transmet donc pas automatiquement les
décisions. Les fingerprints ambigus utilisent cette correspondance conservatrice.
La propriété `identity_kind` rend cette limite visible.

Les occurrences antérieures à P2 peuvent être adoptées via
`POST /api/v1/collaboration/occurrences/{id}` depuis le détail Issues. Cette
opération porte sur les occurrences de la même analyse/révision. Les filtres
collaboratifs portent sur les findings déjà suivis, pas sur des anciennes
occurrences encore non adoptées. La liste indépendante Collaboration conserve
les liens `finding_id` après disparition des rapports.

## Propriétaires et assignation

Les administrateurs créent les équipes par projet et affectent le propriétaire
et l'équipe par défaut via `/collaboration/teams` et `/collaboration/ownership/{key}`.
Ces valeurs initialisent les nouveaux findings ; changer un propriétaire de
projet ne réassigne pas silencieusement les décisions existantes. Les humains
autorisés sur le projet peuvent assigner un finding à une équipe de ce projet
et à un utilisateur actif disposant d'un accès effectif au projet. Les équipes
sont des périmètres de travail : elles ne confèrent aucun droit d'accès.

Les lectures `/collaboration/people?project_key=…`, `/teams`, `/findings` et
`/findings/{id}/decisions` sont bornées par `limit` (1–100) et curseur.
`mine=true`, `team_id`, `state`, `project_key` et `branch` sont appliqués au
serveur avant pagination. Le GET findings d'une analyse accepte également
`mine`, `team_id` et `state`. Aucun token CI ne peut effectuer une revue humaine.

## Décisions et exceptions

`PUT /collaboration/findings/{id}` remplace l'assignation et la revue avec la
`version` lue. Une version obsolète renvoie 409 ; le client doit relire avant de
réessayer. Les états sont `open`, `confirmed`, `resolved`, `false_positive` et
`accepted_risk`. Tout changement d'état ou de revue exige un motif. Les commentaires
utilisent `POST /findings/{id}/comments`, avec version et `reason` (4 000 caractères
maximum). Les écritures sans changement ne produisent pas de notification.

Une exception (`false_positive` ou `accepted_risk`) est réservée à l'administrateur,
motivée et limitée à un an. Elle ne concerne que cette identité projet/branche.
À expiration, `effective_state` vaut immédiatement `open` ; la maintenance horaire
enregistre la réouverture par lots de 100. Un finding résolu observé dans une
analyse ultérieure est rouvert et audité. L'absence dans un scan incomplet ou sans
comparaison fiable ne ferme jamais automatiquement un finding.

La revue hotspot (`not_reviewed`, `safe`, `to_fix`) est distincte de l'état :
seuls les findings classés `security_hotspot` acceptent une revue autre que
`not_reviewed`. Un changement de catégorie ou de message réinitialise cette
revue et invalide l'exception éventuelle avec une décision auditée.

Ces décisions de collaboration **ne réécrivent pas les verdicts d'analyse et
ne modifient pas le calcul du gate**. Les exceptions de profil P1 restent le
mécanisme explicite de politique du gate, documenté séparément. Aucun faux
positif global ni suppression de règle n'est créé par cette revue.

Chaque décision conserve acteur, date, motif et instantané dans `finding_decisions`,
sans cascade vers une analyse et sans rétention automatique du journal général.
La purge des rapports conserve assignation et décisions. La suppression explicite
d'un projet reste une opération administrative distincte ; ses anciens findings
ne sont plus accessibles lorsque le projet ne fait plus partie des droits.

Voir [validation](validation.md). Les tests locaux ne remplacent pas le pilote Azure.
