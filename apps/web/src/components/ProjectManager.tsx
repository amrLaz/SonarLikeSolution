import React, { useState, useEffect } from 'react';
import "./ProjectManager.css";

interface Project {
  id: string;
  key: string;
  name: string;
  description?: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
  branch_count: number;
  analysis_count: number;
}

interface BranchMetrics {
  branch_name: string;
  latest_analysis_id?: string;
  maintainability_score?: number | null;
  security_score?: number | null;
  reliability_score?: number | null;
  coverage?: number | null;
  duplication?: number | null;
  code_smells?: number | null;
  vulnerabilities?: number | null;
  bugs?: number | null;
  quality_gate?: string;
  analysis_date?: string;
}

interface RetentionPolicy {
  id: string;
  project_id: string;
  keep_analyses_days: number;
  keep_failed_analyses_days: number;
  keep_master_branch_days: number;
  auto_delete_enabled: boolean;
  last_cleanup_at?: string;
}

export const ProjectManager: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [branches, setBranches] = useState<BranchMetrics[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [retentionPolicy, setRetentionPolicy] = useState<RetentionPolicy | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showRetentionEditor, setShowRetentionEditor] = useState(false);
  const [newProjectKey, setNewProjectKey] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load all projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

  // Load branches when project is selected
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    setBranches([]);
    setRetentionPolicy(null);
    setShowRetentionEditor(false);
    if (selectedProject) {
      loadBranches(selectedProject.id, controller.signal);
      loadRetentionPolicy(selectedProject.id, controller.signal);
    }
    return () => controller.abort();
  }, [selectedProject]);

  const loadProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/projects');
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      const data = await response.json();
      setProjects(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const loadBranches = async (projectId: string, signal?: AbortSignal) => {
    setBranchesLoading(true);
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/branches`, { signal });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      const data = await response.json();
      if (!signal?.aborted) setBranches(data);
    } catch (error) {
      if (signal?.aborted) return;
      setError(error instanceof Error ? error.message : 'Request failed');
    } finally {
      if (!signal?.aborted) setBranchesLoading(false);
    }
  };

  const loadRetentionPolicy = async (projectId: string, signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/retention-policy`, { signal });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      if (response.ok) {
        const data = await response.json();
        if (!signal?.aborted) setRetentionPolicy(data);
      }
    } catch (error) {
      if (signal?.aborted) return;
      setError(error instanceof Error ? error.message : 'Request failed');
    }
  };

  const createProject = async () => {
    if (!newProjectKey.trim() || !newProjectName.trim()) {
      alert('Please fill in all fields');
      return;
    }

    try {
      const response = await fetch('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: newProjectKey,
          name: newProjectName,
        }),
      });

      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      if (response.ok) {
        setNewProjectKey('');
        setNewProjectName('');
        setShowCreateForm(false);
        loadProjects();
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Request failed');
    }
  };

  const updateRetentionPolicy = async (policy: Partial<RetentionPolicy>) => {
    if (!selectedProject) return;

    try {
      const response = await fetch(`/api/v1/projects/${selectedProject.id}/retention-policy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policy),
      });

      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      if (response.ok) {
        loadRetentionPolicy(selectedProject.id);
        setShowRetentionEditor(false);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Request failed');
    }
  };

  const getQualityGateColor = (gate?: string) => {
    switch (gate) {
      case 'pass':
        return 'var(--success)';
      case 'fail':
        return 'var(--danger)';
      default:
        return 'var(--text-tertiary)';
    }
  };


  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>Project Management</h1>
      {error && <p role="alert" className="error">{error}</p>}
      {loading && <p role="status">Loading projects...</p>}
      {!loading && !error && projects.length === 0 && <p className="empty-state">No projects available</p>}

      <div style={{ marginBottom: '30px' }}>
        <h2>Projects</h2>
        {!showCreateForm ? (
          <button
            onClick={() => setShowCreateForm(true)}
            style={{
              padding: '10px 20px',
              backgroundColor: 'var(--primary)',
              color: 'var(--bg-lighter)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginBottom: '15px',
            }}
          >
            Create New Project
          </button>
        ) : (
          <div
            style={{
              padding: '15px',
              backgroundColor: 'var(--bg-light)',
              borderRadius: '4px',
              marginBottom: '15px',
            }}
          >
            <input
              type="text"
              aria-label="Project Key"
              placeholder="Project Key (e.g., TESTPROJECT)"
              value={newProjectKey}
              onChange={(e) => setNewProjectKey(e.target.value)}
              style={{
                display: 'block',
                marginBottom: '10px',
                padding: '8px',
                width: '100%',
                boxSizing: 'border-box',
              }}
            />
            <input
              type="text"
              aria-label="Project Name"
              placeholder="Project Name"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              style={{
                display: 'block',
                marginBottom: '10px',
                padding: '8px',
                width: '100%',
                boxSizing: 'border-box',
              }}
            />
            <button
              onClick={createProject}
              style={{
                marginRight: '10px',
                padding: '8px 16px',
                backgroundColor: 'var(--success)',
                color: 'var(--bg-lighter)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Create
            </button>
            <button
              onClick={() => setShowCreateForm(false)}
              style={{
                padding: '8px 16px',
                backgroundColor: 'var(--text-tertiary)',
                color: 'var(--bg-lighter)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
            gap: '15px',
          }}
        >
          {projects.map((project) => (
            <div
              key={project.id}
              role="button"
              tabIndex={0}
              aria-pressed={selectedProject?.id === project.id}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelectedProject(project);
                }
              }}
              onClick={() => setSelectedProject(project)}
              style={{
                padding: '15px',
                backgroundColor: selectedProject?.id === project.id ? 'var(--bg-lighter)' : 'var(--bg-light)',
                border:
                  selectedProject?.id === project.id
                    ? '2px solid var(--primary)'
                    : '1px solid var(--border)',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'border-color 160ms, background-color 160ms',
              }}
            >
              <h3>{project.name}</h3>
              <p style={{ margin: '5px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
                Key: {project.key}
              </p>
              {project.description && (
                <p style={{ margin: '5px 0', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                  {project.description}
                </p>
              )}
              <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <span>{project.branch_count} branches</span>
                <span style={{ marginLeft: '10px' }}>{project.analysis_count} analyses</span>
              </div>
              {project.archived && (
                <span
                  style={{
                    display: 'inline-block',
                    marginTop: '10px',
                    padding: '4px 8px',
                    backgroundColor: 'var(--bg-light)',
                    color: 'var(--warning)',
                    borderRadius: '3px',
                    fontSize: '12px',
                  }}
                >
                  Archived
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {selectedProject && (
        <div style={{ marginBottom: '30px' }}>
          <h2>Branches - {selectedProject.name}</h2>
          <div
            style={{
              marginBottom: '15px',
              padding: '15px',
              backgroundColor: 'var(--bg-light)',
              borderRadius: '4px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span role="status">{branchesLoading ? "Loading branches..." : `${branches.length} branches`}</span>
            {!showRetentionEditor && (
              <button
                onClick={() => setShowRetentionEditor(true)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'var(--primary)',
                  color: 'var(--bg-lighter)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Retention Policy
              </button>
            )}
          </div>

          {showRetentionEditor && retentionPolicy && (
            <RetentionPolicyEditor
              policy={retentionPolicy}
              onSave={updateRetentionPolicy}
              onCancel={() => setShowRetentionEditor(false)}
            />
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 350px), 1fr))',
              gap: '15px',
            }}
          >
            {branches.map((branch) => (
              <div
                key={branch.branch_name}
                style={{
                  padding: '15px',
                  backgroundColor: 'var(--bg-light)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                }}
              >
                <h4 style={{ margin: '0 0 10px 0' }}>
                  {branch.branch_name}
                </h4>

                {branch.analysis_date && (
                  <p style={{ margin: '5px 0', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    Last: {new Date(branch.analysis_date).toLocaleDateString()}
                  </p>
                )}

                <div
                  style={{
                    marginTop: '10px',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                  }}
                >
                  <div className="quality-gate-badge" style={{ color: getQualityGateColor(branch.quality_gate) }}>
                    Gate: {branch.quality_gate === 'pass' ? 'PASS' : branch.quality_gate === 'fail' ? 'FAIL' : 'UNKNOWN'}
                  </div>
                  {([
                    ['Coverage', branch.coverage, '%'],
                    ['Duplication', branch.duplication, '%'],
                    ['Security', branch.security_score, '/100'],
                    ['Maintainability', branch.maintainability_score, '/100'],
                    ['Vulnerabilities', branch.vulnerabilities, ''],
                    ['Bugs', branch.bugs, ''],
                  ] as const).map(([label, value, unit]) => (
                    <div key={label}>
                      <span style={{ color: 'var(--text-secondary)' }}>{label}: </span>
                      <strong>{value == null ? 'Non disponible' : `${value}${unit}`}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface RetentionPolicyEditorProps {
  policy: RetentionPolicy;
  onSave: (policy: Partial<RetentionPolicy>) => void;
  onCancel: () => void;
}

const RetentionPolicyEditor: React.FC<RetentionPolicyEditorProps> = ({
  policy,
  onSave,
  onCancel,
}) => {
  const [formData, setFormData] = useState(policy);

  const handleSave = () => {
    onSave({
      keep_analyses_days: formData.keep_analyses_days,
      keep_failed_analyses_days: formData.keep_failed_analyses_days,
      keep_master_branch_days: formData.keep_master_branch_days,
      auto_delete_enabled: formData.auto_delete_enabled,
    });
  };

  return (
    <div
      style={{
        padding: '15px',
        backgroundColor: 'var(--bg-light)',
        borderRadius: '4px',
        marginBottom: '15px',
      }}
    >
      <h3>Data Retention Policy</h3>

      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
          Keep successful analyses for (days):
        </label>
        <input
          type="number"
          aria-label="Keep successful analyses for (days)"
          value={formData.keep_analyses_days}
          onChange={(e) =>
            setFormData({ ...formData, keep_analyses_days: parseInt(e.target.value) })
          }
          style={{ padding: '8px', width: '100%', boxSizing: 'border-box' }}
          min="1"
          max="3650"
        />
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
          Keep failed analyses for (days):
        </label>
        <input
          type="number"
          aria-label="Keep failed analyses for (days)"
          value={formData.keep_failed_analyses_days}
          onChange={(e) =>
            setFormData({ ...formData, keep_failed_analyses_days: parseInt(e.target.value) })
          }
          style={{ padding: '8px', width: '100%', boxSizing: 'border-box' }}
          min="1"
          max="365"
        />
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
          Keep master/main branch for (days):
        </label>
        <input
          type="number"
          aria-label="Keep master/main branch for (days)"
          value={formData.keep_master_branch_days}
          onChange={(e) =>
            setFormData({ ...formData, keep_master_branch_days: parseInt(e.target.value) })
          }
          style={{ padding: '8px', width: '100%', boxSizing: 'border-box' }}
          min="1"
          max="3650"
        />
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'flex', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={formData.auto_delete_enabled}
            onChange={(e) =>
              setFormData({ ...formData, auto_delete_enabled: e.target.checked })
            }
            style={{ marginRight: '10px' }}
          />
          <span>Enable automatic cleanup</span>
        </label>
      </div>

      {formData.auto_delete_enabled && (
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '15px' }}>
          Old analyses will be automatically deleted according to the retention rules above.
        </p>
      )}

      <div>
        <button
          disabled={![formData.keep_analyses_days, formData.keep_master_branch_days].every(value => Number.isInteger(value) && value >= 1 && value <= 3650) || !Number.isInteger(formData.keep_failed_analyses_days) || formData.keep_failed_analyses_days < 1 || formData.keep_failed_analyses_days > 365}
          onClick={handleSave}
          style={{
            marginRight: '10px',
            padding: '8px 16px',
            backgroundColor: 'var(--success)',
            color: 'var(--bg-lighter)',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Save Policy
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '8px 16px',
            backgroundColor: 'var(--text-tertiary)',
            color: 'var(--bg-lighter)',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
