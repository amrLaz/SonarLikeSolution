---
title: Code, composants et branches P3
description: Navigation au commit analysé et gestion des périmètres versionnés sans copie de sources.
---

# Code, composants et branches

L’onglet **Code** réutilise les sélections de projet, branche et analyse.
La liste `/api/v1/code/analyses/{id}/files` affiche les chemins au SHA analysé,
leur type (source, test, généré, tiers), le nombre de findings et les totaux de
couverture reçus. Le filtre est un préfixe de chemin, par exemple `apps/api/`.
La navigation reste paginée explicitement, 50 fichiers par défaut (maximum 100).

Avec `repository_files` publié par la CI, l’inventaire provient de l’arbre Git.
Sans lui, la vue annonce qu’elle se limite aux fichiers cités dans les rapports.
Un fichier sans finding reste consultable lorsque présent dans l’inventaire Git.
Sans rapport SARIF complet, le compteur de findings reste « Non mesuré »,
jamais zéro. Les totaux de couverture restent inconnus si un rapport de
couverture déclaré manque ou échoue ; le détail conserve les annotations reçues.
L’API applique le périmètre de composant figé dans l’import, sans l’étendre selon
la configuration courante du projet.

Le détail `/api/v1/code/analyses/{id}/file?path=…` superpose les annotations
reçues par ligne : couverture couverte/non couverte/non mesurée et occurrences
avec producteur, règle, catégorie, sévérité et message. Les liens Azure DevOps
ciblent le SHA et la ligne ; un lien manquant reste indisponible. La page annonce
la borne de 500 findings par page de lignes lorsqu’elle est atteinte.
Seules les lignes annotées apparaissent ; aucun code source n’est copié ou
reconstitué à partir d’un message de scanner. Les détails purgés retournent 410.

Le panneau de qualité détaillée complète cette lecture avec les mesures des
rapports : couvertures lignes/branches/conditions distinctes, répertoires,
blocs dupliqués et leurs deux localisations, taille et complexité mesurées.
Les absences de mesure ne deviennent pas zéro.

## Gestion du composant

Le panneau **Composant, références et branches** consulte :

- `GET /api/v1/code/projects/{key}/versions` pour les versions publiées paginées ;
- `GET /api/v1/code/projects/{key}/configuration` pour l’affectation et sa baseline ;
- `GET /api/v1/code/projects/{key}/branches` pour les branches observées paginées.

Un administrateur publie une version immutable via `POST …/versions`, puis
l’affecte via `PUT …/configuration` avec `{ "version": "…" }`.
Le formulaire précise dépôt HTTPS, composant, branche principale et référence :
dernière analyse importée d’une branche exacte, ou analyse de référence fixe
appartenant au projet. Une baseline absente est signalée. Aucun résultat global
ne remplace une comparaison indisponible.

Les listes de chemins utilisent **un fichier exact ou un préfixe de répertoire
terminé par `/`**, pas des globs. Une inclusion vide inclut tout le dépôt ;
les exclusions sont prioritaires. Les listes tests, généré et tiers identifient
ces périmètres séparément. Les chemins sont relatifs, sans traversée, au maximum
200 entrées par liste. Le formulaire peut reprendre une version publiée pour
en préparer une nouvelle avec un autre identifiant ; il ne modifie jamais la
version source. Réaffecter une ancienne version permet le retour arrière.

L’export de configuration relit la référence et télécharge son SHA figé et sa
version. Le client canonique consomme ce fichier avec `--code-configuration`.
Le manifeste explicite `code_scope_version`, cible Git et inventaire des chemins
au commit analysé, limité à 100 000 chemins. Si la baseline change avant la
création de l’import, le serveur refuse la comparaison obsolète.

L’archivage `PUT …/branches` utilise `{ "branch": "refs/heads/…", "archived": true }`.
C’est un état de classement réversible : aucune suppression Git, analyse ou
décision n’est déclenchée. Les tableaux distinguent branche principale et archive.
Les écritures nécessitent les droits administrateur et l’accès projet ; les
lecteurs autorisés conservent la consultation. Les erreurs API restent visibles.

## Validation

Les composants réutilisent HTML natif, tableaux défilants accessibles au clavier,
états chargement/erreur/vide distincts et clés de requêtes par analyse/projet/page.
Le changement de projet ou d’analyse remonte le composant et remet sa sélection
locale à zéro. La vérification frontend suit la recette de [l’interface](interface.md).
La validation navigateur et le pilote Azure restent distincts du typage et des
tests de contrat.
