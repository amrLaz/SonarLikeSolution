---
title: Interface du hub
description: Refonte claire et technique, affichage des mesures et vérification du frontend.
---

# Interface du hub

## Design et parcours

Le [design system](../DESIGN.md), référencé dans [AGENTS.md](../AGENTS.md), fixe les règles obligatoires pour les agents et contributeurs : tokens, typographie, composition, composants, accessibilité et critères de vérification. Cette page décrit les comportements et limites de l'interface.

L'interface utilise React, les composants natifs et la marque Upcoop. Le thème est exclusivement clair : fond gris froid, surfaces blanches, bleu `#005eb8`, contours fins et ombres légères. Les références Git et les mesures utilisent une police monospace système. Les transitions durent 150 ms et sont désactivées avec `prefers-reduced-motion`.

L'en-tête sépare marque, navigation, session et connexion API. Le titre de l'écran et le contexte projet/branche précèdent les résultats. Projects présente ensuite le verdict, l'état technique, le commit, la date, les motifs d'échec transmis et les mesures. Le compteur latéral porte sur la dernière analyse de chaque projet, toutes branches confondues ; les cartes All Projects décrivent l'historique d'analyses du projet.

Les formulaires, listes, filtres, états vides et erreurs suivent les mêmes styles. Sur petit écran, les grilles se replient et les navigations/tableaux larges défilent dans leur propre zone. Les sélections de branche sont natives, les cartes projets et titres de règles sont activables au clavier. Un lien d'évitement mène au contenu. Les dialogues utilisent `showModal()` pour rendre le fond inerte ; Échap ferme le dialogue hors sauvegarde/suppression en cours et restitue le focus au bouton d'ouverture.

Le navigateur utilise le titre et le nom d'application « CodeInsights », une favicon SVG avec repli ICO, une icône Apple Touch et un manifest avec icônes 192×192 et 512×512 compatibles `maskable`. Les fichiers de `apps/web/public` sont copiés dans le build Vite par le Dockerfile. Aucun fonctionnement hors ligne n'est annoncé.

Les sept assets originaux de la tâche « Ajouter favicon et assets SPA » ont été récupérés depuis l'image locale `quality-hub:web-assets-check` ; les six fichiers graphiques sont conservés à l'identique, seuls les noms du manifest sont adaptés à CodeInsights.

## Données serveur et formulaires

Le frontend utilise React/React DOM **19.2.8**, TanStack Query **5.102.8**, TypeScript et Vite. Les types React **19.2.18** et React DOM **19.2.7** sont déclarés avec ces dépendances dans le [Dockerfile](../Dockerfile). Le manifeste reste généré pendant le build ; l'installation utilise encore `npm install`, sans lockfile consommé par ce stage.

Chaque connexion ou déconnexion remonte l'arbre de session avec un nouveau `QueryClient`. Les lectures précédentes sont annulées ; leurs résultats ne sont pas réutilisés par la nouvelle identité. Le cache des gates dans `localStorage` est retiré. Les clés de requête décrivent les ressources, l'analyse ou les filtres appliqués, sans inclure de token. La fraîcheur est de 30 secondes, sans retry automatique ni relecture déclenchée par le focus ou la reconnexion réseau. Une invalidation après mutation ou une action explicite de rafraîchissement permet de relire les données.

Le client HTTP partagé conserve `fetch`, ajoute le Bearer et rejette les réponses non-2xx, y compris lorsqu'elles ne contiennent pas de JSON. Une suppression refusée, un nettoyage en échec ou une erreur de lecture ne deviennent ni un succès ni une liste vide. Les composants affichent séparément chargement, erreur, absence de données et résultat sans correspondance.

- **Journal d'audit** : les champs saisis restent distincts des filtres appliqués. Apply, également accessible par Entrée, repart de la première page ; Load more utilise les filtres appliqués. Chaque jeu de filtres possède ses propres pages. Le tableau conserve une zone défilante nommée et accessible au clavier.
- **Notifications** : webhook et SMTP utilisent un formulaire natif, des champs requis selon le type, une URL HTTP(S), des adresses email et un port de 1 à 65535. Les doubles soumissions sont bloquées pendant l'opération ; un échec conserve le brouillon. Création, activation et suppression rafraîchissent la liste après succès ; les erreurs du test d'envoi sont explicites.
- **Quality Gates** : l'éditeur attend les lectures du catalogue et des affectations. Une erreur de ces lectures est affichée et désactive les mutations. Le brouillon appartient au gate sélectionné et reste prioritaire sur les relectures ; changer de gate abandonne ce brouillon. Un champ numérique effacé reste vide jusqu'à la validation du formulaire, sans conversion implicite en zéro. Scores : 0–100 ; compteurs vulnérabilités/hotspots/bugs : 0–10000 ; code smells : 0–100000, tous entiers.
- **Paramètres et fournisseurs** : les changements de paramètres sont un brouillon partiel superposé aux données serveur ; une sauvegarde retire uniquement les champs enregistrés de ce brouillon. La configuration d'un fournisseur d'authentification est initialisée à sa sélection, avec une référence qui empêche un refetch du même fournisseur d'écraser la saisie. Les brouillons restent locaux et disparaissent avec leur écran ou leur session.
- **Tokens CI et suggestions IA** : le token généré reste dans le résultat de la mutation de l'écran, avec collecte immédiate lorsque cette mutation devient inactive ; il n'est pas persisté dans un cache de lecture. Les suggestions IA sont dans le cache des mutations, identifiées par analyse et finding : masquer puis réafficher une carte conserve le résultat ou le chargement tant que ce cache existe. Une erreur IA reste visible et permet une nouvelle tentative.

## Lecture des résultats

- **Mesures** : un nombre fini explicitement reçu, y compris zéro, est conservé. Une valeur absente, `null` ou non finie s'affiche « Non disponible ». Le navigateur n’estime pas fiabilité, couverture, duplication ou compteurs manquants.
- **New Code** : lit la comparaison de l’analyse sélectionnée, sans recalcul navigateur. Affiche nouveaux, persistants, résolus, indéterminés et couverture des lignes modifiées. Baseline absente, détails purgés ou profils incompatibles affichent le motif reçu ; aucun résultat global de substitution. Les profils d'ingestion acceptent des conditions `new_code` ; l'éditeur historique Quality Gates conserve son périmètre global.
- **Verdict** : `pass`, `fail` et `unknown` sont distincts. Le statut d'exécution `queued`, `running`, `completed` ou `failed` et l'état technique P0 `success`, `failed` ou `incomplete` sont présentés séparément. Le détail Projects montre la complétude, les états `measured`/`absent`/`failed`/`not_measured`, les exécutions d'outils et les conditions de l'instantané du gate. l'interface ne reconstruit ni seuil ni provenance.
- **Evolution** : les valeurs manquantes interrompent les segments des courbes. Les compteurs ont une échelle adaptée aux valeurs reçues ; les pourcentages et scores restent sur 100. Un tableau défilable au clavier donne chaque valeur, commit, date, état technique et verdict.
- **Issues** : projet, branche et analyse sont sélectionnés explicitement. La liste et ses compteurs portent uniquement sur les findings détaillés de cette analyse. Un total par fichier est un résumé et ne crée pas de finding détaillé. Les catégories `secret`, `dependency`, `code`, `ioc` et `unknown` ainsi que l'outil sont ceux transmis par le serveur, sans classement par le texte de la règle.
- **Vulnerabilities & IOCs** : cet onglet reprend la même sélection d'analyse que Issues et en affiche le projet, la branche et le commit. Les dépendances/code, les secrets et les IOC sont présentés dans trois vues séparées à partir de la catégorie serveur ; la catégorie inconnue reste dans la vue dépendances/code. TOTAL compte les entrées effectivement retournées dans ce périmètre. Les compteurs absents et le CVSS manquant sont explicites. Le frontend ne reclasse pas les secrets en CVE ou inversement à partir d'heuristiques de texte.
- **Quality Gates** : création, modification, suppression, affectation, suppression de règles et suggestion IA suivent `permissions.is_admin` relu par `/api/v1/auth/me`. Les autres utilisateurs consultent les données en lecture seule, même si un rôle obsolète subsiste dans la session locale. Le repli utilise le gate reçu de l'API.
- **Accès explicites** : Administration > Access Management charge les catalogues d'organisations et de projets depuis l'API. L'administrateur remplace en une opération les grants d'un utilisateur ; une sélection vide laisse un non-administrateur sans accès projet. Un grant d'organisation et un grant de projet restent affichés séparément.
- **Tokens CI** : la création exige au moins un projet et envoie les scopes fixes `analysis:read`, `analysis:write` et `integration:write`. L'historique affiche projets, scopes, expiration et révocation ; un token actif peut être révoqué explicitement. Plusieurs tokens indépendants peuvent coexister.

Les lectures Rules, Issues, Vulnerabilities et ProjectManager signalent les erreurs HTTP et ignorent les réponses devenues obsolètes lors d'un changement de contexte. ProjectManager conserve ses actions de création/rétention, affiche leurs erreurs et annonce le chargement des branches ; ce composant n'est actuellement pas monté dans App.

Les exports PDF/CSV sont téléchargés par le client avec le Bearer de la session ; les routes d’export exigent une authentification.

L'API ASP.NET Core 10 fournit les données consommées par React. [ExportService](../apps/api/Services/ExportService.cs) produit les CSV et PDF avec PDFsharp/MigraDoc et une police embarquée pour Linux.

Le composant ProjectManager n'étant toujours pas monté dans App, ses champs organisation et profil d'analyse ne sont pas présentés comme disponibles. Le contrat `GET /api/v1/projects` les expose pour une intégration ultérieure à cet écran.

l'automatisation par groupes Entra/App Roles appartient à un lot ultérieur. Le démarrage de connexion Entra utilise `credentials: include` pour conserver le cookie HttpOnly qui lie la transaction OIDC au navigateur. Le callback renvoie la session dans le fragment d'URL afin de l'exclure des requêtes HTTP et en-têtes Referer, puis le frontend efface l'URL. En développement, l'URL API `http://127.0.0.1:8000` est cross-origin par rapport à Vite et un cookie `SameSite=Lax` peut ne pas être renvoyé ; le parcours OIDC complet doit alors être validé derrière le proxy same-origin utilisé en production.

## Limites

Les profils P0 historiques restent disponibles. L’éditeur P1 permet de publier une définition JSON versionnée, de l’affecter explicitement à un projet et de créer une exception motivée avec expiration ; ces écritures sont réservées aux administrateurs. Les décisions collaboratives P2 ne changent pas le verdict automatique des gates.

## Collaboration et portefeuille P2

L’onglet **Collaboration** consulte les findings durables, y compris après purge des rapports détaillés. Les filtres projet, branche exacte, équipe, état effectif et « Mes problèmes » sont appliqués au serveur avant pagination. Les tableaux annoncent leur périmètre de page. Issues propose les mêmes filtres collaboratifs en complément de ses filtres de scanner ; ouvrir un détail permet de consulter le suivi ou de matérialiser explicitement celui d’une ancienne occurrence. Les anciens scans ne sont pas tous adoptés au chargement de la liste.

Le suivi affiche responsable, équipe, état, revue distincte des hotspots, date d’observation et identité. Une empreinte scanner permet la continuité ; le repli sur la localisation exacte est annoncé car un déplacement peut créer un autre finding. La résolution et la réouverture sont des décisions explicites ; une absence au scan n’est pas présentée comme une résolution. Les états faux positif et risque accepté exigent une revue administrateur, un motif et une expiration future d’un an maximum, limitée au finding/projet/branche. Leur expiration rend l’état effectif ouvert. Ces décisions restent indépendantes des exceptions P1 de profil et du gate automatique.

L’édition conserve un brouillon avec sa version. Une réponse 409 affiche un conflit, sans écraser la saisie ; « Recharger et abandonner la saisie » permet de repartir des données serveur. Les commentaires et décisions sont paginés et conservent auteur, motif, date et instantané. Les catalogues de personnes et équipes proposent des pages explicites de 50 entrées ; la personne ou équipe assignée reste représentée lorsqu’elle est hors page. L’administration peut créer une équipe et définir le propriétaire initial des nouveaux findings du projet. Les contrôles complètent les autorisations serveur. Les liens `?finding_id=…` ouvrent directement le suivi après connexion et restent utilisables après la purge des détails.

Les abonnements portent sur un projet, une équipe sélectionnée ou un finding. La boîte personnelle affiche les changements significatifs, permet de marquer une notification comme lue et de retirer un abonnement. Il s’agit de notifications dans CodeInsights ; un abonnement ne configure aucun email ou webhook. Un finding peut déclencher explicitement la création asynchrone d’un Work Item Azure Boards ; l’interface distingue demande enregistrée, état de livraison, lien obtenu et erreurs de synchronisation. La configuration administrateur réutilise une intégration Azure DevOps existante et le projet lié au dépôt. Le pilote Azure réel demeure distinct de la validation locale.

L’onglet **Portefeuille** filtre organisation, équipe propriétaire, projet, branche, commit et période ; il propose l’historique ou la dernière synthèse par projet/branche. Les dimensions, leurs états de mesure, la complétude, la fraîcheur, la référence de comparaison et les ruptures de profil/formule sont affichés séparément. Les objectifs administrateur gardent le périmètre et les versions de la synthèse. Les liens `?tab=portfolio&portfolio_…` restituent les filtres appliqués. L’export JSON authentifié parcourt explicitement les pages du périmètre demandé et inclut les versions et métadonnées ; il peut être annulé et est interrompu à la sortie de l’écran. Les synthèses restent consultables lorsque les rapports détaillés ont été purgés. Evolution conserve sa vue de la page d’analyses sélectionnée ; ses courbes interrompent désormais les segments lors d’une rupture ou absence de versions, et le tableau donne ces versions.

## Consultations P1

P3 ajoute l'onglet [Code et périmètres](p3-code-scopes.md), avec sélecteurs
projet/branche/analyse, fichiers au SHA, annotations de ligne et [mesures
détaillées](p3-code-quality.md). Les tableaux paginés restent accessibles au
clavier. Le catalogue producteur, l'export natif et l'aperçu avant affectation
se trouvent dans [Rules/profils](p3-profiles.md). Collaboration présente la file
hotspots, les correspondances Git et les [décisions de revue](p3-security-review.md).
Preuves de calcul affiche dérive de configuration, estimation de remédiation
et décisions utilisées par le gate, avec absence explicite des données.

L'incrément [P3 nouveau code](p3-new-code.md) ajoute les scopes de condition
`global`/`new_code` aux profils d'ingestion. Preuves de calcul affiche le scope,
la baseline, les SHA, la fraction de couverture et le motif ; une condition
non applicable est distincte d'une réussite et d'une mesure absente. La
configuration historique Quality Gates reste globale pour le parcours legacy.

Issues affiche les [preuves SARIF](p3-evidence.md) et les liens de fichier
au commit analysé transmis par le serveur. L'aperçu fabriqué à partir du message
est supprimé : seul le message du rapport est montré. La documentation de règle
est un lien déclaré par le producteur, avec version/provenance et absence
explicites ; les localisations secondaires et flux reçus restent consultables.
Un SHA ou un chemin non prouvé ne produit aucun repli vers une branche mutable.

Projects utilise `/api/v1/insights/summary` : agrégats par projet et branche calculés sur le serveur, avec uniquement leur dernière analyse. L’historique sélectionné utilise `/insights/analyses` avec projet, branche et curseur. Les pages contiennent 50 analyses ; les contrôles « Analyses précédentes » et « Première page » sont explicites. Evolution représente uniquement la page d’historique annoncée, sans télécharger toutes les pages. Les branches et compteurs globaux viennent des synthèses, jamais d’un sous-ensemble d’historique.

Issues utilise les occurrences normalisées de l’analyse choisie ; les filtres catégorie, sévérité, règle et fichier s’appliquent au serveur avant pagination. Rules utilise les agrégats des occurrences de la dernière analyse de chaque projet, avec filtres serveur et pages explicites. Les suppressions globales historiques ne sont pas proposées sur ce catalogue : les exceptions P1 se configurent dans le panneau de profils.

Projects présente également les imports paginés du projet (état, révision, verdict qualité et résultat technique) et les composants SBOM paginés de l’analyse sélectionnée. L’inventaire conserve versions, identifiants, relations, licences, décisions et provenance. Un tableau vide ne constitue pas une mesure d’absence de CVE. Les détails purgés produisent une erreur explicite. « Actualiser les imports » relit ces ressources sans relancer d’analyse.

Les liens `?analysis_id=…` chargent l’analyse autorisée, sélectionnent son projet/branche et ouvrent Issues. Si elle est hors de la première page, elle est ajoutée explicitement à cette sélection sans télécharger tout l’historique. Le reçu d’import détaille les rapports déclarés, reçus et leurs erreurs.

Les collections d’analyses, findings, règles et composants restent des tableaux JSON et annoncent une continuation via `X-Next-Cursor` et `Link`. Le client ne suit aucune page automatiquement. Les erreurs de lecture restent distinctes de l’absence de données. Les synthèses de projets, branches, imports et profils utilisent également des pages de 50, maximum 100, avec contrôles de continuation explicites. Les branches ont un endpoint dédié `/insights/branches?project_key=…` avec curseur et filtre exact `branch` ou préfixe `prefix`. Les synthèses ne matérialisent aucune collection de branches : elles renvoient `branch_count`, `branches: []` et `branches_truncated` lorsque des branches existent ; les sélecteurs utilisent leur propre page de 50 branches, plus la branche sélectionnée si elle est hors page. Les totaux projet couvrent toujours toutes ses branches. Les compteurs Projects portent sur les projets de la page et le projet sélectionné s’il est hors page ; ils ne prétendent pas représenter tous les projets autorisés.

Validation P1 locale : typage TypeScript avec `--noUnusedLocals` et les quatre checks Node existants réussis dans le stage frontend, sources montées à `/build/src`. Le check HTTP partagé couvre aussi l’extraction d’un curseur et une page finale sans continuation. Les consultations SQL ont été exercées sur PostgreSQL local : synthèses, règles, analyses, findings, composants et comparaison retournent 200 ; deux pages de deux analyses ne se recouvrent pas ; curseur, date, limite et périmètre invalides retournent 422. Une traduction EF produisant `count(DISTINCT *)` a été corrigée en distinct scalaire. Le navigateur intégré étant indisponible, Chrome a vérifié la connexion réelle locale, Projects/Rules à 390 px, Rules/Issues à 768 px, Issues à 1440 px, filtres sans résultat, 30 findings et changement de page d’historique de 50 à 15 analyses, sans débordement global. Le motif New Code `git_history_unavailable` reste visible. Après redémarrage, `tests/insights.check.mjs` a vérifié les bornes et continuations des analyses, profils, imports et synthèses, ainsi que les lectures détaillées et les refus 422. Dans Chrome, le lien vers une analyse ancienne a conservé sa sélection après connexion (51 entrées explicitement annoncées), la page suivante d’imports a été chargée et un JSON de profil invalide a conservé son brouillon avec une alerte. Le passage clavier au bouton de publication présente un contour de focus visible. Un projet isolé `check-branches` contenant 101 branches a validé les pages serveur 50/50/1 sans doublon et le total 101 sans détails imbriqués en synthèse. Dans Chrome, la branche sélectionnée 101 reste disponible hors page, puis devient l’unique option de la dernière page sans continuation. L’absence d’affectation de profil renvoie JSON `null` et s’affiche explicitement.

## Vérification reproductible

Le nom produit affiché est **CodeInsights** : titre du navigateur, écrans de connexion et de déconnexion, bandeau principal et nom d'instance par défaut. La société Upcoop figure dans le copyright du footer. Le nom reste visible sur mobile ; le texte de connexion mesure 28 px. Le dépôt et le dossier se nomment `Up.France.CodeInsights`.

Depuis la racine du dépôt, utiliser la recette frontend existante (le manifeste npm reste défini dans le Dockerfile) :

```powershell
docker build --target web-builder -t quality-hub:web-design-check .
docker run --rm quality-hub:web-design-check npx tsc --noEmit
docker run --rm quality-hub:web-design-check node src/metric-display.check.mjs
docker run --rm quality-hub:web-design-check node src/forms.check.mjs
docker run --rm quality-hub:web-design-check node src/server-state.check.mjs
docker run --rm quality-hub:web-design-check node src/admin-data.check.mjs
docker run --rm quality-hub:web-design-check node src/collaboration.check.mjs
docker run --rm quality-hub:web-design-check node src/evidence-links.check.mjs
```

Les checks utilisent TypeScript, TanStack Query et les assertions natives Node déjà disponibles dans ce stage, sans framework de test supplémentaire. `metric-display` vérifie absence versus zéro, verdict inconnu, absence de résultats New Code et coordonnées des courbes. `forms` exerce les handlers des formulaires et conserve la saisie après un échec. `server-state` vérifie erreurs HTTP, transmission du Bearer, annulation de session et isolation des pages. `admin-data` couvre pagination du journal, mutations de notifications refusées sans faux succès ni invalidation et contrat de rotation des tokens CI.

Validation frontend P2 locale : build `web-builder` sous l’image `codeinsights:web-p2`, typage `--noUnusedLocals` et cinq checks Node réussis. `collaboration` exerce les handlers réels du formulaire : conservation du motif et de l’expiration d’une exception lors d’une assignation, version du brouillon, refus local d’une soumission concurrente/invalide ou avec catalogue indisponible et retrait de l’expiration lors d’une réouverture. Ce check couvre aussi les cibles entières, les dates d’objectif invalides et le maintien du jour d’échéance UTC dans un navigateur au fuseau Europe/Paris ; le tableau annonce explicitement « Échéance UTC ». `metric-display` vérifie également les ruptures de courbe aux changements ou absences de versions. Cette validation ne remplace pas les parcours navigateur et le pilote Azure Boards.

Validation de la migration React 19 / Query (5 septembre 2026) : build du stage `web-builder`, typage avec `--noUnusedLocals` et quatre checks Node réussis. Le bundle de production a été consulté dans le navigateur intégré avec une API simulée isolée : sept onglets à 390, 768 et 1440 px sans débordement horizontal global, connexion locale, callback Entra simulé avec nettoyage du fragment, puis passage du compte A au compte B pendant une réponse A retardée. Les contrôles ont aussi couvert le champ gate vidé au clavier, les refus HTTP visibles, les filtres appliqués du journal et le dialogue DevOps (erreur dans le dialogue, Échap après requête et retour du focus). La confirmation système `window.confirm` de suppression n'a pas pu être pilotée dans ce navigateur ; les erreurs de suppression sont couvertes par les assertions Node. Ces essais ne valident pas une connexion Entra réelle, l'autorisation du backend ou un déploiement Azure.

La recette ci-dessus construit uniquement le frontend : elle ne démarre pas l'API, n'initialise pas de base et ne déploie rien. Le typage inclut les déclarations `vite/client` et les types des mesures sont alignés sur les consommateurs.

Pour valider le raccordement à l'API .NET, lancer les checks HTTP décrits dans [validation.md](validation.md), puis vérifier login local, analyses, détail des findings, administration et téléchargements dans le navigateur intégré. Relever séparément la compilation, les probes API, les checks HTTP et les parcours navigateur ; cette procédure ne signifie pas que toutes ces étapes ont déjà été exécutées sur la version en cours.

La validation navigateur locale utilise des réponses de test isolées, sans identité ni données de production : les sept onglets aux largeurs 390, 768 et 1440 px, noms longs, filtres sans résultat, mesures absentes et zéro, verdict inconnu, historique avec ruptures, rôles `admin`/`regular`/`default`, connexion au clavier, dialogues, erreurs de chargement et absence d'analyses. La réduction des animations est contrôlée par émulation de la préférence navigateur. Les essais frontend ne valident pas l'autorisation serveur ni une intégration Azure réelle.

## Session et interface — v0.4.0

Une réponse HTTP 401 à une requête authentifiée efface la session persistée et remonte un arbre de connexion avec un cache neuf ; les lectures de l'ancienne session sont annulées. Un 401 tardif d'une autre identité est ignoré. Les 403, erreurs réseau et erreurs serveur restent des erreurs de consultation sans déconnexion. Un échec de connexion anonyme ne déclenche pas ce mécanisme.

L'appbar affiche CodeInsights, les initiales utilisateur avec le nom complet (sans rôle default) au survol, et une icône de déconnexion nommée. La session actuelle ne fournit pas de photo. Le badge API est supprimé. Les descriptions introductives deviennent des badges information accessibles au clavier et au toucher ; les erreurs et limites des résultats restent explicites. Le texte technique de pagination des projets et branches est supprimé, en conservant les boutons de continuation.

Le footer affiche © année courante Upcoop et la version Vite injectée par Docker à partir du tag Git exact ; voir [Exploitation](exploitation.md). Il reste en bas d'une page courte et suit le contenu d'une page longue. Les champs sans type explicite et les dates/heures suivent désormais les mêmes tokens que les autres champs.

Les badges sont placés à droite du titre ou texte associé, y compris sur mobile. Les aides d'une même section sont regroupées et le contexte « All projects » redondant sous le titre est retiré.

L'Administration n'affiche pas les contrôles globaux Overall / New Code / Refresh ni le contexte d'analyse. La navigation principale ne défile pas : les onglets qui dépassent la largeur disponible sont accessibles par un bouton à trois points verticaux et un menu.

Validation locale v0.4.0 (6 septembre 2026) : compilation .NET Release sans avertissement, build Docker complet, typage TypeScript strict et tous les checks Node réussis, dont les nouveaux checks de concurrence de session, de badge information et de calcul du débordement de navigation. Navigateur intégré avec API simulée isolée : retour à Sign In sur 401, maintien de session et erreur visible sur 403, appbar et champs natifs, badges au clavier/Échap, menu ⋮ et absence de débordement global à 390/768/1440 px, absence des contrôles d'analyse dans Administration. Les probes de production restent à vérifier après déploiement.
