# Templates DevSecOps — Copie de référence

Copie des templates ADO depuis `Up.France.ODI.AzurePipelines` (branche `feature/platform-central-scan`).

> **Source of truth :** repo ADO `Up.France.ODI/Up.France.ODI.AzurePipelines` — c'est là que les modifications doivent être faites.
> Ce dossier est une **copie de référence** versionnée ici pour documentation.

## Version courante : `v1.2.42-platform-sast`

| Fichier | Rôle |
|---|---|
| `ci_platform_scan.py` | Scanner principal (SAST + SCA + quality gate) |
| `az-platform-sast-steps-tpl.yml` | Steps SAST communs — appelé par tous les templates langages |
| `az-platform-sast-dotnet-tpl.yml` | Template SAST .NET |
| `az-platform-sast-react-tpl.yml` | Template SAST React / TypeScript |
| `az-platform-sast-php-tpl.yml` | Template SAST PHP |
| `az-platform-sast-stage-tpl.yml` | Stage SAST générique (wrapper) |
