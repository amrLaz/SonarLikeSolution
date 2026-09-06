import InfoHint from './InfoHint';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson, apiPage } from '../api';

type Scope = {
  version: string;
  repository_url: string;
  component: string;
  main_branch: string;
  reference_kind: 'branch' | 'analysis';
  reference_branch: string;
  reference_analysis_id: string | null;
  included_paths: string[];
  excluded_paths: string[];
  test_paths: string[];
  generated_paths: string[];
  third_party_paths: string[];
};
type Configuration = { definition: Scope | null; version: string | null; baseline_sha: string | null; baseline_analysis_id: string | null; reason: string | null };
type Branch = { branch: string; archived: boolean; is_main: boolean };
const pathFields = ['included_paths', 'excluded_paths', 'test_paths', 'generated_paths', 'third_party_paths'] as const;
const labels = { included_paths: 'Chemins inclus', excluded_paths: 'Chemins exclus', test_paths: 'Tests', generated_paths: 'Code généré', third_party_paths: 'Code tiers' };
const empty: Scope = {
  version: '',
  repository_url: '',
  component: '',
  main_branch: 'refs/heads/main',
  reference_kind: 'branch',
  reference_branch: 'refs/heads/main',
  reference_analysis_id: null,
  included_paths: [],
  excluded_paths: [],
  test_paths: [],
  generated_paths: [],
  third_party_paths: [],
};

export default function CodeScopes({ api, token, project, admin }: { api: string; token?: string; project: string; admin: boolean }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState(empty);
  const [versionCursor, setVersionCursor] = useState('');
  const [branchCursor, setBranchCursor] = useState('');
  const url = `${api}/v1/code/projects/${encodeURIComponent(project)}`;
  const configuration = useQuery({ queryKey: ['code-scope', project], enabled: !!project, queryFn: ({ signal }) => apiJson<Configuration>(`${url}/configuration`, token, { signal }) });
  const versions = useQuery({
    queryKey: ['code-scope-versions', project, versionCursor],
    enabled: !!project,
    queryFn: ({ signal }) => apiPage<Scope>(`${url}/versions?${new URLSearchParams({ cursor: versionCursor })}`, token, { signal }),
  });
  const branches = useQuery({
    queryKey: ['code-scope-branches', project, branchCursor],
    enabled: !!project,
    queryFn: ({ signal }) => apiPage<Branch>(`${url}/branches?${new URLSearchParams({ cursor: branchCursor })}`, token, { signal }),
  });
  const save = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: string; body: unknown }) =>
      apiJson(`${url}/${path}`, token, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    onSuccess: async () => {
      await Promise.all(['code-scope', 'code-scope-versions', 'code-scope-branches'].map((key) => client.invalidateQueries({ queryKey: [key, project] })));
    },
  });
  const exportScope = useMutation({
    mutationFn: async () => {
      const snapshot = await apiJson<Configuration>(`${url}/configuration`, token);
      const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = 'codeinsights-code-scope.json';
      link.click();
      URL.revokeObjectURL(objectUrl);
    },
  });
  return (
    <section className="panel">
      <h2>
        Composant, références et branches{' '}
        <InfoHint>
          Les périmètres publiés sont immuables. L’affectation s’applique aux prochains imports ; les décisions conservées restent attachées au projet et à leur branche. Un chemin par ligne : fichier
          exact ou répertoire terminé par « / », sans glob. Une liste d’inclusion vide inclut tout le dépôt ; les exclusions restent prioritaires.
        </InfoHint>
      </h2>
      {!project ? (
        <p role="status">Sélectionnez un projet.</p>
      ) : (
        <>
          {[configuration.error, versions.error, branches.error, save.error, exportScope.error].filter(Boolean).map((error, index) => (
            <p key={index} role="alert">
              {error!.message}
            </p>
          ))}
          {configuration.isLoading && <p role="status">Chargement du périmètre…</p>}
          {configuration.data?.definition ? (
            <>
              <p>
                Affectation : {configuration.data.definition.component} / {configuration.data.version} · branche principale <code>{configuration.data.definition.main_branch}</code>.
              </p>
              <p>
                Baseline : <code>{configuration.data.baseline_sha ?? 'Indisponible'}</code> · analyse <code>{configuration.data.baseline_analysis_id ?? 'Indisponible'}</code>.
              </p>
              {configuration.data.reason && <p role="status">{configuration.data.reason}</p>}
              <button type="button" disabled={exportScope.isPending} onClick={() => exportScope.mutate()}>
                Exporter la référence figée pour la CI
              </button>
            </>
          ) : (
            configuration.isSuccess && <p>Aucun périmètre versionné affecté.</p>
          )}
          {versions.isLoading && <p role="status">Chargement des versions…</p>}
          {versions.data && (
            <>
              <h3>Versions publiées</h3>
              <p>{versions.data.items.length} versions sur cette page.</p>
              {!versions.data.items.length && <p>Aucune version publiée.</p>}
              {versions.data.items.map((item) => (
                <details key={item.version}>
                  <summary>
                    {item.component} / {item.version} · référence {item.reference_kind === 'branch' ? item.reference_branch : item.reference_analysis_id}
                  </summary>
                  <pre>{JSON.stringify(item, null, 2)}</pre>
                  {admin && (
                    <div className="action-row">
                      <button type="button" disabled={save.isPending} onClick={() => setDraft({ ...item, version: '' })}>
                        Préparer une nouvelle version à partir de celle-ci
                      </button>
                      <button
                        type="button"
                        disabled={save.isPending || configuration.data?.version === item.version}
                        onClick={() => save.mutate({ path: 'configuration', method: 'PUT', body: { version: item.version } })}
                      >
                        Affecter cette version
                      </button>
                    </div>
                  )}
                </details>
              ))}
              <div className="action-row">
                {versionCursor && (
                  <button type="button" onClick={() => setVersionCursor('')}>
                    Premières versions
                  </button>
                )}
                {versions.data.next && (
                  <button type="button" onClick={() => setVersionCursor(versions.data!.next!)}>
                    Versions suivantes
                  </button>
                )}
              </div>
            </>
          )}
          {admin && (
            <details>
              <summary>Publier un périmètre</summary>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  save.mutate({
                    path: 'versions',
                    method: 'POST',
                    body: {
                      ...draft,
                      ...Object.fromEntries(pathFields.map((field) => [field, draft[field].map((path) => path.trim()).filter(Boolean)])),
                      reference_analysis_id: draft.reference_kind === 'analysis' ? draft.reference_analysis_id : null,
                    },
                  });
                }}
              >
                <fieldset disabled={save.isPending}>
                  <legend>Nouvelle version immutable</legend>
                  <label htmlFor="scope-version">Version</label>
                  <input id="scope-version" required maxLength={50} value={draft.version} onChange={(event) => setDraft({ ...draft, version: event.target.value })} />
                  <label htmlFor="scope-repository">URL HTTPS du dépôt</label>
                  <input id="scope-repository" type="url" required value={draft.repository_url} onChange={(event) => setDraft({ ...draft, repository_url: event.target.value })} />
                  <label htmlFor="scope-component">Composant</label>
                  <input id="scope-component" required maxLength={200} value={draft.component} onChange={(event) => setDraft({ ...draft, component: event.target.value })} />
                  <label htmlFor="scope-main">Branche principale exacte</label>
                  <input id="scope-main" required value={draft.main_branch} onChange={(event) => setDraft({ ...draft, main_branch: event.target.value })} />
                  <label htmlFor="scope-reference">Définition du nouveau code</label>
                  <select id="scope-reference" value={draft.reference_kind} onChange={(event) => setDraft({ ...draft, reference_kind: event.target.value as Scope['reference_kind'] })}>
                    <option value="branch">Dernière analyse importée d’une branche</option>
                    <option value="analysis">Analyse de référence fixe</option>
                  </select>
                  {draft.reference_kind === 'branch' ? (
                    <>
                      <label htmlFor="scope-branch">Branche de référence exacte</label>
                      <input id="scope-branch" required value={draft.reference_branch} onChange={(event) => setDraft({ ...draft, reference_branch: event.target.value })} />
                    </>
                  ) : (
                    <>
                      <label htmlFor="scope-analysis">Identifiant d’analyse du projet</label>
                      <input id="scope-analysis" required value={draft.reference_analysis_id ?? ''} onChange={(event) => setDraft({ ...draft, reference_analysis_id: event.target.value })} />
                    </>
                  )}
                  {pathFields.map((field) => (
                    <label key={field} htmlFor={`scope-${field}`}>
                      {labels[field]}
                      <textarea id={`scope-${field}`} rows={3} value={draft[field].join('\n')} onChange={(event) => setDraft({ ...draft, [field]: event.target.value.split('\n') })} />
                    </label>
                  ))}
                  <button type="submit">Publier cette version</button>
                </fieldset>
              </form>
            </details>
          )}
          <h3>
            Branches observées <InfoHint>L’archive est un état de classement ; elle ne supprime ni branche Git ni historique ni décision.</InfoHint>
          </h3>
          {branches.isLoading && <p role="status">Chargement des branches…</p>}
          {branches.data && (
            <>
              <p>{branches.data.items.length} branches sur cette page.</p>
              {branches.data.items.map((branch) => (
                <p key={branch.branch}>
                  <code>{branch.branch}</code> · {branch.is_main ? 'principale · ' : ''}
                  {branch.archived ? 'archivée' : 'active'}{' '}
                  {admin && (
                    <button type="button" disabled={save.isPending} onClick={() => save.mutate({ path: 'branches', method: 'PUT', body: { branch: branch.branch, archived: !branch.archived } })}>
                      {branch.archived ? 'Désarchiver' : 'Archiver'}
                    </button>
                  )}
                </p>
              ))}
              <div className="action-row">
                {branchCursor && (
                  <button type="button" onClick={() => setBranchCursor('')}>
                    Premières branches
                  </button>
                )}
                {branches.data.next && (
                  <button type="button" onClick={() => setBranchCursor(branches.data!.next!)}>
                    Branches suivantes
                  </button>
                )}
              </div>
            </>
          )}
          {save.isSuccess && <p role="status">Modification enregistrée.</p>}
        </>
      )}
    </section>
  );
}
