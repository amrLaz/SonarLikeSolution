# Design system — CodeInsights

Référence obligatoire pour toute modification d'interface dans ce dépôt, y compris celles réalisées par un agent IA. Lire ce document avant de modifier un écran, un composant, ses styles ou ses états. Une nouvelle fonctionnalité doit adopter ce système ; un skill générique de design ne justifie pas de changer l'identité du produit.

## Direction et sources

Interface de gouvernance **claire, technique et légèrement futuriste**, destinée aux développeurs et aux équipes qualité/sécurité. Le caractère technique vient de la composition, des contours précis et des références monospace. Priorités : lisibilité des résultats, contexte explicite, actions accessibles et densité utile.

- Afficher le nom produit CodeInsights, conserver la marque Upcoop, les libellés de navigation et les parcours existants, sauf demande explicite de changement.
- Thème exclusivement clair, y compris lorsque le système d'exploitation préfère un thème sombre. Ne pas introduire de dark mode automatique ou de section inversée.
- Pas de néon, glow, glassmorphism fort, gradients flashy, animation permanente ou décoration de type terminal fictif.
- Réglages de référence : variation visuelle **4/10**, mouvement **2/10**, densité **6/10**. Ne pas transformer les écrans métier en landing pages.

| Source | Rôle |
| --- | --- |
| [styles.css](apps/web/src/styles.css) | Tokens CSS partagés, contrôles et mise en page globale |
| [components](apps/web/src/components/) | Composants existants et leurs styles locaux |
| [metric-display.ts](apps/web/src/metric-display.ts) | Présentation des mesures absentes, verdicts et coordonnées des courbes |
| [Interface](docs/interface.md) | Comportements, limites et commandes de validation |
| [Roadmap](docs/roadmap.md) | Capacités futures ; ne pas les présenter comme disponibles |

Ce document définit les règles à respecter ; le CSS les implémente. Les valeurs ci-dessous reflètent le thème actuel. Lors d'une évolution visuelle demandée, mettre à jour le code et ce document ensemble.

## Couleurs et tokens

Utiliser `var(--token)` dans les styles globaux et locaux. Ne pas recopier les valeurs hexadécimales dans les composants ou créer une palette propre à un écran. Les couleurs d'une marque tierce, par exemple le logo Microsoft, restent celles de cette marque.

| Usage | Token | Valeur actuelle |
| --- | --- | --- |
| Action principale, sélection, focus | `--primary` | `#005eb8` |
| Survol d'action principale | `--primary-dark` | `#004a94` |
| Fond sélectionné | `--primary-light` | `#eaf2fb` |
| Fond de page | `--bg-light` | `#f2f5f9` |
| Surface | `--bg-lighter` | `#ffffff` |
| Bordure | `--border` | `#d8e1eb` |
| Texte principal | `--text-primary` | `#172a41` |
| Texte secondaire | `--text-secondary` | `#516278` |
| Texte tertiaire | `--text-tertiary` | `#586b80` |
| Réussite / fond | `--success` / `--success-light` | `#197047` / `#eaf6ef` |
| Avertissement / fond | `--warning` / `--warning-light` | `#876000` / `#fff5dc` |
| Erreur / fond | `--danger` / `--danger-light` | `#b42332` / `#fff0f1` |

Le bleu est l'accent de navigation et d'action ; vert, ambre et rouge sont réservés aux états sémantiques. Accompagner chaque état d'un texte, jamais de la seule couleur. Réutiliser `--shadow-sm`, `--shadow-md` et `--shadow-lg` pour les ombres légères ; réserver l'ombre la plus forte aux surfaces élevées comme les dialogues.

## Typographie, rythme et composition

- Le nom produit CodeInsights reste visible à toutes les largeurs. Sur les écrans d'authentification, il conserve les 28 px existants ; dans le bandeau mobile, il se place sous la marque Upcoop.

- Réutiliser la police système sans serif définie sur `body`. Aucune nouvelle police externe ni dépendance typographique.
- Employer `--font-mono` (`ui-monospace`, Cascadia Code, Consolas, monospace) et les chiffres tabulaires pour mesures, commits, règles et références de code. Les messages « Non disponible » restent en police de lecture.
- Titres de page : échelle actuelle `clamp(1.4rem, 2vw, 1.85rem)`. Texte des contrôles et listes : généralement 13–14 px ; métadonnées : 12–13 px. Ne pas appliquer une taille de hero aux écrans métier.
- Réutiliser le rythme existant : gaps de 0,5 / 0,75 / 1 / 1,5 / 2 rem ; padding de surface de 1 à 1,5 rem ; marge de page de 2 rem sur grand écran, 1 rem sur mobile.
- Bordures fines de 1 px ; rayons de 4–6 px pour petits contrôles et badges, 8 px pour cartes, 10 px pour dialogues. Éviter les cartes imbriquées et les bordures décoratives répétées.
- Conserver l'ordre : navigation/session/connexion API → titre et contexte projet/branche → périmètre et actions → verdict, état technique, commit/date → mesures et détails.
- Utiliser CSS Grid, `minmax(0, 1fr)` et `min-width: 0` pour les colonnes rétractables. Le cadre principal reste borné à 1440 px. Les noms de projet, branches et chemins longs doivent se replier sans élargir la page.

## Composants et interactions

Les écrans métier de `apps/web/src/components/` possèdent leur présentation, leurs formulaires et leurs états d'interaction. App conserve la session, la navigation et les sélections communes ; les données serveur appartiennent à TanStack Query. Réutiliser notamment `AnalysisEvidence` et `MetricGrid` pour les preuves et mesures. Cette séparation ne change pas le système visuel : boutons, formulaires, tableaux et dialogues restent HTML natifs avec les tokens CSS partagés.

| Besoin | Règle |
| --- | --- |
| Navigation | Réutiliser `.main-tabs` / `.main-tab`, état actif explicite et `aria-current`. Sur petit écran, défilement local de la navigation. |
| Actions | Boutons HTML natifs ; `.primary` pour l'action principale, contrôles neutres pour les actions secondaires, traitement danger uniquement pour une action destructive. |
| Formulaire | Libellé associé à chaque champ, état désactivé ou lecture seule visible, retour d'erreur explicite. Préférer `<select>` aux menus personnalisés. |
| Mesures | Réutiliser `.metric-grid` / `.metric-card` et les helpers de présentation. Conserver dimensions distinctes, unité visible et absence de donnée explicite. |
| Listes et tableaux | Réutiliser les styles existants ; sélection activable au clavier. Placer les tableaux larges dans `.table-wrap`, avec zone défilable accessible au clavier et nom accessible. |
| Courbes | Afficher périmètre et échelle ; interrompre les segments aux valeurs absentes. Fournir un tableau des valeurs exactes en alternative. |
| Dialogue | Utiliser `<dialog>` et `showModal()`, un titre accessible, Échap selon l'état de l'opération, et retour du focus au déclencheur. Ne pas recréer un piège de focus. |
| Retour utilisateur | Distinguer chargement, erreur, absence de données, filtre sans résultat et succès. Utiliser `role="status"` ou `role="alert"` selon le cas ; une erreur réseau ne devient pas un état vide rassurant. |

Les transitions servent au retour d'interaction : **durée de référence de 150 ms**, sur couleur, bordure ou fond. Pas de déplacement décoratif des contrôles ni de boucle animée. Respecter `prefers-reduced-motion` en supprimant animations, transitions et défilement doux.

## Accessibilité et confiance

- Tout contrôle fonctionne au clavier. Garder un focus visible, actuellement un contour bleu de 2 px décalé de 3 px, et le lien d'évitement vers le contenu.
- Viser WCAG AA : contraste du texte normal au moins 4,5:1, grand texte et indicateurs nécessaires des contrôles au moins 3:1. Vérifier aussi survol, sélection, champs et messages.
- Ne jamais remplacer une mesure absente par zéro, une estimation ou une donnée de démonstration. Un zéro explicitement reçu reste zéro ; absence, `null` ou valeur non finie donnent « Non disponible ».
- Distinguer verdict qualité (`pass`, `fail`, `unknown`) et état technique de l'analyse. Afficher les motifs transmis sans inventer provenance ou complétude.
- New Code reste indisponible tant que le contrat de mesures réelles n'existe pas. Aucun résultat global de substitution.
- Expliquer le périmètre des compteurs et listes. Ne pas assimiler Issues à l'inventaire Vulnerabilities & IOCs. Les fonctionnalités futures de la roadmap ne deviennent pas des contrôles factices.
- Respecter les droits existants : lecture seule des gates pour les non-administrateurs. Un contrôle désactivé ne remplace jamais l'autorisation serveur.
- Les limites des valeurs déjà produites par l'API sont détaillées dans [Interface](docs/interface.md) ; ne pas prétendre les résoudre par une modification visuelle.

## Règles de contribution pour les agents

1. Lire ce fichier et inspecter l'écran/composant existant avant toute édition ; réutiliser tokens et composants avant d'en créer.
2. Conserver React, CSS natif et les dépendances actuelles. Ne pas ajouter un autre design system, une bibliothèque d'icônes ou d'animation pour une variation esthétique.
3. Modifier les règles CSS concernées plutôt qu'empiler des overrides ou utiliser `!important` pour masquer un conflit. Les styles dynamiques restent limités aux valeurs dépendantes des données.
4. Appliquer les mêmes conventions aux nouveaux écrans et aux états d'erreur/chargement. Une ancienne divergence du code n'autorise pas à la reproduire.
5. Pour une modification UI, vérifier 390, 768 et 1440 px, les noms longs, clavier/focus, états vides/erreurs et réduction du mouvement. Aucun débordement horizontal global ; le défilement local des tableaux/navigation est autorisé.
6. Exécuter les validations frontend pertinentes décrites dans [Interface](docs/interface.md) et consigner les limites de validation. Ne pas annoncer un contrôle navigateur non effectué.
7. Mettre à jour `docs/` avec le comportement modifié. Toute évolution explicite du design system doit également mettre à jour ce fichier et les styles partagés dans le même changement.
