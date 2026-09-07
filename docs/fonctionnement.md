---
title: Fonctionnement et écarts du hub
description: Capacités observées dans le code, limites du signal qualité et écarts vers une expérience Sonar.
---

# Fonctionnement et écarts du hub

## Parcours actuel

Un runner de pipeline transmet une analyse associée à un projet, une branche et un commit. L'API enregistre les métriques, évalue un gate et peut publier un retour Azure DevOps. Le frontend concentre la lecture sur Projects, Issues, Rules et Quality Gates.

Les capacités ci-dessous sont établies à partir du code local. Les résultats des tests sont consignés dans [validation.md](validation.md).

## Lire les scores avec leurs limites

La [documentation de l’interface](interface.md) décrit le thème clair, les mesures absentes, la lecture seule des gates, le tableau d’évolution et les contrôles locaux.

Sécurité, fiabilité, maintenabilité, couverture et duplication doivent rester des dimensions séparées. Un nombre de findings nul peut signifier absence de détection ou outil non exécuté. Les formules du runner et les valeurs de secours de l'API ne garantissent pas une échelle comparable entre langages et versions d'outils.

L'historique cible doit conserver commit, branche, outils et versions, profil de règles, périmètre analysé, complétude et version du gate/formule. Un changement de méthode doit apparaître comme une rupture de comparabilité ; chaque résultat doit identifier sa méthode de calcul.

## Référence Sonar et limites de la comparaison

L'[intégration Azure DevOps de Sonar](https://www.sonarsource.com/integrations/azure/devops/) relie dépôts, analyses de branches et retours PR. Les [quality gates](https://docs.sonarsource.com/sonarqube-server/quality-standards-administration/managing-quality-gates/introduction) expriment une politique de qualité. La cible du hub reprend ces parcours : configuration guidée, signal explicable, nouveau code réel et action depuis la PR.

La parité des moteurs, règles par langage, analyses sémantiques et intégrations IDE n'est pas acquise par l'agrégation des rapports. Les fonctions SBOM/licences constituent aussi une extension propre au hub.
