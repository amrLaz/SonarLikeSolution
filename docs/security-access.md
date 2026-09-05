---
title: Identités et autorisations
description: Matrice des accès utilisateur et CI de Up.France.CodeInsights.
---

# Identités et autorisations

Le hub distingue les sessions utilisateur et les tokens CI. Un utilisateur non administrateur ne voit que les projets attribués directement ou par organisation. Un token CI ne peut agir que sur ses `project_keys` et ses scopes. Les contrôles sont toujours refaits côté API ; le rôle conservé dans le navigateur n'autorise aucune action.

## Matrice des routes

| Famille                                                                                           | Anonyme | Utilisateur avec attribution | Token CI du projet  | Administrateur            |
| ------------------------------------------------------------------------------------------------- | ------- | ---------------------------- | ------------------- | ------------------------- |
| Santé, login local, login/callback Entra, catalogue public des fournisseurs                       | Oui     | Oui                          | Oui                 | Oui                       |
| Projets, analyses, findings, règles, gate et exports du projet                                    | Non     | Lecture                      | `analysis:read`     | Lecture/gestion           |
| `POST /api/v1/analyses`                                                                           | Non     | Non                          | `analysis:write`    | Non, utiliser un token CI |
| Métadonnées `PUT /api/v1/integrations/projects/{project_key}`                                     | Non     | Non                          | `integration:write` | Oui                       |
| Organisations, utilisateurs, grants, tokens, paramètres, intégrations ADO, notifications et audit | Non     | Non                          | Non                 | Oui                       |
| Suppression de règles ou de données                                                               | Non     | Non                          | Non                 | Oui                       |

Les accès directs par identifiant d'analyse retrouvent d'abord le `project_key`, puis appliquent la même vérification que les listes. Une collection globale est filtrée aux projets autorisés.

## Administration et migration

Créer les organisations, rattacher chaque projet à une organisation et affecter le profil d'analyse `platform-sast`, `p0-dotnet`, `p0-react` ou `p0-iac` en version `1`. Remplacer les grants d'un compte avec `PUT /api/v1/auth/users/{user_id}/grants`.

Les tokens existants sont conservés mais n'obtiennent aucun accès implicite. Leur affectation se fait avec `PUT /api/v1/platform/token/{token_id}/access`. Les nouveaux tokens exigent au moins un projet et reçoivent explicitement les scopes `analysis:read`, `analysis:write` et `integration:write`. Plusieurs tokens actifs peuvent coexister ; la révocation est individuelle.

## Entra ID

Le flux Authorization Code vérifie `state`, le cookie HTTP-only lié au navigateur, le nonce, la signature RS256 issue des JWK Microsoft, l'émetteur, le tenant, l'audience et les dates. La transaction est consommée atomiquement et ne peut pas être rejouée. L'identité est liée au couple tenant/object ID ; un email identique ne relie jamais automatiquement un compte local. Un nouveau compte Entra reçoit le rôle `default` et aucun grant. L'URL de retour utilise HTTPS ; HTTP est accepté uniquement sur `localhost`, `127.0.0.1` ou `::1` pour le développement local.
