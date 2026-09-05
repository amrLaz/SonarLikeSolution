---
title: Livraison Azure P3
description: Déploiement des capacités P3 par les pipelines existants, migrations additives et vérifications.
---

# Livraison Azure P3

La livraison utilise `CodeInsights Infrastructure` (963), puis
`CodeInsights Application` (969). La base existante est conservée :
`apply=true`, `recreateDatabase=false`. Les migrations P3 ajoutent les preuves,
les instantanés de qualité, les périmètres versionnés et les correspondances Git.
Elles n'effacent aucune analyse ou décision historique.

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
  `7352cb223ad3731139dc06e65472351a5416051e` ; 11 tests Python réussis.

L'acceptation organisationnelle des branch policies et la campagne de charge
restent distinctes de ces checks fonctionnels. Aucun envoi Teams ou création
de ticket Azure Boards n'est utilisé par les scénarios locaux.
