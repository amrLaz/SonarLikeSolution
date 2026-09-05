---
title: Azure Boards et notifications ciblées P2
description: Liens durables, réconciliation prudente et boîte de réception personnelle.
---

# Azure Boards et notifications ciblées

La collaboration conserve ses effets en PostgreSQL, indépendamment des rapports
supprimés par rétention. Aucun appel Azure Boards n'est effectué lors d'une décision
HTTP : un job `boards` référence une décision durable. La création d'un ticket est
demandée explicitement pour un finding ; elle n'est pas automatique pour tous les scans.

## Configuration et droits

Toutes les routes utilisent `/api/v1/collaboration`, une session humaine active et
les droits du projet. Les tokens CI sont refusés. L'administration configure
`PUT /projects/{project_key}/boards` avec `organization_config_id`, `ado_project`,
`work_item_type` et `enabled`. Le GET homonyme expose la configuration sans PAT.
La cible doit correspondre au projet Azure d'un `ProjectIntegration` dont
`repo_provider` vaut `azure-devops`. Seules les URL HTTPS Azure DevOps Services
`dev.azure.com` et `*.visualstudio.com` sont acceptées, sans port personnalisé,
userinfo, fragment ou query string. Azure DevOps Server n'est pas couvert.

Le PAT reste celui de l'organisation configurée et nécessite les droits Work Items
Read & Write sur la cible. Le projet, l'organisation et le type sont figés dans le
lien lors de sa demande ; modifier la configuration ne déplace pas les tickets
existants. Désactiver le projet suspend les livraisons ; une réconciliation explicite
peut relancer celles qui ont échoué après réactivation.

## Ticket et reprise

`POST /findings/{id}/boards` sans corps demande une création une seule fois ; les
appels suivants renvoient `already_requested`. `GET /findings/{id}/boards` retourne
le lien, son état, son URL, la version synchronisée et jusqu'à 100 événements de
livraison. Les décisions restent la source historique complète.

Avant tout POST de création, un compare-and-set persiste `creating`. Le ticket
porte le tag stable `codeinsights:{finding_id}`. Une reprise cherche ce tag par
WIQL : un résultat unique est vérifié par son tag exact et son projet Azure ;
plusieurs résultats ou aucun résultat après une tentative incertaine donnent
`needs_review`. La création n'est jamais réémise automatiquement après le marqueur
`creating`, même si le processus s'est arrêté avant l'appel réseau. Ce choix peut
exiger une intervention mais évite les doubles créations après timeout.

`POST /findings/{id}/boards/reconcile` relance la découverte et la synchronisation,
sans réinitialiser l'autorisation de créer. En cas d'absence confirmée, un opérateur
peut créer manuellement un ticket dans la cible avec le tag exact, puis demander
une réconciliation. En cas de doublons préexistants, conserver le tag sur un seul
ticket. Le contrôle est nécessaire avant toute action manuelle Azure.

Les mises à jour utilisent des PATCH de description avec contrôle de révision et
ignorent une description déjà identique. Elles incluent l'identité, le projet,
la branche, l'outil/règle, l'état et la version du finding, ainsi que sa localisation.
Le texte des rapports est échappé en HTML. La description appartient à CodeInsights ;
les modifications humaines de ce champ seront remplacées. Titre existant,
assignation, état du workflow Azure et commentaires restent sous contrôle humain.
Un verrou PostgreSQL par finding sérialise les écritures ; la dernière version
locale est relue à la livraison, ce qui évite de rétablir un ancien état.

Les opérations HTTP suivent les contrats Microsoft de [création Work Item](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/create?view=azure-devops-rest-7.1),
de [mise à jour](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/update?view=azure-devops-rest-7.1)
et de [requête WIQL](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/wiql/query-by-wiql?view=azure-devops-rest-7.1).

## Abonnements et boîte personnelle

`POST /subscriptions` reçoit `project_key`, `scope` (`project`, `team` ou `finding`)
et `scope_id`. Le serveur vérifie l'appartenance au projet et déduit l'utilisateur
de sa session. Les champs sont obligatoires ; les identifiants sont limités à
100 caractères. Un abonnement identique est idempotent. Le GET liste jusqu'à 500
abonnements ; ce nombre est aussi le maximum accepté par utilisateur.
`DELETE /subscriptions/{id}` ne supprime que l'abonnement de l'utilisateur courant.

Chaque changement significatif produit une entrée personnelle pour les abonnés
correspondants dans la transaction de la décision. Plusieurs abonnements
correspondant à un même changement sont dédupliqués par utilisateur et décision.
`GET /notifications` expose une liste paginée ; `PUT /notifications/{id}/read`
marque une entrée lue de façon idempotente. Une révocation de droits masque aussi
les anciennes notifications de ce projet. La livraison concerne la boîte native,
pas un webhook externe : aucun email ni message Teams n'est émis par ce parcours.
Les changements d'équipe concernent les abonnés de l'équipe affectée au moment de
la décision ; les abonnements de l'ancienne équipe ne sont pas conservés implicitement.

## Validation et limites

`BoardsChecks.RunAsync()` dans l'exécutable de checks simule HTTP : création,
perte de réponse POST, rejeu sans doublon, marqueur absent/multiple, refus d'un autre
projet ou marqueur, réponse 429, HTML échappé et PATCH idempotent sans commentaire
ni changement de workflow. Aucun ticket externe n'est créé par ces checks.
Le pilote Azure reste requis : type de ticket/champs obligatoires, droits PAT,
recherche WIQL, tags, concurrence réelle et latence de visibilité. La boîte native
et les événements durables ne disposent pas encore d'une politique de rétention
spécifique ; dimensionner leur conservation avant généralisation.
