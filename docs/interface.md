---
title: Interface du hub
description: Refonte claire et technique, affichage des mesures et vérification du frontend.
---

# Interface du hub

## Design et parcours

Le [design system](../DESIGN.md), référencé dans [AGENTS.md](../AGENTS.md), fixe les règles obligatoires pour les agents et contributeurs : tokens, typographie, composition, composants, accessibilité et critères de vérification. Cette page décrit les comportements et limites de l'interface.

La refonte conserve React, les composants natifs, la marque Upcoop et les onglets existants. Elle n'ajoute aucune dépendance. Le thème est exclusivement clair : fond gris froid, surfaces blanches, bleu `#005eb8`, contours fins et ombres légères. Les références Git et les mesures utilisent une police monospace système. Les transitions durent 150 ms et sont désactivées avec `prefers-reduced-motion`.

L'en-tête sépare marque, navigation, session et connexion API. Le titre de l'écran et le contexte projet/branche précèdent les résultats. Projects présente ensuite le verdict, l'état technique, le commit, la date, les motifs d'échec transmis et les mesures. Le compteur latéral porte sur la dernière analyse de chaque projet, toutes branches confondues ; les cartes All Projects décrivent l'historique d'analyses du projet.

Les formulaires, listes, filtres, états vides et erreurs suivent les mêmes styles. Sur petit écran, les grilles se replient et les navigations/tableaux larges défilent dans leur propre zone. Les sélections de branche sont natives, les cartes projets et titres de règles sont activables au clavier. Un lien d'évitement mène au contenu. Les dialogues utilisent `showModal()` pour rendre le fond inerte ; Échap ferme le dialogue hors sauvegarde/suppression en cours et restitue le focus au bouton d'ouverture.

## Lecture des résultats

- **Mesures** : un nombre fini explicitement reçu, y compris zéro, est conservé. Une valeur absente, `null` ou non finie s'affiche « Non disponible ». Le navigateur n'estime plus fiabilité, couverture, duplication ou compteurs manquants.
- **New Code** : le choix reste visible mais les résultats sont indisponibles. Les anciens calculs par hash, bruit et proportions sont retirés. Il n'y a ni mesures ni verdict global substitués ; la configuration des gates reste explicitement celle d'Overall Code.
- **Verdict** : `pass`, `fail` et `unknown` sont distincts. Le statut d'exécution `queued`, `running`, `completed` ou `failed` et l'état technique P0 `success`, `failed`, `incomplete` ou `legacy_unverified` sont présentés séparément. Le détail Projects montre la complétude, les états `measured`/`absent`/`failed`/`not_measured`, les exécutions d'outils et les conditions de l'instantané du gate. Les analyses sans ce contrat restent étiquetées « Historique non vérifié » ; l'interface ne reconstruit ni seuil ni provenance.
- **Evolution** : les valeurs manquantes interrompent les segments des courbes. Les compteurs ont une échelle adaptée aux valeurs reçues ; les pourcentages et scores restent sur 100. Un tableau défilable au clavier donne chaque valeur, commit, date, état technique et verdict.
- **Issues** : projet, branche et analyse sont sélectionnés explicitement. La liste et ses compteurs portent uniquement sur les findings détaillés de cette analyse. Les objets historiques qui contiennent seulement un total par fichier restent des résumés et ne génèrent plus de lignes artificielles. Les catégories `secret`, `dependency`, `code`, `ioc` et `unknown` ainsi que l'outil sont ceux transmis par le serveur, sans classement par le texte de la règle.
- **Vulnerabilities & IOCs** : cet onglet reprend la même sélection d'analyse que Issues et en affiche le projet, la branche et le commit. Les dépendances/code, les secrets et les IOC sont présentés dans trois vues séparées à partir de la catégorie serveur ; la catégorie inconnue reste dans la vue dépendances/code. TOTAL compte les entrées effectivement retournées dans ce périmètre. Les compteurs absents et le CVSS manquant sont explicites. Le frontend ne reclasse pas les secrets en CVE ou inversement à partir d'heuristiques de texte.
- **Quality Gates** : création, modification, suppression, affectation, suppression de règles et suggestion IA suivent `permissions.is_admin` relu par `/api/v1/auth/me`. Les autres utilisateurs consultent les données en lecture seule, même si un rôle obsolète subsiste dans la session locale. Les exemples de gates fabriqués au chargement ont été retirés ; le repli utilise le gate reçu de l'API.
- **Accès explicites** : Administration > Access Management charge les catalogues d'organisations et de projets depuis l'API. L'administrateur remplace en une opération les grants d'un utilisateur ; une sélection vide laisse un non-administrateur sans accès projet. Un grant d'organisation et un grant de projet restent affichés séparément.
- **Tokens CI** : la création exige au moins un projet et envoie les scopes fixes `analysis:read`, `analysis:write` et `integration:write`. L'historique affiche projets, scopes, expiration et révocation ; un token actif peut être révoqué explicitement. Plusieurs tokens indépendants peuvent coexister.

Les lectures Rules, Issues, Vulnerabilities et ProjectManager signalent les erreurs HTTP et ignorent les réponses devenues obsolètes lors d'un changement de contexte. ProjectManager conserve ses actions de création/rétention, affiche leurs erreurs et annonce le chargement des branches ; ce composant n'est actuellement pas monté dans App.

Les exports PDF/CSV sont téléchargés par le client avec le Bearer de la session ; un lien direct anonyme vers une route d'export protégée n'est plus utilisé.

Le composant ProjectManager n'étant toujours pas monté dans App, ses champs organisation et profil d'analyse ne sont pas présentés comme disponibles. Le contrat `GET /api/v1/projects` les expose pour une intégration ultérieure à cet écran.

Les groupes locaux simulés ont été retirés d'Access Management : l'automatisation par groupes Entra/App Roles appartient à un lot ultérieur. Le démarrage de connexion Entra utilise `credentials: include` pour conserver le cookie HttpOnly qui lie la transaction OIDC au navigateur. Le callback renvoie la session dans le fragment d'URL afin de l'exclure des requêtes HTTP et en-têtes Referer, puis le frontend efface l'URL. En développement, l'URL API `http://127.0.0.1:8000` est cross-origin par rapport à Vite et un cookie `SameSite=Lax` peut ne pas être renvoyé ; le parcours OIDC complet doit alors être validé derrière le proxy same-origin utilisé en production.

## Limites conservées

La baseline Git, l'ingestion SARIF/SBOM universelle, la file durable, l'assignation de findings, la collaboration et Azure Boards restent dans les lots P1/P2 de la [roadmap](roadmap.md). Les profils P0 sont un catalogue versionné affecté directement aux projets ; l'éditeur de profils reste hors de ce lot.

## Vérification reproductible

Le nom produit affiché est **CodeInsights** : titre du navigateur, écrans de connexion et de déconnexion, bandeau principal et nom d'instance par défaut. La marque Upcoop reste dans le bandeau. Le nom reste visible sur mobile sous la marque ; le texte de connexion conserve les 28 px existants. Les réglages d'instance déjà persistés restent inchangés. Le dépôt et le dossier se nomment `Up.France.CodeInsights`.

Depuis la racine du dépôt, utiliser la recette frontend existante (le manifeste npm reste défini dans le Dockerfile) :

```powershell
docker build --target web-builder -t quality-hub:web-design-check .
docker run --rm quality-hub:web-design-check npx tsc --noEmit
docker run --rm quality-hub:web-design-check node src/metric-display.check.mjs
```

Le contrôle ciblé utilise TypeScript déjà installé dans le stage et les assertions natives Node, y compris sous Node 20. Il vérifie absence versus zéro, verdict inconnu, absence de résultats New Code et coordonnées des courbes. Il remplace le fichier de tests qui ne vérifiait que des opérations arithmétiques et des constantes.

La recette ci-dessus construit uniquement le frontend : elle ne démarre pas l'API, n'initialise pas de base et ne déploie rien. Le typage inclut désormais les déclarations `vite/client` et les types des mesures sont alignés sur les consommateurs.

La validation navigateur locale utilise des réponses de test isolées, sans identité ni données de production : les sept onglets aux largeurs 390, 768 et 1440 px, noms longs, filtres sans résultat, mesures absentes et zéro, verdict inconnu, historique avec ruptures, rôles `admin`/`regular`/`default`, connexion au clavier, dialogues, erreurs de chargement et absence d'analyses. La réduction des animations est contrôlée par émulation de la préférence navigateur. Les essais frontend ne valident pas l'autorisation serveur ni une intégration Azure réelle.
