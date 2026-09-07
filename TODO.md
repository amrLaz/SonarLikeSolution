# TODO

- [x] Mise en favori des projets par utilisateur
- [x] Affichage de l'évolution de toutes les métriques dans le dashboard projet et suppression de la vue Evolution. Les métriques de même repère partagent une courbe ; les autres groupes utilisent des onglets.

- [x] Ajouter un splash screen futuriste à l'application pour améliorer l'expérience utilisateur au démarrage.
- [x] Ajouter des animations subtiles pour les transitions entre les vues afin d'améliorer l'expérience utilisateur.
- [x] Simplifier la navigation à Projects, Issues, Rules, Quality Gates et Administration.
- [x] Ouvrir Issues depuis un projet ou une criticité du dashboard avec le filtre correspondant.
- [x] Depuis une issue, ouvrir le code au commit analysé et la définition externe connue de la règle.
- [x] Distinguer visuellement les cartes Issues par criticité sans dépendre uniquement de la couleur.
- [x] Supprimer les routes, services, tables et migrations des vues retirées ; conserver une migration initiale unique tant que le produit n'est pas en production.

- [x] Revoir l'UX/UI de la vue Quality Gate
- [x] corriger la vue Rules
  - [x] supprimer le scroll imbriqué et conserver un seul défilement de page
  - [x] activer et désactiver les règles prises en charge par une nouvelle version de profil
- [x] La navigation et les filtres métier persistent dans l'URL
- [x] Décoration des PR avec les résultats de l'analyse et les échecs du Quality Gate. C'est une fonctionnalité activable depuis la vue d'administration.
- [ ] Sur les issues, donner une estimation de temps nécessaire pour les résoudre.
- [ ] Mode sombre activable par utilisateur
- [ ] Downsampling des métriques pour les vues historiques afin d'améliorer les performances.

## Prochaines étapes Sonar-like

- [ ] Faire de New Code le résumé prioritaire d'un projet : gate, issues nouvelles, couverture et duplication depuis la baseline.
- [ ] Ajouter aux filtres Issues des facettes avec compteurs serveur et conserver tous les filtres dans l'URL partageable.
- [ ] Ajouter les actions de triage en lot dans Issues : assignation, état, faux positif et risque accepté selon les droits.
- [ ] Ajouter « Mes issues » comme filtre d'entrée direct, sans recréer une vue Collaboration.
- [ ] Afficher sur chaque projet le Quality Gate courant et les métriques essentielles : bugs, vulnérabilités, code smells, couverture et duplication.
- [ ] Ajouter les événements utiles dans l'historique projet : changement de gate, profil, version analysée et rupture de mesure.
- [ ] Prévoir « Ouvrir dans l'IDE » seulement lorsqu'un protocole IDE fiable et la correspondance exacte branche/SHA sont disponibles.
