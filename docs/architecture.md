---
title: Architecture du hub
description: Composants ASP.NET Core 10, React et PostgreSQL de CodeInsights.
---

# Architecture du hub

## Application

Le [Dockerfile](../Dockerfile) construit React puis publie ASP.NET Core 10 dans une image Linux unique. [Program.cs](../apps/api/Program.cs) configure les Minimal APIs, l’authentification, l’injection de dépendances et les statiques React. Les services reçoivent leurs paramètres avec `IOptions<T>`. EF Core 10 et Npgsql accèdent à PostgreSQL avec les [mappings explicites](../apps/api/Data/AppDbContext.cs) des [entités](../apps/api/Data/Entities.cs).

[CodeInsights.slnx](../CodeInsights.slnx) réunit l’API et ses checks ; [Directory.Build.props](../Directory.Build.props) centralise framework, nullable et versions des packages. Les routes sont regroupées par domaine dans `apps/api/Endpoints`. Les appels HTTP externes passent par `IHttpClientFactory`. Les exports utilisent PDFsharp/MigraDoc et une police embarquée pour Linux.

Deux flux coexistent. Le runner historique transmet mesures/findings à `POST /api/v1/analyses` et persiste son gate P0. Le client de publication seule transmet manifeste et originaux à `/api/v1/ingestions` : Blob Storage conserve les fichiers, PostgreSQL conserve reçus/révisions et jobs, puis le worker normalise les rapports et calcule le gate du profil. Les effets ADO et notifications P1 sont des jobs distincts, créés dans la transaction du résultat.

## Organisation du frontend

Le SPA conserve React, TypeScript, Vite, les contrôles HTML natifs et le CSS partagé. Le [Dockerfile](../Dockerfile) déclare React/React DOM 19.2.8 et TanStack Query 5.102.8 ; cette évolution ne change pas les contrats publics de l'API ni l'identité visuelle. La navigation reste un état React, sans ajout de routeur ou de design system.

[App.tsx](../apps/web/src/App.tsx) porte la session, la navigation et les sélections communes de projet, branche et analyse. [useWorkspaceData.ts](../apps/web/src/useWorkspaceData.ts) regroupe les lectures communes ; les écrans chargent leurs ressources propres. Les types métier sont dans `apps/web/src/types.ts`, indépendamment du composant App.

Les [composants métier](../apps/web/src/components/) séparent Projects, Issues, Evolution, Rules, Vulnerabilities, QualityGates et les écrans d'administration (AuditLog, Notifications, CiTokens, UsersAccess, AuthProviderSettings, DevOpsIntegrations et PlatformSettings). Projects et Evolution reçoivent leur contexte de sélection ; AnalysisEvidence partage la présentation des preuves et des mesures. Les formulaires et interactions appartiennent à l'écran concerné ; ils ne sont pas transférés dans un store global.

[query-client.ts](../apps/web/src/query-client.ts) crée un cache par arbre de session : fraîcheur de 30 secondes, aucun retry automatique et aucun refetch au focus ou à la reconnexion réseau. Un changement de session crée un nouvel arbre et annule les anciennes lectures. Les clés portent le contexte métier et les filtres appliqués, jamais le Bearer. Les mutations mettent à jour ou invalident les ressources concernées ; leurs erreurs restent distinctes d'un succès. [api.ts](../apps/web/src/api.ts) centralise l'ajout du Bearer et le rejet des réponses HTTP en échec autour de `fetch`.

Les données serveur restent dans Query ; les sélections, filtres saisis et brouillons restent locaux. Les paramètres utilisent un brouillon partiel, les gates un brouillon lié au gate sélectionné, et les fournisseurs une référence d'initialisation par sélection. Un rafraîchissement du cache ne remplace donc pas une saisie en cours. Les détails des parcours, les bornes de formulaire et les commandes de validation sont dans [Interface](interface.md).

## Identités et données

Les utilisateurs se connectent avec un compte local ou Entra. Les producteurs utilisent des tokens CI limités par projets et scopes. L’identité d’accès aux ressources Azure est distincte de ces deux usages. Voir la [matrice des autorisations](security-access.md).

Le schéma contient organisations, projets, grants utilisateur, périmètres de tokens, transactions OIDC et résultats d’analyse. Les mesures et instantanés historiques restent en JSON texte. P1 ajoute des occurrences de findings, lignes de couverture, composants SBOM et profils versionnés dans des tables dédiées ; les listes utilisent des projections paginées et des synthèses serveur. Les migrations EF Core préparent la base avant l’ouverture HTTP. Le bootstrap crée le premier administrateur et les fournisseurs. La connexion est configurée par `ConnectionStrings:CodeInsights` ; les sections `Bootstrap`, `Authentication` et `Analysis` sont liées aux options des services. Les contrats de réponse utilisent `snake_case`.

KEV conserve son contrôle de fraîcheur au démarrage. La rétention s'exécute via un job de maintenance horaire : le serveur HTTP n'attend plus directement la purge. Le worker durable utilise les verrous PostgreSQL `SKIP LOCKED`, des baux renouvelés, cinq tentatives et une concurrence par défaut de deux. Les imports et effets externes P1 survivent aux reprises ; les notifications du POST legacy restent best-effort en mémoire et sa décoration PR synchrone. Les [checks](validation.md) couvrent les contrats, la persistance et les autorisations sur des données isolées.

## Hébergement et évolutions

P3 évalue la comparaison Git avant les conditions de gate
des profils d'ingestion. Les scopes et preuves sont figés dans l'instantané,
sans changement du contrat legacy. La migration `FindingEvidence` ajoute aux
occurrences les métadonnées SARIF de provenance et de localisation ; les liens
source ciblent le SHA analysé et aucune copie de code n'est ajoutée. Voir
[gate nouveau code](p3-new-code.md) et [preuves SARIF](p3-evidence.md).

La migration `CodeQualityScopesAndReviews` ajoute les instantanés de mesures
natives, les définitions immuables de périmètres et les correspondances Git.
Le worker applique ces périmètres avant les agrégats, contrôle l'empreinte des
configurations exécutables, puis évalue la revue selon les décisions figées à
la publication. L'onglet Code consulte les chemins et annotations au SHA sans
stocker de sources. Voir [qualité détaillée](p3-code-quality.md),
[profils](p3-profiles.md), [périmètres](p3-code-scopes.md) et
[revue sécurité](p3-security-review.md).

P2 ajoute une identité de finding indépendante des occurrences, l'assignation
projet/équipe, les décisions de revue conservées, une boîte personnelle ciblée
et des effets Boards dans la queue durable existante. Les synthèses legacy sont
conservées après purge des détails. Le portefeuille compare chaque dimension
uniquement à profil et formule compatibles. Les contrats et limites sont dans
[collaboration](p2-collaboration.md), [Boards](p2-boards.md) et
[portefeuille](p2-portfolio.md).

Le [Terraform](../infra/PLATFORM_SAST.md) définit les ressources Azure. La [pipeline](../.azuredevops/deploy-apps.yml) construit et déploie l’image. Le [Compose](../docker-compose.yml) est destiné au développement local ; son existence ne prouve pas un déploiement Azure.

P1 implémente stockage Blob, queue PostgreSQL, import SARIF/couverture/SBOM et agrégats serveur. `Ingestion:BlobServiceUri` utilise `DefaultAzureCredential` ; `BlobConnectionString` permet notamment le développement Azurite. Le conteneur de rapports est privé et sa création Azure appartient à Terraform. La concurrence est bornée par processus : ajouter une réplique augmente les connexions et la pression sur PostgreSQL. Le parsing conserve un plafond mémoire/entrées, mais ne constitue pas un traitement streaming intégral. Le catalogue des projets et les branches détaillées des synthèses restent des points à mesurer. Le smoke local ne certifie pas la capacité pour plusieurs centaines de projets ; la campagne A/B/C et le pilote Azure restent à réaliser. Voir [intégration](integration.md), [performances](performances.md) et [roadmap](roadmap.md).
