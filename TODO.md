# TODO

- [ ] Mise en favori des projets par utilisateur
- [x] Affichage de l'évolution de toutes les métriques dans le dashboard projet et suppression de la vue Evolution. Chaque métrique conserve une échelle honnête ; le tableau exact reste disponible.
- [ ] Définir une agrégation honnête pour une courbe « tous les projets » : les compteurs peuvent être additionnés, mais les scores et pourcentages nécessitent une pondération serveur explicite.

- [x] Simplifier la navigation à Projects, Issues, Rules, Quality Gates et Administration.
- [x] Ouvrir Issues depuis un projet ou une criticité du dashboard avec le filtre correspondant.
- [x] Depuis une issue, ouvrir le code au commit analysé et la définition externe connue de la règle.
- [x] Distinguer visuellement les cartes Issues par criticité sans dépendre uniquement de la couleur.
- [x] Supprimer les routes, services, tables et migrations des vues retirées ; conserver une migration initiale unique tant que le produit n'est pas en production.

- [ ] Définir les branches par regex à tracker et historiser
- [ ] Revoir l'UX/UI de la vue Quality Gate
- [ ] corriger la vue Rules
  - [ ] le scroll vers le bas fais péter l'affichage
  - [ ] Comment activer et désactiver les règles
- [ ] La navigation et les filtres doivent persister dans l'URL
- [ ] Décoration des PR avec les résultats de l'analyse et les échecs du Quality Gate. C'est une fonctionnalité activable depuis la vue d'administration.
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
