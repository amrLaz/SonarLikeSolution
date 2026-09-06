---
title: Livraison Azure P3
description: Déploiement des capacités P3 par les pipelines existants, migrations additives et vérifications.
---

# Livraison Azure P3

La livraison utilise `CodeInsights Infrastructure` (963), puis
`CodeInsights Application` (969). Jusqu'à `v0.4.0`, la base existante était
conservée avec des migrations additives. Pour `v0.5.0`, le produit n'étant pas
encore exploité, la base applicative est recréée une seule fois avec
`apply=true`, `recreateDatabase=true` afin d'installer la migration initiale
nettoyée sans conserver les tables des vues retirées. Cette opération efface les
données de validation antérieures, pas une base métier en service.

Le compte de rapports interdit les clés partagées. Le provider Terraform utilise
`storage_use_azuread=true` et l'identité de déploiement reçoit le rôle
`Storage Blob Data Contributor` dans le groupe de ressources du produit.
Le premier apply initialise ce rôle avant le rafraîchissement du compte Blob ;
le plan complet conserve ensuite le contrôle interdisant les suppressions.
L'application utilise sa propre identité managée, autorisée sur ce seul compte.
Voir la [configuration AzureRM](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/storage_account).

Le run 276077 a créé le compte, puis échoué lors du contrôle du service Blob
car le provider utilisait encore une clé. Le compte a été vérifié `Succeeded`,
sans clés partagées ; son marqueur Terraform `tainted` a été retiré sous verrou
dans le backend existant afin de le conserver. Le correctif d'authentification
permet de reprendre le même plan, sans recréer PostgreSQL ni le compte Blob.

## Validation et infrastructure

- Build Release : zéro erreur, zéro avertissement ; aucune différence de modèle
  EF après les migrations versionnées.
- Image Linux complète : API et SPA démarrées sur PostgreSQL et Azurite isolés.
- Suite HTTP : imports répétés et complémentaires, LCOV branches, blocs jscpd,
  taille cloc, remédiation documentée, profils effectifs et dérive, périmètres,
  décisions de sécurité, archives, rétention et refus interprojets.
- 130 routes protégées refusent les requêtes anonymes.
- TypeScript `--noUnusedLocals` et neuf checks Node réussis.
- [Infrastructure 276081](https://dev.azure.com/up-group/Up.France.ODI/_build/results?buildId=276081) :
  succès, rôle de déploiement initialisé puis plan complet appliqué
  (2 ajouts, 2 modifications, aucune suppression).
- Client canonique publié dans `Up.France.ODI.AzurePipelines`, commit
  `dd7560c1f349d20e583732d6bff2bbe2dc6c2e10` ; 14 tests Python réussis.
- [Pilote natif](p3-native-pilot.md) : configurations réellement consommées par
  Roslyn, ESLint et Semgrep ; trois SARIF importés avec configuration `matched`,
  localisations relatives prouvées et originaux retéléchargés identiques.
  Semgrep vérifie aussi défaut, correction, puis gate `fail` → `pass` sans
  modification du premier verdict. Les chemins absolus utilisent `source_root`
  explicite ; aucune lecture de source ni réécriture du rapport n'est effectuée.
- Navigateur intégré local : connexion, sélection projet/analyse, mesures et
  issues consultées sans erreur visible ni débordement horizontal global.

L'acceptation organisationnelle des branch policies et la campagne de charge
restent distinctes de ces checks fonctionnels. Aucun envoi externe n'est utilisé
par les scénarios locaux.

## Vérification Azure v0.6.6

- [Application 276121](https://dev.azure.com/up-group/Up.France.ODI/_build/results?buildId=276121) : succès le 6 septembre 2026 depuis le tag `v0.6.6`, source `f29efcee9f2671a8caa247fe541e7421367d273e`.
- Image active : `upgroup.azurecr.io/sast-platform:276121` ; bundle React `index-CqZZXXBv.js` et footer authentifié `CodeInsights · v0.6.6`.
- Les sondes `/api/v1/health`, `/healthz`, la page React, le login administrateur et les lectures authentifiées `auth/me`, `projects` et `profiles` ont réussi. Les lectures authentifiées sont retentées de manière bornée pendant la chauffe de l'App Service.
- Le navigateur intégré confirme la suppression du contexte projet/branche dupliqué et du texte technique de pagination, la disposition compacte de « Mes problèmes », la restauration du projet, de la branche, de l'analyse et de la catégorie depuis l'URL, ainsi que les liens Azure DevOps vers la branche et le commit exacts.

## Vérification Azure v0.6.2

- [Application 276116](https://dev.azure.com/up-group/Up.France.ODI/_build/results?buildId=276116) : succès le 6 septembre 2026 depuis le tag `v0.6.2`, source `530c4684c35bdb8cd7a68b7614f8447039312e31`.
- La production sert les bundles React `index-CcH4zjmm.js` et `index-BNivBL2e.css` ; le footer authentifié affiche `CodeInsights · v0.6.2`.
- Les sondes indépendantes `/api/v1/health`, `/healthz` et la page React répondent en HTTP 200 après le redémarrage.
- Le navigateur intégré confirme la navigation d'une carte métrique vers Issues avec projet, branche, analyse et catégorie dans l'URL, puis leur restauration après rechargement. Le détail projet affiche un graphique groupé unique avec les onglets Scores, Percentages et Findings ; les raccourcis de sévérité et `Focus API` ne sont plus présents.

## Vérification Azure v0.5.0

- [Infrastructure 276106](https://dev.azure.com/up-group/Up.France.ODI/_build/results?buildId=276106) : succès le 6 septembre 2026 avec `apply=true` et `recreateDatabase=true`. Le garde-fou a limité les suppressions à la base applicative et aux quatre secrets Azure OpenAI retirés du produit.
- [Application 276107](https://dev.azure.com/up-group/Up.France.ODI/_build/results?buildId=276107) : succès depuis le tag `v0.5.0`, source `9f4f5dc2883379047c06c2b4b53f9b983ab8cf5f`.
- Image active : `upgroup.azurecr.io/sast-platform:276107` ; bundle React `index-BGZtOsOu.js`, contenant la version `v0.5.0`.
- Les sondes `/api/v1/health` et `/healthz`, la page React, le login administrateur et les lectures authentifiées `auth/me`, `projects`, `profiles` et `ingestions/queue` ont réussi.
- Le navigateur intégré ouvre la page de connexion de la nouvelle version. La recréation de la base invalide volontairement les anciennes sessions et configurations stockées ; aucune donnée de validation antérieure n'est conservée.

## Vérification Azure v0.4.0

- [Application 276085](https://dev.azure.com/up-group/Up.France.ODI/_build/results?buildId=276085) :
  succès le 5 septembre 2026 à 21:17 UTC, source
  `04787b52f713a8e43b2587663614237e5fddb08b`.
- Image active confirmée dans App Service :
  `upgroup.azurecr.io/sast-platform:276085`.
- Sondes HTTPS `/api/v1/health`, `/healthz` et page React validées par le pipeline.
- Connexion administrateur, puis lectures authentifiées `/api/v1/auth/me`,
  `/api/v1/projects`, `/api/v1/profiles` et `/api/v1/ingestions/queue` réussies.
  Ces lectures vérifient aussi PostgreSQL, sans exécuter la suite de tests
  créatrice de données contre la production.
- App Service a terminé un dernier redémarrage à 21:19:24 UTC, après les
  sondes du pipeline. Les journaux attestent le démarrage de l'image `276085` ;
  les contrôles indépendants suivants confirment santé et page web HTTP 200,
  puis actualisation authentifiée dans le navigateur avec API connectée.
  La réussite du pipeline seule ne prouve donc pas la fin du basculement.

Le navigateur intégré retrouve la session utilisateur existante : l'API est
connectée, la liste des projets charge et le nouvel onglet **Code** affiche
l'explorateur et les périmètres. Aucun projet de test n'a été créé en production.

Les exécutions applicatives 276083 et 276084 ont déployé la même source mais
se sont chevauchées. Leurs contrôles authentifiés ont expiré pendant les
redémarrages ; les journaux App Service indiquent une annulation du démarrage,
puis un démarrage réussi. La sonde publique est revenue en HTTP 200.
Une seule exécution doit être suivie jusqu'à son contrôle final ; ne pas lancer
une relance manuelle tant que le déploiement automatique est actif.
