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
  `dd7560c1f349d20e583732d6bff2bbe2dc6c2e10` ; 14 tests Python réussis.
- [Pilote natif](p3-native-pilot.md) : configurations réellement consommées par
  Roslyn, ESLint et Semgrep ; trois SARIF importés avec configuration `matched`,
  localisations relatives prouvées et originaux retéléchargés identiques.
  Semgrep vérifie aussi défaut, correction, puis gate `fail` → `pass` sans
  modification du premier verdict. Les chemins absolus utilisent `source_root`
  explicite ; aucune lecture de source ni réécriture du rapport n'est effectuée.
- Navigateur intégré local : connexion, sélection projet/analyse, explorateur,
  ligne couverte/non couverte, absence de mesure et deux localisations de
  duplication consultées sans erreur visible ni débordement horizontal global.

L'acceptation organisationnelle des branch policies et la campagne de charge
restent distinctes de ces checks fonctionnels. Aucun envoi Teams ou création
de ticket Azure Boards n'est utilisé par les scénarios locaux.

## Vérification Azure

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

Le navigateur intégré retrouve la session utilisateur existante : l'API est
connectée, la liste des projets charge et le nouvel onglet **Code** affiche
l'explorateur et les périmètres. Aucun projet de test n'a été créé en production.

Les exécutions applicatives 276083 et 276084 ont déployé la même source mais
se sont chevauchées. Leurs contrôles authentifiés ont expiré pendant les
redémarrages ; les journaux App Service indiquent une annulation du démarrage,
puis un démarrage réussi. La sonde publique est revenue en HTTP 200.
Une seule exécution doit être suivie jusqu'à son contrôle final ; ne pas lancer
une relance manuelle tant que le déploiement automatique est actif.
