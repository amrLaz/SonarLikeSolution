# Design system — CodeInsights

Référence obligatoire pour toute modification d'interface dans ce dépôt, y compris celles réalisées par un agent IA. Lire ce document avant de modifier un écran, un composant, ses styles ou ses états. Une nouvelle fonctionnalité doit adopter ce système ; un skill générique de design ne justifie pas de changer l'identité du produit.

## Direction et sources

Interface de gouvernance **claire, technique et légèrement futuriste**, destinée aux développeurs et aux équipes qualité/sécurité. Le caractère technique vient de la composition, des contours précis et des références monospace. Priorités : lisibilité des résultats, contexte explicite, actions accessibles et densité utile.

- Afficher uniquement CodeInsights dans l'appbar ; la société Upcoop figure dans le copyright du footer. Conserver les libellés de navigation et les parcours existants.
- Thème exclusivement clair, y compris lorsque le système d'exploitation préfère un thème sombre. Ne pas introduire de dark mode automatique ou de section inversée.
- Pas de néon, glow, glassmorphism fort, gradients flashy, animation permanente ou décoration de type terminal fictif.
- Réglages de référence : variation visuelle **4/10**, mouvement **2/10**, densité **6/10**. Ne pas transformer les écrans métier en landing pages.

| Source                                              | Rôle                                                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| [styles.css](apps/web/src/styles.css)               | Tokens CSS partagés, contrôles et mise en page globale                 |
| [components](apps/web/src/components/)              | Composants existants et leurs styles locaux                            |
| [metric-display.ts](apps/web/src/metric-display.ts) | Présentation des mesures absentes, verdicts et coordonnées des courbes |
| [Interface](docs/interface.md)                      | Comportements, limites et commandes de validation                      |
| [Roadmap](docs/roadmap.md)                          | Capacités futures ; ne pas les présenter comme disponibles             |

Ce document définit les règles à respecter ; le CSS les implémente. Les valeurs ci-dessous reflètent le thème actuel. Lors d'une évolution visuelle demandée, mettre à jour le code et ce document ensemble.

## Couleurs et tokens

Utiliser `var(--token)` dans les styles globaux et locaux. Ne pas recopier les valeurs hexadécimales dans les composants ou créer une palette propre à un écran. Les couleurs d'une marque tierce, par exemple le logo Microsoft, restent celles de cette marque.

| Usage                               | Token                           | Valeur actuelle       |
| ----------------------------------- | ------------------------------- | --------------------- |
| Action principale, sélection, focus | `--primary`                     | `#005eb8`             |
| Survol d'action principale          | `--primary-dark`                | `#004a94`             |
| Fond sélectionné                    | `--primary-light`               | `#eaf2fb`             |
| Fond de page                        | `--bg-light`                    | `#f2f5f9`             |
| Surface                             | `--bg-lighter`                  | `#ffffff`             |
| Bordure                             | `--border`                      | `#d8e1eb`             |
| Texte principal                     | `--text-primary`                | `#172a41`             |
| Texte secondaire                    | `--text-secondary`              | `#516278`             |
| Texte tertiaire                     | `--text-tertiary`               | `#586b80`             |
| Réussite / fond                     | `--success` / `--success-light` | `#197047` / `#eaf6ef` |
| Avertissement / fond                | `--warning` / `--warning-light` | `#876000` / `#fff5dc` |
| Erreur / fond                       | `--danger` / `--danger-light`   | `#b42332` / `#fff0f1` |

Le bleu est l'accent de navigation et d'action ; vert, ambre et rouge sont réservés aux états sémantiques. Accompagner chaque état d'un texte, jamais de la seule couleur. Réutiliser `--shadow-sm`, `--shadow-md` et `--shadow-lg` pour les ombres légères ; réserver l'ombre la plus forte aux surfaces élevées comme les dialogues.

## Typographie, rythme et composition

- Le nom produit CodeInsights reste visible à toutes les largeurs. Sur les écrans d'authentification, il conserve les 28 px existants ; dans le bandeau mobile, il partage la première ligne avec l'avatar et la déconnexion.

- Réutiliser la police système sans serif définie sur `body`. Aucune nouvelle police externe ni dépendance typographique.
- Employer `--font-mono` (`ui-monospace`, Cascadia Code, Consolas, monospace) et les chiffres tabulaires pour mesures, commits, règles et références de code. Les messages « Non disponible » restent en police de lecture.
- Titres de page : échelle actuelle `clamp(1.4rem, 2vw, 1.85rem)`. Texte des contrôles et listes : généralement 13–14 px ; métadonnées : 12–13 px. Ne pas appliquer une taille de hero aux écrans métier.
- Réutiliser le rythme existant : gaps de 0,5 / 0,75 / 1 / 1,5 / 2 rem ; padding de surface de 1 à 1,5 rem ; marge de page de 2 rem sur grand écran, 1 rem sur mobile.
- Bordures fines de 1 px ; rayons de 4–6 px pour petits contrôles et badges, 8 px pour cartes, 10 px pour dialogues. Éviter les cartes imbriquées et les bordures décoratives répétées.
- Conserver l'ordre : navigation/session → titre et contexte projet/branche → périmètre et actions → verdict, état technique, commit/date → mesures et détails.
- Utiliser CSS Grid, `minmax(0, 1fr)` et `min-width: 0` pour les colonnes rétractables. Le cadre principal reste borné à 1440 px. Les noms de projet, branches et chemins longs doivent se replier sans élargir la page.

## Icône de l'application

L'icône de CodeInsights reprend le bouclier associant code et validation créé pour le Quality Hub : bleu `#005eb8`, texte sombre `#172a41` et blanc, sans dégradé ni ombre. [favicon.svg](apps/web/public/favicon.svg) est la source compacte ; [app-icon.svg](apps/web/public/app-icon.svg) fournit le fond plein et la zone de sécurité des icônes installables. Les PNG et l'ICO sont leurs déclinaisons ; toute évolution doit partir des SVG puis régénérer les formats dérivés.

## Composants et interactions

Les écrans métier de `apps/web/src/components/` possèdent leur présentation, leurs formulaires et leurs états d'interaction. App conserve la session, la navigation et les sélections communes ; les données serveur appartiennent à TanStack Query. Réutiliser `MetricGrid` pour les mesures. Cette séparation ne change pas le système visuel : boutons, formulaires, tableaux et dialogues restent HTML natifs avec les tokens CSS partagés.

| Besoin             | Règle                                                                                                                                                                                                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navigation         | Cinq destinations seulement : Projects, Issues, Rules, Quality Gates et Administration pour les administrateurs. Le détail du code, la revue et l'historique sont intégrés au parcours projet → issue, pas exposés comme vues concurrentes. L'URL porte destination, scope, contexte et filtres métier ; les brouillons et filtres d'administration en sont exclus. Réutiliser `.main-tabs` / `.main-tab`, état actif explicite et `aria-current`. Le nom de destination ne se répète pas dans un bandeau sous l'appbar ; le titre du document suit `CodeInsights - <destination>`. |
| Actions            | Boutons HTML natifs ; `.primary` pour l'action principale, contrôles neutres pour les actions secondaires, traitement danger uniquement pour une action destructive. Un export secondaire unique utilise un bouton icône compact avec `aria-label` et `title` explicites.                                                                                                                                                       |
| Favoris projets    | Utiliser l'étoile texte native `☆` / `★` dans un bouton compact et neutre, sans couleur d'accent supplémentaire. Le bouton expose `aria-pressed`, un nom accessible qui décrit l'action, un focus visible et un état désactivé pendant l'écriture. Les favoris précèdent les autres projets ; leur ordre interne reste alphabétique. |
| Formulaire         | Libellé associé à chaque champ, état désactivé ou lecture seule visible, retour d'erreur explicite. Préférer `<select>` aux menus personnalisés.                                                                                                                                                                           |
| Mesures            | Réutiliser `.metric-grid` / `.metric-card` et les helpers de présentation. Conserver dimensions distinctes, unité visible et absence de donnée explicite.                                                                                                                                                                  |
| Listes et tableaux | Réutiliser les styles existants ; sélection activable au clavier. Placer les tableaux larges dans `.table-wrap`, avec zone défilable accessible au clavier et nom accessible. Les actions de continuation sont placées après leur liste et leur libellé est toujours `Next`.                                                                                                                                              |
| Courbes            | Afficher périmètre et échelle ; interrompre les segments aux valeurs absentes. Regrouper dans une même figure les séries qui partagent le même repère et utiliser des onglets accessibles entre scores, pourcentages et compteurs.                                                                                                                                                                                      |
| Dialogue           | Utiliser `<dialog>` et `showModal()`, un titre accessible, Échap selon l'état de l'opération, et retour du focus au déclencheur. Ne pas recréer un piège de focus.                                                                                                                                                         |
| Retour utilisateur | Distinguer chargement, erreur, absence de données, filtre sans résultat et succès. Utiliser `role="status"` ou `role="alert"` selon le cas ; une erreur réseau ne devient pas un état vide rassurant.                                                                                                                      |

Les transitions servent au retour d'interaction : **durée de référence de 150 ms**, sur couleur, bordure, fond ou opacité. Le splash de démarrage constitue l'unique séquence plus longue : 600 ms de présence suivies d'un fondu de 150 ms, pendant que React et ses requêtes démarrent en arrière-plan. Les changements entre les cinq destinations principales utilisent une entrée perceptible de 220 ms combinant opacité et translation verticale de 10 px ; l'appbar, les contrôles globaux, l'authentification, le scope et les sous-vues d'administration restent fixes. Pas de déplacement décoratif des contrôles ni de boucle animée. Avec `prefers-reduced-motion`, le splash reste statique puis disparaît sans fondu, et les autres animations, transitions et défilements doux sont supprimés.

Les textes de l'application sont en anglais, y compris les libellés, aides, états vides, dialogues et noms accessibles. La documentation du dépôt reste en français.

## Accessibilité et confiance

- Tout contrôle fonctionne au clavier. Garder un focus visible, actuellement un contour bleu de 2 px décalé de 3 px, et le lien d'évitement vers le contenu.
- Viser WCAG AA : contraste du texte normal au moins 4,5:1, grand texte et indicateurs nécessaires des contrôles au moins 3:1. Vérifier aussi survol, sélection, champs et messages.
- Ne jamais remplacer une mesure absente par zéro, une estimation ou une donnée de démonstration. Un zéro explicitement reçu reste zéro ; absence, `null` ou valeur non finie donnent « Non disponible ».
- Distinguer verdict qualité (`pass`, `fail`, `unknown`) et état technique de l'analyse. Afficher les motifs transmis sans inventer provenance ou complétude.
- New Code affiche uniquement la comparaison Git et les mesures renvoyées par son endpoint dédié. Si cette comparaison est indisponible, conserver le motif explicite ; aucun résultat global de substitution.
- Les preuves de gate distinguent périmètre global/nouveau code et état non applicable ; afficher les fractions et références Git reçues. Issues expose les liens de code au commit analysé et la documentation déclarée par le producteur, avec provenance et absence explicites. Ne jamais composer un aperçu de source à partir du message d'un finding.
- Les cartes Issues utilisent un contour et un badge sémantiques distincts pour Blocker, High, Medium, Low et Info ; le texte de criticité reste obligatoire. Le dashboard reprend ces mêmes niveaux comme liens vers la liste préfiltrée.
- Une définition de règle reste externe : préférer le lien fourni par le producteur, sinon construire uniquement un lien déterministe vers un référentiel public reconnu (Microsoft Learn, MITRE CWE, NVD, ESLint ou StyleCop). Ne pas stocker ni inventer une explication locale.
- Issues est l'unique entrée vers un problème : localisation au SHA, lien source, annotations, définition externe, assignation et décision de revue utilisent une divulgation progressive dans la même carte.
- Projects affiche les métriques comme surfaces cliquables vers Issues préfiltrée. Leur survol et leur focus teintent la surface et affichent un contour intérieur sans déplacer le contenu. Les boutons de criticité, les cartes de branches répétées et les panneaux techniques d'import/SBOM ne sont pas dupliqués dans le dashboard.
- Les références de branche, commit et pull request ouvrent le dépôt configuré sur la révision exacte lorsque le fournisseur est reconnu. Elles restent du texte lorsque l'intégration projet ne fournit pas un lien sûr.
- Le catalogue producteur est distinct des règles observées. L'affectation de profil présente d'abord son impact ; les preuves d'analyse affichent l'empreinte effective et les décisions de revue figées, sans réécrire l'historique.
- Rules conserve un seul défilement de page. Le détail peut rester sticky sur bureau mais repasse sous la liste sur mobile ; configuration, exceptions et catalogue technique restent dans une zone avancée repliée.
- Quality Gates sépare la définition du gate de ses affectations. Créer ou modifier ouvre un brouillon local explicite avec Save/Cancel ; aucune mutation ne part avant validation.
- Expliquer le périmètre des compteurs et listes. Les catégories vulnérabilité, secret, dépendance, code et IOC sont des filtres d'Issues, pas une vue concurrente. Les fonctionnalités futures de la roadmap ne deviennent pas des contrôles factices.
- Respecter les droits existants : lecture seule des gates pour les non-administrateurs. Un contrôle désactivé ne remplace jamais l'autorisation serveur.
- Les limites des valeurs déjà produites par l'API sont détaillées dans [Interface](docs/interface.md) ; ne pas prétendre les résoudre par une modification visuelle.

## Règles de contribution pour les agents

1. Lire ce fichier et inspecter l'écran/composant existant avant toute édition ; réutiliser tokens et composants avant d'en créer.
2. Conserver React, CSS natif et les dépendances actuelles. Ne pas ajouter un autre design system, une bibliothèque d'icônes ou d'animation pour une variation esthétique.
3. Modifier les règles CSS concernées plutôt qu'empiler des overrides ou utiliser `!important` pour masquer un conflit. Les styles dynamiques restent limités aux valeurs dépendantes des données.
4. Appliquer les mêmes conventions aux nouveaux écrans et aux états d'erreur/chargement. Une ancienne divergence du code n'autorise pas à la reproduire.
5. Pour une modification UI, vérifier 390, 768 et 1440 px, les noms longs, clavier/focus, états vides/erreurs et réduction du mouvement. Aucun débordement horizontal global ; le défilement local des tableaux est autorisé ; la navigation utilise son menu de débordement.
6. Exécuter les validations frontend pertinentes décrites dans [Interface](docs/interface.md) et consigner les limites de validation. Ne pas annoncer un contrôle navigateur non effectué.
7. Mettre à jour `docs/` avec le comportement modifié. Toute évolution explicite du design system doit également mettre à jour ce fichier et les styles partagés dans le même changement.

## Appbar, aides et footer

- Appbar compacte : nom CodeInsights unique, avatar initiales (la session ne fournit pas de photo), nom complet accessible au survol et au focus, déconnexion par bouton icône nommé. Aucun badge API ni rôle technique à côté du nom.
- Remplacer les descriptions introductives par un badge information utile, accessible au survol, au focus et au toucher, refermable avec Échap. Conserver visibles erreurs, avertissements métier, mesures absentes et périmètres nécessaires à leur interprétation.
- Tous les champs natifs, y compris sans attribut type et les dates/heures, utilisent les tokens des formulaires. Les cases à cocher et radios gardent leur forme native.
- Les formulaires d'administration occasionnels utilisent la divulgation progressive. Une navigation horizontale peut rester défilable au clavier et au toucher, sans barre de défilement visuelle parasite.
- Footer dans le flux, repoussé en bas des pages courtes : copyright Upcoop, année courante et version injectée au build Docker depuis le tag Git. Il ne recouvre jamais les contenus.

Le badge information reste toujours à droite du titre ou du texte existant auquel il se rapporte, sur la même ligne. Regrouper les aides d'une section au même endroit ; ne pas créer des libellés ou lignes de texte uniquement pour porter un badge. Les sous-titres redondants, notamment « All projects » sous le titre principal, sont supprimés.
