---
title: Architecture du hub
description: Architecture réellement embarquée et trajectoire Azure du hub de rapports.
---

# Architecture du hub

## Architecture actuelle

Le [Dockerfile applicatif](../Dockerfile) construit React puis copie les fichiers statiques avec FastAPI dans une image Linux. [main.py](../apps/api/app/main.py) expose les routes et sert le frontend. SQLAlchemy utilise PostgreSQL via [db.py](../apps/api/app/db.py). Les analyses et leurs findings sont persistés dans les [modèles](../apps/api/app/models.py), notamment un champ texte JSON pour `affected_files`.

Le flux est : runner Azure DevOps → API d'analyses → PostgreSQL → interface React. Le runner canonique transmet les findings dans `affected_files`, les états d'outils et les mesures avec leur provenance. La création persiste l'instantané des sept conditions du gate avant les retours Azure DevOps et notifications.

Le [Terraform](../sast-platform/PLATFORM_SAST.md) déclare App Service Linux, PostgreSQL Flexible Server, Key Vault et un accès à l'ACR partagé. La [pipeline Azure DevOps](../.azuredevops/deploy-sast-platform.yml) construit et déploie l'image. Cette déclaration ne prouve ni la configuration live ni sa capacité sous charge.

Le [Compose local](../docker-compose.yml) mentionne Redis et un worker, mais le runtime embarqué n'apporte pas la preuve d'une file de traitement durable opérationnelle. Ne pas représenter ces services locaux comme des composants Azure déployés. Les assets [GitHub Actions](../deploy/legacy/github/deploy-platform.yml), [Bicep](../deploy/bicep/main.bicep) et [SonarLikeSolution](../sonarlikesolution/README.md) restent des parcours distincts ; la référence de déploiement P0 est Azure DevOps avec Terraform.

## Cible recommandée, non implémentée

Conserver React/FastAPI et PostgreSQL. Sortir les rapports volumineux dans Azure Blob Storage ; accepter une publication bornée, puis traiter validation, normalisation et calculs dans un worker alimenté par une file durable. Le choix précis du service de file et de l'hébergement worker appartient au lot d'industrialisation, sur la base des mesures ; aucun Kubernetes ni cache supplémentaire n'est requis par défaut.

Ce découplage suit le modèle Microsoft [Web–Queue–Worker](https://learn.microsoft.com/en-us/azure/architecture/guide/architecture-styles/web-queue-worker). L'API expose le suivi du traitement ; PostgreSQL porte des findings interrogeables, des synthèses de projet et les versions de verdict. Notifications et retours PR se font après finalisation, avec reprise et limitation de concurrence.

Préserver l'identité de l'analyse et son contexte lors d'une republication. Les erreurs de parsing vont dans un état explicite ; un échec d'outil ou un rapport incomplet ne produit pas un gate vert. Les documents originaux permettent le diagnostic et un retraitement maîtrisé sans relancer le build.

## Trois identités à distinguer

| Usage               | Existant / cible                                                                                                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Utilisateur         | Connexion locale et Entra dans le code ; cible : groupes/App Roles et droits par organisation/projet, vérifiés côté serveur.                                                                                                |
| Pipeline producteur | Token `PLATFORM_API_TOKEN` dans le runner ; cible : connexion Azure DevOps et jeton destiné au hub, limité aux projets autorisés. Une fédération Azure ne suffit pas sans validation de l'audience et des droits par l'API. |
| Ressources Azure    | Identité managée App Service pour les accès déclarés ACR/Key Vault ; PostgreSQL utilise actuellement les paramètres de connexion configurés. Ne pas assimiler cette identité à la connexion utilisateur.                    |

## Données et évolution

Les migrations SQL versionnées sont exécutées par `python -m app.migrate` avant le démarrage des workers dans l'image. Un verrou transactionnel PostgreSQL et la table `schema_migrations` assurent une application unique. Les analyses historiques restent marquées `legacy_unverified`; leurs valeurs et verdicts ne sont pas recalculés.

Le schéma P0 ajoute organisations, grants utilisateur, projets autorisés par token, transactions OIDC et instantanés de mesures/gates. Voir la [matrice d'accès](security-access.md) avant toute activation : les anciennes identités ne reçoivent aucun périmètre implicite.

La rétention doit séparer rapports bruts, détails et agrégats historiques ; les suppressions doivent préserver les décisions collaboratives et les liens d'audit. Voir les [contrats d'intégration](integration.md) et les [exigences de performance](performances.md).
