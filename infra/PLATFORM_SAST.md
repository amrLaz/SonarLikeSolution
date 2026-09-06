---
title: Infrastructure Azure de CodeInsights
description: Terraform, PostgreSQL et déploiement Azure DevOps.
---

# Infrastructure Azure de CodeInsights

## Stack

Le module gère le groupe `up-france-odi-sast-prod-rg` dans Subscription Fabrik : App Service Linux B1, PostgreSQL Flexible Server 16 B1ms avec 32 Go et sauvegardes de 7 jours, Key Vault et droits de son identité managée. Le registre partagé `upgroup` est référencé comme source de données. Une image ASP.NET Core 10 sert l'API et React sur le port 8000.

Le backend Terraform est le blob `sast-platform-production.tfstate` du conteneur `sast-platform-devops-governance` dans `fdinfraterraformstates`. [backend-production.tfvars](variables/backend-production.tfvars) désigne cet état unique. Ne pas initialiser un nouvel état pour des ressources déjà gérées.

## Pipelines

- [CodeInsights Infrastructure — 963](https://dev.azure.com/up-group/Up.France.ODI/_build?definitionId=963) utilise [ci/azure-pipelines.yml](ci/azure-pipelines.yml). Il valide Terraform et produit un plan. Le paramètre `apply=true` applique ce plan sauvegardé. `recreateDatabase=true` force uniquement le remplacement de la base applicative et détruit son contenu : cette option exige une autorisation explicite de perte des données. Le garde-fou autorise aussi le retrait ponctuel des quatre secrets Azure OpenAI supprimés avec le backend correspondant ; toute autre suppression arrête la pipeline avant application.
- [CodeInsights Application — 969](https://dev.azure.com/up-group/Up.France.ODI/_build?definitionId=969) utilise [.azuredevops/deploy-apps.yml](../.azuredevops/deploy-apps.yml). Il vérifie .NET contre PostgreSQL isolé, construit React et l'API, publie l'image dans ACR, configure App Service et vérifie HTTPS, les deux routes de santé et la page React.

Les deux définitions ciblent `Up.France.CodeInsights`, branche `master`, et utilisent la connexion de service `Subscription Fabrik`. Exécuter l'infrastructure avant l'application lorsqu'une release change la configuration requise. Les triggers Terraform ne lancent qu'un plan ; l'application se déploie pour les changements applicatifs de `master`.

## Secrets et accès

Le Terraform provisionne aussi un compte Blob privé et le conteneur `reports`,
avec `Storage Blob Data Contributor` pour l'identité managée de l'application.
Les clés partagées et l'accès public des blobs sont désactivés ; les suppressions
disposent de sept jours de récupération. Les options `Ingestion__BlobServiceUri`
et `Ingestion__PlatformUrl` sont injectées dans App Service. Cette évolution a été
appliquée par le run 276081, sans suppression ni recréation de la base.
Le provider utilise Entra (`storage_use_azuread=true`) ; le rôle Blob de
l'identité de déploiement est initialisé avant le plan complet si nécessaire.
Les preuves et limites figurent dans la [livraison P3](../docs/p3-deployment.md).

Le groupe de variables `CodeInsights.Infrastructure` contient les valeurs secrètes PostgreSQL, bootstrap administrateur et signature JWT. Terraform écrit les secrets JWT et bootstrap dans Key Vault, référencés par l'API. Les anciens secrets Azure OpenAI sont retirés avec `v0.5.0`, puisque l'application ne maintient plus cette intégration. Ne jamais afficher ou versionner leur contenu. Les plans et l'état contiennent des valeurs sensibles même quand les sorties sont masquées.

L'identité système de l'application reçoit `AcrPull` et `Key Vault Secrets User`. Le principal de la connexion Terraform gère le coffre. La connexion PostgreSQL utilise un mot de passe ; la règle `AllowAzureServices` autorise les adresses Azure. Une isolation réseau privée et une identité base dédiée restent des évolutions à concevoir.

## Schéma et démarrage

Terraform provisionne le serveur et la base `sast_platform`. L'image exécute les migrations EF Core et le bootstrap avant d'ouvrir HTTP. Le verrou natif EF protège les migrations concurrentes. Une erreur arrête le démarrage ; l'image ne peut pas devenir saine avec un schéma non préparé. La commande `dotnet CodeInsights.Api.dll --migrate` exécute cette préparation seule.

Le bootstrap crée `admin@codeinsights.local` lorsqu'aucun administrateur n'existe. Son secret se trouve dans Key Vault sous `bootstrap-admin-password`. Les droits projet et organisation restent à configurer dans l'application.

## Validation

```powershell
terraform -chdir=infra fmt -check -recursive
terraform -chdir=infra validate -no-color
```

Le SDK, les tests et les limites des vérifications applicatives sont documentés dans [validation.md](../docs/validation.md). Les sondes `/api/v1/health` et `/healthz` prouvent la disponibilité du processus ; un login et une lecture métier autorisée vérifient aussi l'accès à PostgreSQL. L'App Service utilise `/api/v1/health` comme chemin de santé.

Les tailles B1/B1ms ne constituent pas une preuve de capacité. Tester la charge, les restaurations PostgreSQL et les alertes avant de fixer des engagements de service. Le retour à une image validée doit respecter le schéma EF déjà appliqué.
