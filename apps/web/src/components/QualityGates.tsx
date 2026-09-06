import InfoHint from './InfoHint';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GateLibraryItem, ProjectSummary, ScopeMode } from '../types';
import { analysisGateClass, analysisGateLabel } from '../metric-display';

type Props = {
  gateLibrary: GateLibraryItem[];
  gateAssignments: Record<string, string>;
  summaries: ProjectSummary[];
  scopeMode: ScopeMode;
  canAccessAdministration: boolean;
  apiBase: string;
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
};
type GateForm = { name: string } & Record<
  'min_maintainability_score' | 'min_security_score' | 'min_reliability_score' | 'max_vulnerabilities' | 'max_security_hotspots' | 'max_bugs' | 'max_code_smells',
  number | ''
>;
type GateAction = { kind: 'create' } | { kind: 'save'; gateId: string; form: GateForm } | { kind: 'delete'; gateId: string } | { kind: 'assign'; projectKey: string; gateId: string };

export default function QualityGates({ gateLibrary, gateAssignments, summaries, scopeMode, canAccessAdministration, apiBase, apiFetch }: Props) {
  const queryClient = useQueryClient();
  const [selectedGateId, setSelectedGateId] = useState('');
  const selectedGate = gateLibrary.find((gate) => gate.gate_id === selectedGateId) ?? gateLibrary.find((gate) => gate.builtIn) ?? gateLibrary[0] ?? null;
  const [draft, setDraft] = useState<{ gateId: string; form: GateForm } | null>(null);
  const [gateMessage, setGateMessage] = useState<string | null>(null);
  const [gateFormError, setGateFormError] = useState<string | null>(null);
  // An edited draft belongs to one gate and is never hydrated by background reads.
  const gateForm: GateForm =
    draft && draft.gateId === selectedGate?.gate_id
      ? draft.form
      : {
          name: selectedGate?.name ?? '',
          min_maintainability_score: selectedGate?.min_maintainability_score ?? '',
          min_security_score: selectedGate?.min_security_score ?? '',
          min_reliability_score: selectedGate?.min_reliability_score ?? 50,
          max_vulnerabilities: selectedGate?.max_vulnerabilities ?? '',
          max_security_hotspots: selectedGate?.max_security_hotspots ?? '',
          max_bugs: selectedGate?.max_bugs ?? 10,
          max_code_smells: selectedGate?.max_code_smells ?? '',
        };
  const mutation = useMutation({
    mutationFn: async (action: GateAction) => {
      if (!canAccessAdministration) throw new Error('Administrator permission is required.');
      let path = '/v1/gates';
      let method = 'POST';
      let body: unknown;
      if (action.kind === 'create') {
        body = {
          name: `Custom Gate ${gateLibrary.length + 1}`,
          min_maintainability_score: 80,
          min_security_score: 85,
          min_reliability_score: 50,
          max_vulnerabilities: 0,
          max_security_hotspots: 2,
          max_code_smells: 25,
          max_bugs: 0,
        };
      } else if (action.kind === 'assign') {
        path += `/assignments/${encodeURIComponent(action.projectKey)}`;
        const defaultId = gateLibrary.find((gate) => gate.builtIn)?.gate_id ?? 'default';
        method = action.gateId === defaultId ? 'DELETE' : 'PUT';
        if (method === 'PUT') body = { gate_id: action.gateId };
      } else {
        path += `/${encodeURIComponent(action.gateId)}`;
        method = action.kind === 'delete' ? 'DELETE' : 'PUT';
        if (action.kind === 'save') body = action.form;
      }
      const response = await apiFetch(`${apiBase}${path}`, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
      if (!response.ok) throw new Error(`Gate operation failed (${response.status}).`);
      return action.kind === 'create' || action.kind === 'save' ? ((await response.json()) as GateLibraryItem) : null;
    },
    onSuccess: async (gate, action) => {
      if (gate) {
        setSelectedGateId(gate.gate_id);
        setDraft({
          gateId: gate.gate_id,
          form: {
            name: gate.name,
            min_maintainability_score: gate.min_maintainability_score,
            min_security_score: gate.min_security_score,
            min_reliability_score: gate.min_reliability_score ?? 50,
            max_vulnerabilities: gate.max_vulnerabilities,
            max_security_hotspots: gate.max_security_hotspots,
            max_bugs: gate.max_bugs ?? 10,
            max_code_smells: gate.max_code_smells,
          },
        });
      }
      if (action.kind === 'delete') {
        setSelectedGateId('');
        setDraft(null);
      }
      setGateMessage(action.kind === 'assign' ? 'Project gate assignment saved.' : action.kind === 'delete' ? 'Gate deleted.' : `${action.kind === 'create' ? 'Created' : 'Saved'} ${gate?.name}.`);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['gates'] }), queryClient.invalidateQueries({ queryKey: ['gate-assignments'] })]);
    },
    onError: (error: Error) => setGateFormError(error.message),
  });
  const savingGate = mutation.isPending;
  const savingGateAssignment = savingGate && mutation.variables?.kind === 'assign' ? mutation.variables.projectKey : null;
  const run = (action: GateAction) => {
    if (savingGate || !canAccessAdministration) return;
    setGateFormError(null);
    setGateMessage(null);
    mutation.mutate(action);
  };
  const createGate = () => run({ kind: 'create' });
  const saveSelectedGate = () => {
    if (selectedGate) run({ kind: 'save', gateId: selectedGate.gate_id, form: gateForm });
  };
  const deleteSelectedGate = () => {
    if (selectedGate && !selectedGate.builtIn && window.confirm(`Delete gate "${selectedGate.name}"? Projects using it will revert to the default gate.`))
      run({ kind: 'delete', gateId: selectedGate.gate_id });
  };
  const assignGate = (projectKey: string, gateId: string) => run({ kind: 'assign', projectKey, gateId });
  const updateGateField = (field: keyof GateForm, value: string) => {
    if (selectedGate) setDraft({ gateId: selectedGate.gate_id, form: { ...gateForm, [field]: field === 'name' || value === '' ? value : Number(value) } });
  };
  return (
    <section className="two-pane-screen">
      <aside className="gates-sidebar">
        <div className="gates-head">
          <h3>Quality Gates</h3>
          <button type="button" onClick={createGate} disabled={savingGate || !canAccessAdministration}>
            Create
          </button>
        </div>
        <ul>
          {gateLibrary.map((gateItem) => (
            <li key={gateItem.gate_id} className={selectedGate?.gate_id === gateItem.gate_id ? 'active' : ''}>
              <button
                type="button"
                disabled={savingGate}
                onClick={() => {
                  setSelectedGateId(gateItem.gate_id);
                  setDraft(null);
                  setGateFormError(null);
                  setGateMessage(null);
                }}
              >
                <span className="gate-name">{gateItem.name}</span>
                <span className="gate-meta">
                  {gateItem.projectCount} project{gateItem.projectCount !== 1 ? 's' : ''}
                  {gateItem.builtIn && <span className="gate-default-badge">Default</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div className="gates-main">
        {gateMessage && (
          <p className="feedback" role="status">
            {gateMessage}
          </p>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveSelectedGate();
          }}
          onInvalid={(event) => setGateFormError((event.target as HTMLInputElement).validationMessage)}
          onChange={() => setGateFormError(null)}
        >
          <header className="gates-title-row">
            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
              <input
                className="gate-title-input"
                readOnly={savingGate || !canAccessAdministration}
                aria-label="Quality gate name"
                aria-describedby={gateFormError ? 'gate-form-error' : undefined}
                required
                maxLength={255}
                pattern=".*\S.*"
                value={gateForm.name}
                onChange={(event) => updateGateField('name', event.target.value)}
                title={canAccessAdministration ? 'Click to rename this gate' : 'Read-only quality gate'}
              />
              {selectedGate?.builtIn && (
                <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px', background: 'var(--primary)', color: 'var(--bg-lighter)', whiteSpace: 'nowrap' }}>
                  Default
                </span>
              )}
              <InfoHint>Conditions on Overall Code. {!canAccessAdministration && 'Lecture seule : seul un administrateur peut modifier les Quality Gates et leurs affectations.'}</InfoHint>
            </h2>
            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
              <button type="submit" disabled={savingGate || !canAccessAdministration || !selectedGate}>
                {savingGate ? 'Saving...' : 'Save'}
              </button>
              {selectedGate && !selectedGate.builtIn && (
                <button
                  type="button"
                  onClick={deleteSelectedGate}
                  disabled={savingGate || !canAccessAdministration}
                  style={{ background: 'transparent', color: 'var(--danger)', border: '1px solid currentColor' }}
                >
                  Delete
                </button>
              )}
            </div>
          </header>
          {gateFormError && (
            <p id="gate-form-error" className="feedback" role="alert">
              {gateFormError}
            </p>
          )}
          <fieldset className="gate-conditions" disabled={savingGate || !canAccessAdministration || !selectedGate}>
            <label>
              Min security score
              <input
                type="number"
                value={gateForm.min_security_score}
                required
                min={0}
                max={100}
                step={1}
                aria-describedby={gateFormError ? 'gate-form-error' : undefined}
                onChange={(event) => updateGateField('min_security_score', event.target.value)}
              />
            </label>
            <label>
              Min maintainability score
              <input
                type="number"
                value={gateForm.min_maintainability_score}
                required
                min={0}
                max={100}
                step={1}
                aria-describedby={gateFormError ? 'gate-form-error' : undefined}
                onChange={(event) => updateGateField('min_maintainability_score', event.target.value)}
              />
            </label>
            <label>
              Min reliability score
              <input
                type="number"
                value={gateForm.min_reliability_score}
                required
                min={0}
                max={100}
                step={1}
                aria-describedby={gateFormError ? 'gate-form-error' : undefined}
                onChange={(event) => updateGateField('min_reliability_score', event.target.value)}
              />
            </label>
            <label>
              Max vulnerabilities
              <input
                type="number"
                value={gateForm.max_vulnerabilities}
                required
                min={0}
                max={10000}
                step={1}
                aria-describedby={gateFormError ? 'gate-form-error' : undefined}
                onChange={(event) => updateGateField('max_vulnerabilities', event.target.value)}
              />
            </label>
            <label>
              Max security hotspots
              <input
                type="number"
                value={gateForm.max_security_hotspots}
                required
                min={0}
                max={10000}
                step={1}
                aria-describedby={gateFormError ? 'gate-form-error' : undefined}
                onChange={(event) => updateGateField('max_security_hotspots', event.target.value)}
              />
            </label>
            <label>
              Max bugs
              <input
                type="number"
                value={gateForm.max_bugs}
                required
                min={0}
                max={10000}
                step={1}
                aria-describedby={gateFormError ? 'gate-form-error' : undefined}
                onChange={(event) => updateGateField('max_bugs', event.target.value)}
              />
            </label>
            <label>
              Max code smells
              <input
                type="number"
                value={gateForm.max_code_smells}
                required
                min={0}
                max={100000}
                step={1}
                aria-describedby={gateFormError ? 'gate-form-error' : undefined}
                onChange={(event) => updateGateField('max_code_smells', event.target.value)}
              />
            </label>
          </fieldset>
        </form>
        <h3>
          Project gate assignments <InfoHint>Change which gate evaluates each project. Unassigned projects use the default gate.</InfoHint>
        </h3>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Project gate assignments">
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Assigned gate</th>
                <th>Last result</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => {
                const assignedId = gateAssignments[s.projectKey] ?? gateLibrary.find((g) => g.builtIn)?.gate_id ?? 'default';
                const isSaving = savingGateAssignment === s.projectKey;
                return (
                  <tr key={s.projectKey}>
                    <td>{s.projectKey}</td>
                    <td>
                      <select
                        aria-label={`Assigned gate for ${s.projectKey}`}
                        value={assignedId}
                        disabled={savingGate || !canAccessAdministration}
                        onChange={(e) => assignGate(s.projectKey, e.target.value)}
                        style={{ fontSize: '0.85rem' }}
                      >
                        {gateLibrary.map((g) => (
                          <option key={g.gate_id} value={g.gate_id}>
                            {g.name}
                            {g.builtIn ? ' (default)' : ''}
                          </option>
                        ))}
                      </select>
                      {isSaving && <span style={{ marginLeft: '0.4rem', opacity: 0.6 }}>…</span>}
                    </td>
                    <td className={scopeMode === 'overall' ? analysisGateClass(s.latest.quality_gate, s.latest.completeness) : 'unknown'}>
                      {scopeMode === 'overall' ? analysisGateLabel(s.latest.quality_gate, s.latest.completeness) : 'Non disponible'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
