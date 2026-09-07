---
title: Architecture du hub
description: Composants ASP.NET Core 10, React et PostgreSQL de CodeInsights.
---

# Architecture du hub

## Application

Le [Dockerfile](../Dockerfile) construit React puis publie ASP.NET Core 10 dans une image Linux unique. [Program.cs](../apps/api/Program.cs) configure les Minimal APIs, l’authentification, l’injection de dépendances et les statiques React. Les services reçoivent leurs paramètres avec `IOptions<T>`. EF Core 10 et Npgsql accèdent à PostgreSQL avec les [mappings explicites](../apps/api/Data/AppDbContext.cs) des [entités](../apps/api/Data/Entities.cs).

[CodeInsights.slnx](../CodeInsights.slnx) réunit l’API et ses checks ; [Directory.Build.props](../Directory.Build.props) centralise framework, nullable et versions des packages. Les routes sont regroupées par domaine dans `apps/api/Endpoints`. Les appels HTTP externes passent par `IHttpClientFactory`. Les exports sont produits en CSV sans dépendance de rendu documentaire.

Deux flux d'ingestion sont supportés. Le runner transmet mesures et findings à `POST /api/v1/analyses`. Le client de publication transmet manifeste et originaux à `/api/v1/ingestions` : Blob Storage conserve les fichiers, PostgreSQL conserve reçus, révisions et jobs, puis le worker normalise les rapports et calcule le gate du profil. Les effets ADO et notifications sont des jobs distincts, créés dans la transaction du résultat.

## Organisation du frontend

Le SPA conserve React, TypeScript, Vite, les contrôles HTML natifs et le CSS partagé. [package.json](../apps/web/package.json) et son lockfile déclarent les dépendances ; le [Dockerfile](../Dockerfile) consomme les mêmes versions avec `npm ci`. Cette organisation ne change pas les contrats publics de l'API ni l'identité visuelle.

[App.tsx](../apps/web/src/App.tsx) porte la session, la navigation et les sélections communes de projet, branche et analyse. L'état métier partageable est sérialisé par `navigation-state.ts` dans l'URL ; `localStorage` ne conserve que la session. [useWorkspaceData.ts](../apps/web/src/useWorkspaceData.ts) regroupe les lectures communes ; les écrans chargent leurs ressources propres. Les types métier sont dans `apps/web/src/types.ts`, indépendamment du composant App.

Les [composants métier](../apps/web/src/components/) exposent Projects, Issues, Rules, QualityGates et les écrans d'administration (AuditLog, Notifications, CiTokens, UsersAccess, AuthProviderSettings, DevOpsIntegrations et PlatformSettings). Projects intègre les mesures cliquables et l'historique groupé ; Issues concentre les catégories de findings, l'export CSV filtré, les liens source et le suivi. `MetricGrid` partage la présentation des mesures. Les formulaires et interactions appartiennent à l'écran concerné ; ils ne sont pas transférés dans un store global.

[query-client.ts](../apps/web/src/query-client.ts) crée un cache par arbre de session : fraîcheur de 30 secondes, aucun retry automatique et aucun refetch au focus ou à la reconnexion réseau. Un changement de session crée un nouvel arbre et annule les anciennes lectures. Les clés portent le contexte métier et les filtres appliqués, jamais le Bearer. Les mutations mettent à jour ou invalident les ressources concernées ; leurs erreurs restent distinctes d'un succès. [api.ts](../apps/web/src/api.ts) centralise l'ajout du Bearer et le rejet des réponses HTTP en échec autour de `fetch`.

Les favoris de projets sont une préférence personnelle persistée côté serveur. Une mutation invalide les synthèses paginées et ciblées, puis repart de la première page. Après fusion de la page courante et du projet sélectionné, le frontend retrie les projets par favori puis par clé afin que Projects, Issues, Rules et Quality Gates partagent le même ordre. Le filtre exclusif reste propre à Projects et n'est donc ajouté à la clé ni à la requête des autres écrans.

Les données serveur restent dans Query ; les sélections, filtres saisis et brouillons restent locaux. Les paramètres utilisent un brouillon partiel, les gates un brouillon lié au gate sélectionné, et les fournisseurs une référence d'initialisation par sélection. Un rafraîchissement du cache ne remplace donc pas une saisie en cours. Les détails des parcours, les bornes de formulaire et les commandes de validation sont dans [Interface](interface.md).

## Identités et données

Les utilisateurs se connectent avec un compte local ou Entra. Les producteurs utilisent des tokens CI limités par projets et scopes. L’identité d’accès aux ressources Azure est distincte de ces deux usages. Voir la [matrice des autorisations](security-access.md).

Le schéma contient organisations, projets, grants utilisateur, périmètres de tokens, transactions OIDC et résultats d’analyse. `user_project_favorites` relie un utilisateur à un projet par une clé primaire composite et des suppressions en cascade. Ce lien ne confère aucun accès : les lectures continuent d'appliquer les grants existants, et un favori masqué par une perte d'accès redevient visible si cet accès est restauré. Les mesures et instantanés historiques restent en JSON texte. P1 ajoute des occurrences de findings, lignes de couverture, composants SBOM et profils versionnés dans des tables dédiées ; les listes utilisent des projections paginées et des synthèses serveur. Les migrations EF Core préparent la base avant l’ouverture HTTP. Le bootstrap crée le premier administrateur et les fournisseurs. La connexion est configurée par `ConnectionStrings:CodeInsights` ; les sections `Bootstrap`, `Authentication` et `Analysis` sont liées aux options des services. Les contrats de réponse utilisent `snake_case`.

Les sessions utilisateur peuvent ajouter ou retirer un favori par `PUT` ou `DELETE /api/v1/auth/me/favorite-projects/{project_key}`. Les opérations sont idempotentes ; l'ajout exige un projet autorisé qui possède au moins une analyse, et les tokens CI sont refusés. `/api/v1/insights/summary` expose `is_favorite`, accepte `favorites_only` et utilise un curseur opaque composé du groupe favori et de la clé du projet. L'ordre SQL stable est favori d'abord, puis clé alphabétique, y compris à la frontière entre pages.

La rétention s'exécute via un job de maintenance horaire : le serveur HTTP n'attend pas directement la purge. Le worker durable utilise les verrous PostgreSQL `SKIP LOCKED`, des baux renouvelés, cinq tentatives et une concurrence par défaut de deux. Les imports et effets externes survivent aux reprises ; les notifications du POST direct restent best-effort en mémoire et sa décoration PR synchrone. Les [checks](validation.md) couvrent les contrats, la persistance et les autorisations sur des données isolées.

## Hébergement et évolutions

P3 évalue la comparaison Git avant les conditions de gate des profils d'ingestion. Les scopes et preuves sont figés dans l'instantané. Les occurrences conservent les métadonnées SARIF de provenance et de localisation ; les liens source ciblent le SHA analysé et aucune copie de code n'est ajoutée. Voir
[gate nouveau code](p3-new-code.md) et [preuves SARIF](p3-evidence.md).

Le modèle initial contient les instantanés de mesures natives, les définitions immuables de périmètres et les correspondances Git. Le worker applique ces périmètres avant les agrégats, contrôle l'empreinte des configurations exécutables, puis évalue la revue selon les décisions figées à la publication. Issues ouvre directement le fichier au SHA analysé sans stocker de sources. Voir [qualité détaillée](p3-code-quality.md),
[profils](p3-profiles.md), [périmètres](p3-code-scopes.md) et
[revue sécurité](p3-security-review.md).

Le traitement des issues utilise une identité de finding indépendante des occurrences, l'assignation projet/équipe et des décisions de revue conservées après purge des détails. Il est intégré à Issues ; aucun module Portefeuille ou Boards parallèle n'est maintenu. Les contrats et limites sont dans [traitement des issues](p2-collaboration.md).

## Cycle d’analyse et projection PR

`analysis_records` est l’unique source de vérité. `/api/v1/analyses/start` crée ou retrouve un run `running/pending`; `/complete` persiste une seule fois le snapshot et le verdict `pass`, `fail` ou `unknown`; `/fail` termine en `failed/unknown`. Chaque transition et son job `pr-decoration` sont enregistrés ensemble. Le worker relit toujours l’état courant, donc un ancien job pending ne peut pas restaurer un état obsolète.

Azure DevOps et GitHub sont des projections rejouables. Aucun mapping issue/commentaire ou issue/annotation n’est stocké. Seul l’identifiant du Check Run GitHub de l’analyse courante est conservé pour terminer ce snapshot immutable. Les sources textuelles strictement nécessaires aux prompts sont séparées des rapports et restent dans le Blob privé.

Le [Terraform](../infra/PLATFORM_SAST.md) définit les ressources Azure. La [pipeline](../.azuredevops/deploy-apps.yml) construit et déploie l’image. Le [Compose](../docker-compose.yml) est destiné au développement local ; son existence ne prouve pas un déploiement Azure.

P1 implémente stockage Blob, queue PostgreSQL, import SARIF/couverture/SBOM et agrégats serveur. `Ingestion:BlobServiceUri` utilise `DefaultAzureCredential` ; `BlobConnectionString` permet notamment le développement Azurite. Le conteneur de rapports est privé et sa création Azure appartient à Terraform. La concurrence est bornée par processus : ajouter une réplique augmente les connexions et la pression sur PostgreSQL. Le parsing conserve un plafond mémoire/entrées, mais ne constitue pas un traitement streaming intégral. Le catalogue des projets et les branches détaillées des synthèses restent des points à mesurer. Le smoke local ne certifie pas la capacité pour plusieurs centaines de projets ; la campagne A/B/C et le pilote Azure restent à réaliser. Voir [intégration](integration.md), [performances](performances.md) et [roadmap](roadmap.md).
