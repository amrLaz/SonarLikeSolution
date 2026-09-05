---
title: Infrastructure Azure de la plateforme
description: Ressources Terraform, identités et chaînes Azure DevOps déclarées pour héberger la plateforme de qualité et de sécurité.
---

# Infrastructure Azure de la plateforme

Ce dossier porte la définition Terraform de l'hébergement. Le nom technique `sast-platform` est conservé dans les ressources existantes ; la vocation produit est décrite dans l'[architecture applicative](../docs/architecture.md). Les vérifications de service et limites opérationnelles sont regroupées dans l'[exploitation](../docs/exploitation.md).

Les éléments ci-dessous sont **déclarés dans les sources**. Aucun inventaire Azure, état Terraform distant, historique de Release ou test de restauration n'a été vérifié pour cette documentation. Ils ne prouvent ni le déploiement effectif, ni la disponibilité, ni la capacité de production.

## Ressources et responsabilités

| Composant   | Définition actuelle                                                                        | Limite à connaître                                                                         |
| ----------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Hébergement | App Service Linux, plan B1 par défaut, HTTPS, port 8000, ASP.NET Core 10              | Une image sert ASP.NET Core et la SPA React ; aucun worker d'ingestion séparé déclaré           |
| Base        | PostgreSQL Flexible Server 16, `B_Standard_B1ms`, 32 Go par défaut, croissance automatique | Pas de haute disponibilité explicite ; ces tailles ne constituent pas une capacité mesurée |
| Sauvegardes | Rétention PostgreSQL de 7 jours, sans géoredondance                                        | Aucun RPO/RTO démontré ni exercice de restauration versionné dans ce dossier               |
| Registre    | ACR partagé référencé en source de données                                                 | Terraform ne crée ni ne gère son cycle de vie                                              |
| Secrets IA  | Key Vault, RBAC, références Key Vault dans les paramètres App Service                      | Soft delete 7 jours, protection contre purge désactivée                                    |
| Réseau base | Règle `AllowAzureServices`, accès développeur facultatif par IP                            | Aucun réseau privé ou filtrage limité à l'identité applicative ; la règle Azure est large  |

Sources : [hébergement](webapp.tf), [PostgreSQL](postgres.tf), [Key Vault](keyvault.tf), [ACR](acr.tf), [variables](variables.tf).

Aucun Blob de rapports, Service Bus, Redis, autoscaling, Application Insights, alerte ou diagnostic centralisé n'est déclaré dans ce module. Ces composants doivent être décidés et provisionnés selon les besoins réels du hub, pas supposés présents à partir du Docker Compose local.

Le paramétrage `env` ne rend pas le module entièrement multi-environnement : le nom Key Vault est fixé dans le code, et plusieurs valeurs par défaut et cibles de pipeline désignent la production. Une nouvelle implantation nécessite une revue des noms, du backend et des cibles de déploiement.

## Identités et secrets

- L'identité système de la Web App reçoit `AcrPull` sur le registre et `Key Vault Secrets User` sur le coffre. Elle sert à tirer l'image et lire les secrets IA.
- Le principal qui exécute Terraform reçoit `Key Vault Administrator` sur le coffre. Il doit pouvoir créer les ressources et les affectations RBAC ; cette autorisation ne découle pas de l'identité de la Web App.
- PostgreSQL utilise actuellement un identifiant et un mot de passe administrateur transmis dans les paramètres App Service. L'accès base n'utilise pas d'identité managée et le mot de passe n'est pas une référence Key Vault.
- Les valeurs sensibles sont injectées par `TF_VAR_authentication_signing_key` (au moins 32 caractères), `TF_VAR_postgres_admin_password`, `TF_VAR_azure_openai_endpoint`, `TF_VAR_azure_openai_api_key` et, facultativement, `TF_VAR_anthropic_api_key`. Lorsqu'aucun administrateur n'existe, fournir aussi `TF_VAR_platform_admin_password` avec au moins 12 caractères : la migration refuse de créer le premier administrateur sans ce secret et ne l'imprime jamais. Après ce bootstrap, le secret peut être vidé ; un redémarrage ne réactive ni ne réinitialise le compte. Ne pas inscrire ces valeurs dans un fichier versionné ou un journal.
- `sensitive = true` masque certaines sorties Terraform mais ne retire pas les valeurs de l'état. Le backend, les plans sauvegardés et leurs autorisations doivent être protégés.

Le mot de passe du serveur PostgreSQL est ignoré par `lifecycle.ignore_changes`, mais celui des paramètres applicatifs ne l'est pas. Une rotation doit maintenir les deux valeurs cohérentes ; changer uniquement une variable Terraform ne garantit pas la rotation de la base.

L'authentification des utilisateurs Entra et les autorisations applicatives sont un autre flux, décrit dans l'architecture. Les permissions ACR/Key Vault ne les remplacent pas.

## Validation et état Terraform

La configuration exige Terraform >= 1.5 et AzureRM `~> 4.0`, avec un lockfile versionné. Le backend AzureRM est externe et configuré via [backend-production.tfvars](variables/backend-production.tfvars) ; les paramètres métier non secrets sont dans [production.tfvars](variables/production.tfvars). Le stockage d'état doit déjà exister. L'enregistrement automatique des resource providers est désactivé : les providers nécessaires doivent être disponibles dans la souscription.

Validation locale sans connexion au backend, depuis la racine du dépôt :

```powershell
terraform -chdir=sast-platform init -backend=false -input=false -lockfile=readonly
terraform -chdir=sast-platform fmt -check -recursive
terraform -chdir=sast-platform validate -no-color
```

Ces commandes installent éventuellement les providers et écrivent le cache local ; elles ne déploient rien et ne vérifient pas les accès Azure. Utiliser un checkout propre pour ne pas réutiliser par inadvertance la configuration d'un autre backend.

Pour une revue d'infrastructure nécessitant l'état distant, vérifier d'abord la souscription et l'identité actives, les droits sur le conteneur d'état et les valeurs `TF_VAR_*`, puis initialiser explicitement le backend attendu :

```powershell
terraform -chdir=sast-platform init -input=false -lockfile=readonly -backend-config=variables/backend-production.tfvars
terraform -chdir=sast-platform plan -input=false -var-file=variables/production.tfvars
```

Un backend différent déjà enregistré doit être examiné avant toute reconfiguration ou migration d'état. Ne pas ajouter automatiquement `-migrate-state`, `-reconfigure` ou `-lock=false`. Le plan peut lire l'état et les ressources Azure ; il ne vaut pas autorisation d'appliquer. L'application et le rollback d'infrastructure relèvent de la chaîne de déploiement approuvée.

## Deux chaînes Azure DevOps distinctes

**Infrastructure.** [ci/azure-pipelines.yml](ci/azure-pipelines.yml) référence `az-terraform-tpl.yml` du dépôt de templates au tag `v1.1.4`, cible ce dossier et désactive Sonar. Le template présent dans le checkout des templates réalise init sans backend, contrôle de format, validation puis publication d'un artefact `drop` hors branche de merge. Le contenu exact du tag référencé doit être vérifié avant d'assimiler son exécution à ce checkout. Ce YAML consommateur ne montre aucun `plan/apply` de production : une éventuelle Release externe n'est pas documentée comme vérifiée.

**Image applicative.** Le [pipeline de déploiement Azure DevOps](../.azuredevops/deploy-apps.yml) construit `Dockerfile`, publie un tag `Build.BuildId` et `latest` dans ACR, puis sélectionne le tag de build sur la Web App et la redémarre. Le démarrage du conteneur exécute la migration versionnée avant le serveur HTTP ; une migration ou une validation de rattachement en erreur empêche donc l'activation de l'API. Il utilise une connexion de service Azure et un environnement de déploiement Azure DevOps. Les droits et approbations de ces objets ne sont pas définis dans ce YAML et n'ont pas été vérifiés.

La chaîne image se déclenche sur `master` pour les chemins applicatifs énumérés et désactive les PR. Une modification documentaire ou Terraform seule ne déclenche pas cette livraison d'image. Elle ne lance ni test applicatif ni vérification HTTP après le redémarrage. Le message « déploiement terminé » prouve seulement que les commandes précédentes ont réussi.

Terraform ignore les changements de `application_stack` pour laisser la livraison gérer la version d'image. Les commentaires mentionnant GitHub Actions dans `webapp.tf` et `outputs.tf` sont hérités ; le chemin Azure DevOps ci-dessus est celui à utiliser pour cette documentation.


## Conditions avant exploitation à grande échelle

- **Santé :** l'API expose `/api/v1/health` et `/healthz`, sans vérification PostgreSQL. Le Dockerfile sonde `/health`, qui n'est pas le chemin de santé API déclaré. Aucun `health_check_path` App Service n'est configuré dans Terraform. Valider séparément processus, dépendances et parcours métier.
- **Capacité :** mesurer ingestion, consultation, taille des réponses, CPU/mémoire et connexions SQL avant dimensionnement. B1/B1ms et deux workers sont des paramètres de départ ; les commentaires de capacité simultanée dans les anciennes sources ne sont pas des résultats de charge.
- **Base et migrations :** le conteneur applique les migrations versionnées et rejouables avant le démarrage de l'API.  Après rattachement explicite de chaque projet à une organisation et un profil, et de chaque token CI actif à ses projets et scopes, appliquer `p0_require_complete_mappings=true` par Terraform : tout mapping manquant bloque alors le démarrage. Une image précédente n'annule pas une évolution de schéma ; le rollback doit rester compatible avec le schéma déjà migré.
- **Observabilité :** définir les signaux de disponibilité, erreurs, latence, traitement en attente et saturation, puis leurs alertes Azure. La configuration actuelle ne fournit pas ces garanties.
- **Reprise :** tester la restauration PostgreSQL, la disponibilité d'une image précédente et la cohérence des secrets. L'existence d'une rétention de sauvegardes ne constitue pas une procédure de reprise testée.

Les actions produit et les objectifs de performance sont reliés dans l'[exploitation de la plateforme](../docs/exploitation.md), sans modifier ici les ressources ni leurs paramètres.
