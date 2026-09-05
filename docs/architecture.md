---
title: Architecture du hub
description: Composants ASP.NET Core 10, React et PostgreSQL de CodeInsights.
---

# Architecture du hub

## Application

Le [Dockerfile](../Dockerfile) construit React puis publie ASP.NET Core 10 dans une image Linux unique. [Program.cs](../apps/api/Program.cs) configure les Minimal APIs, l’authentification, l’injection de dépendances et les statiques React. Les services reçoivent leurs paramètres avec `IOptions<T>`. EF Core 10 et Npgsql accèdent à PostgreSQL avec les [mappings explicites](../apps/api/Data/AppDbContext.cs) des [entités](../apps/api/Data/Entities.cs).

[CodeInsights.slnx](../CodeInsights.slnx) réunit l’API et ses checks ; [Directory.Build.props](../Directory.Build.props) centralise framework, nullable et versions des packages. Les routes sont regroupées par domaine dans `apps/api/Endpoints`. Les appels HTTP externes passent par `IHttpClientFactory`. Les exports utilisent PDFsharp/MigraDoc et une police embarquée pour Linux.

Le flux est : runner Azure DevOps → API d’analyses → PostgreSQL → interface React. Le producteur transmet les findings, les mesures et leur provenance, les exécutions d’outils et le profil d’analyse. L’API persiste l’instantané des sept conditions du gate avant les retours Azure DevOps et notifications.

## Organisation du frontend

Le SPA conserve React, TypeScript, Vite, les contrôles HTML natifs et le CSS partagé. Le [Dockerfile](../Dockerfile) déclare React/React DOM 19.2.8 et TanStack Query 5.102.8 ; cette évolution ne change pas les contrats publics de l'API ni l'identité visuelle. La navigation reste un état React, sans ajout de routeur ou de design system.

[App.tsx](../apps/web/src/App.tsx) porte la session, la navigation et les sélections communes de projet, branche et analyse. [useWorkspaceData.ts](../apps/web/src/useWorkspaceData.ts) regroupe les lectures communes ; les écrans chargent leurs ressources propres. Les types métier sont dans `apps/web/src/types.ts`, indépendamment du composant App.

Les [composants métier](../apps/web/src/components/) séparent Projects, Issues, Evolution, Rules, Vulnerabilities, QualityGates et les écrans d'administration (AuditLog, Notifications, CiTokens, UsersAccess, AuthProviderSettings, DevOpsIntegrations et PlatformSettings). Projects et Evolution reçoivent leur contexte de sélection ; AnalysisEvidence partage la présentation des preuves et des mesures. Les formulaires et interactions appartiennent à l'écran concerné ; ils ne sont pas transférés dans un store global.

[query-client.ts](../apps/web/src/query-client.ts) crée un cache par arbre de session : fraîcheur de 30 secondes, aucun retry automatique et aucun refetch au focus ou à la reconnexion réseau. Un changement de session crée un nouvel arbre et annule les anciennes lectures. Les clés portent le contexte métier et les filtres appliqués, jamais le Bearer. Les mutations mettent à jour ou invalident les ressources concernées ; leurs erreurs restent distinctes d'un succès. [api.ts](../apps/web/src/api.ts) centralise l'ajout du Bearer et le rejet des réponses HTTP en échec autour de `fetch`.

Les données serveur restent dans Query ; les sélections, filtres saisis et brouillons restent locaux. Les paramètres utilisent un brouillon partiel, les gates un brouillon lié au gate sélectionné, et les fournisseurs une référence d'initialisation par sélection. Un rafraîchissement du cache ne remplace donc pas une saisie en cours. Les détails des parcours, les bornes de formulaire et les commandes de validation sont dans [Interface](interface.md).

## Identités et données

Les utilisateurs se connectent avec un compte local ou Entra. Les producteurs utilisent des tokens CI limités par projets et scopes. L’identité d’accès aux ressources Azure est distincte de ces deux usages. Voir la [matrice des autorisations](security-access.md).

Le schéma contient organisations, projets, grants utilisateur, périmètres de tokens, transactions OIDC et résultats d’analyse. Les mesures, findings et instantanés sont stockés en JSON texte. Les migrations EF Core préparent la base avant l’ouverture HTTP. Le bootstrap crée le premier administrateur et les fournisseurs. La connexion est configurée par `ConnectionStrings:CodeInsights` ; les sections `Bootstrap`, `Authentication` et `Analysis` sont liées aux options des services. Les contrats de réponse utilisent `snake_case`.

La rétention et l’actualisation KEV sont déclenchées au démarrage selon leur dernière exécution. Les notifications sont best-effort en mémoire : elles ne constituent pas une file durable. Les [checks](validation.md) couvrent les contrats, la persistance et les autorisations sur des données isolées.

## Hébergement et évolutions

Le [Terraform](../infra/PLATFORM_SAST.md) définit les ressources Azure. La [pipeline](../.azuredevops/deploy-apps.yml) construit et déploie l’image. Le [Compose](../docker-compose.yml) est destiné au développement local ; son existence ne prouve pas un déploiement Azure.

La cible d’industrialisation est un traitement borné avec rapports volumineux dans Blob Storage et une file durable. Cette capacité, l’ingestion SARIF/SBOM et les agrégats serveur restent à développer. Aucun benchmark ne certifie encore la capacité pour plusieurs centaines de projets. Voir [intégration](integration.md), [performances](performances.md) et [roadmap](roadmap.md).
