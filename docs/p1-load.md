# Campagne locale de charge P1

`scripts/p1-load.py` exécute le protocole A/B/C de [performances.md](performances.md)
avec Python standard, sur une API **loopback exclusivement**, reliée à une base
PostgreSQL de développement isolée. Le jeton administrateur est transmis par
`CODEINSIGHTS_LOAD_TOKEN` ; aucun jeton n'apparaît dans le journal.

| Palier | Projets | Historiques/projet | Rapports | Publications | Lecteurs |
|---|---:|---:|---:|---:|---:|
| A | 100 | 100 | 3 | 5 | 10 |
| B | 300 | 300 | 3 | 20 | 30 |
| C | 500 | 500 | 5 | 50 | 50 |

Créer une nouvelle base/container et une API migrée par palier. Le peuplement
`--seed-fixtures` requiert `--db-container` explicite et refuse toute base qui
contient déjà un projet ou une analyse. Il ne supprime aucune donnée. Les projets
sont créés via API ; PostgreSQL insère ensuite les **synthèses historiques**
déterministes. Elles sont explicitement incomplètes et n'inventent pas de findings
historiques. Les nouveaux rapports mesurés passent entièrement par le contrat
d'ingestion : manifeste, upload, finalisation et attente du traitement terminal.

```powershell
# Injecter CODEINSIGHTS_LOAD_TOKEN depuis le secret de la session locale.
python scripts/p1-load.py --url http://127.0.0.1:8000 --tier A --seed-fixtures --db-container codeinsights-load-a --db-name codeinsights --output .artifacts/p1-load-a.jsonl
```

Les défauts sont 300 s de chauffe, 1 800 s stables et 300 s de rafale, répétés
trois fois. La rafale double les producteurs et garde le même nombre de lecteurs.
Chaque palier dure au moins deux heures, auxquelles s'ajoutent peuplement et
drainage. Aucun lancement d'une campagne complète n'est implicite.

Smoke court sur une autre base vide :

```powershell
python scripts/p1-load.py --url http://127.0.0.1:8000 --smoke --seed-fixtures --db-container codeinsights-load-smoke --duration 10 --warmup 2 --burst 2 --repeats 1 --report-bytes 4096 --density 10 --output .artifacts/p1-load-smoke.jsonl
```

`--seed` fixe les projets, histories et choix de projets des lecteurs/producteurs.
`--report-bytes` fixe une taille minimale par rapport ; `--density` fixe les
findings SARIF. Le journal indique la taille réelle quand la densité dépasse la
taille demandée. Les originaux utilisent du JSON SARIF valide et un remplissage
JSON autorisé ; ces rapports synthétiques identiques mesurent l'ingestion, pas
la variété des analyseurs. Les matrices 1/10/50 MiB et 100/10 000/100 000 findings
se lancent séparément, sans considérer les dépassements configurés comme acceptés.

Le fichier JSONL est ajouté sous `.artifacts/`, déjà ignoré par Git. Il contient
les paramètres, les événements de progression, p50/p95/p99 des lectures et du
parcours complet de publication, débit, erreurs et nombre de publications non
terminales. Avec `--db-container`, l'état/volume/âge de chaque groupe de jobs
durables est également lu dans PostgreSQL toutes les cinq secondes. Le compteur
client non terminal n'est pas assimilé à la profondeur réelle de la queue.

Les percentiles concernent les opérations réussies ; les erreurs HTTP et
techniques sont comptées séparément. Un gate `unknown` sur le profil synthétique
ne compte pas comme échec technique ; `state=failed` en est un. Le drainage peut
dépasser la durée demandée de phase, jusqu'à la limite d'attente de 600 s par
publication. Mesurer CPU/mémoire/I/O/connexions et coût Azure séparément : le
runner ne les invente pas. Un smoke ne valide aucun SLO A/B/C ni la charge sur
une infrastructure Azure.

## Validation locale du 5 septembre 2026

Le smoke réel a été exécuté avec 2 projets, 2 synthèses historiques par projet,
3 rapports SARIF de 4 096 octets et 10 findings par rapport, sur PostgreSQL local,
Azurite et l'API .NET locale. Chauffe 10 s, mesure 30 s, rafale 10 s, une répétition :
75 publications et 6 064 lectures réussies, aucune erreur sur le passage propre.
Pendant la phase stable : 36 publications, 3 605 lectures, p95 publication 1,187 s,
p95 lecture 0,032 s. Ces chiffres sont des mesures de smoke, pas des résultats
aux paliers A/B/C. Le journal local est `.artifacts/p1/load-smoke-clean.jsonl`.

Une première tentative révélait l'absence d'affectation du profil synthétique
(HTTP 422), corrigée dans le peuplement. Une seconde a été interrompue par le
redémarrage contrôlé de l'API ; ces journaux restent distincts du passage propre.
Le client canonique AzurePipelines a aussi publié deux fois le même lot contre
l'API : mêmes identifiants d'ingestion et d'analyse, état `completed`, complétude
technique `complete`. Ce contrôle est conservé dans le reçu local
`.artifacts/p1/publisher-receipt.json`.


Le profil synthétique comporte désormais une condition explicite
`code_smells <= 1000000`. Sur le même environnement, le client canonique a ensuite
publié/republié un lot avec ce profil et obtenu `pass` deux fois avec les mêmes
identifiants (5,2 s puis 0,1 s). Journal : `.artifacts/p1/publisher-v2.log`.
Le publisher échoue systématiquement sur `unknown`, même en mode informatif ;
le runner de charge distingue volontairement transport/traitement et verdict.
La campagne A/B/C complète standard de six heures n'a pas été exécutée.
