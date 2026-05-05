# SonarLikeSolution

Centralisation des assets pipeline pour l'analyse SAST plateforme:
- template Azure DevOps réutilisable
- script Python d'orchestration d'analyse

## Structure

- `templates/sast-stage.yml`: template de stage prêt à l'emploi
- `scripts/ci_platform_scan.py`: script d'analyse partagé
- `examples/azure-pipelines.consumer.yml`: exemple complet d'utilisation

## Utilisation côté projet consommateur

1. Référencer ce repo dans `resources.repositories`.
2. Appeler le template `templates/sast-stage.yml`.
3. Passer les paramètres minimum: `projectKey`, `apiUrl`, `apiToken`.

Exemple minimal:

```yaml
resources:
  repositories:
    - repository: SonarLikeSolution
      type: git
      name: Up.France.ODI/SonarLikeSolution
      ref: refs/heads/main

stages:
  - template: templates/sast-stage.yml@SonarLikeSolution
    parameters:
      templatesRepoAlias: SonarLikeSolution
      projectKey: $(PLATFORM_PROJECT_KEY)
      apiUrl: $(PLATFORM_API_URL)
      apiToken: $(PLATFORM_API_TOKEN)
```

## Variables recommandées (secret management)

Ne pas stocker les secrets en clair dans le YAML.

- `PLATFORM_API_URL`: variable standard
- `PLATFORM_API_TOKEN`: variable secrète (Library Variable Group ou Key Vault)

## Paramètres disponibles du template

- `projectKey` (obligatoire)
- `apiUrl` (obligatoire)
- `apiToken` (obligatoire)
- `scanTarget` (defaut: `src`)
- `scanIgnore` (defaut: `scripts/ci_platform_scan.py,**/ci_platform_scan.py`)
- `pythonVersion` (defaut: `3.12`)
- `nodeVersion` (defaut: `18.x`)
- `repoProvider` (defaut: `azure-devops`)
- `pipelineProvider` (defaut: `azure-devops`)
- `realSast` (defaut: `true`)

## Publication du repo central

Une fois le dossier valide:

```bash
cd sonarlikesolution
git init
git add .
git commit -m "Add reusable SAST pipeline template and script"
# puis push vers le repo cible (ex: Up.France.ODI/SonarLikeSolution)
```
