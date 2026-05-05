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
  maintainability_score?: number;
  security_score?: number;
  reliability_score?: number;
  coverage?: number;
  duplication?: number;
  code_smells?: number;
  vulnerabilities?: number;
  bugs?: number;
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
  const [retentionPolicy, setRetentionPolicy] = useState<RetentionPolicy | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showRetentionEditor, setShowRetentionEditor] = useState(false);
  const [newProjectKey, setNewProjectKey] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [loading, setLoading] = useState(false);

  // Load all projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

  // Load branches when project is selected
  useEffect(() => {
    if (selectedProject) {
      loadBranches(selectedProject.id);
      loadRetentionPolicy(selectedProject.id);
    }
  }, [selectedProject]);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/projects');
      const data = await response.json();
      setProjects(data);
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadBranches = async (projectId: string) => {
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/branches`);
      const data = await response.json();
      setBranches(data);
    } catch (error) {
      console.error('Error loading branches:', error);
    }
  };

  const loadRetentionPolicy = async (projectId: string) => {
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/retention-policy`);
      if (response.ok) {
        const data = await response.json();
        setRetentionPolicy(data);
      }
    } catch (error) {
      console.error('Error loading retention policy:', error);
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

      if (response.ok) {
        setNewProjectKey('');
        setNewProjectName('');
        setShowCreateForm(false);
        loadProjects();
      }
    } catch (error) {
      console.error('Error creating project:', error);
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

      if (response.ok) {
        loadRetentionPolicy(selectedProject.id);
        setShowRetentionEditor(false);
      }
    } catch (error) {
      console.error('Error updating retention policy:', error);
    }
  };

  const getQualityGateColor = (gate?: string) => {
    switch (gate) {
      case 'pass':
        return '#4caf50';
      case 'fail':
        return '#f44336';
      default:
        return '#9e9e9e';
    }
  };

  const getMetricColor = (value: number | undefined, max: number) => {
    if (value === undefined) return '#9e9e9e';
    const percentage = (value / max) * 100;
    if (percentage >= 80) return '#4caf50';
    if (percentage >= 50) return '#ff9800';
    return '#f44336';
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>📊 Project Management</h1>

      <div style={{ marginBottom: '30px' }}>
        <h2>Projects</h2>
        {!showCreateForm ? (
          <button
            onClick={() => setShowCreateForm(true)}
            style={{
              padding: '10px 20px',
              backgroundColor: '#2196f3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginBottom: '15px',
            }}
          >
            ➕ Create New Project
          </button>
        ) : (
          <div
            style={{
              padding: '15px',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px',
              marginBottom: '15px',
            }}
          >
            <input
              type="text"
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
                backgroundColor: '#4caf50',
                color: 'white',
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
                backgroundColor: '#9e9e9e',
                color: 'white',
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
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '15px',
          }}
        >
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() => setSelectedProject(project)}
              style={{
                padding: '15px',
                backgroundColor: selectedProject?.id === project.id ? '#e3f2fd' : '#f5f5f5',
                border:
                  selectedProject?.id === project.id
                    ? '2px solid #2196f3'
                    : '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <h3>{project.name}</h3>
              <p style={{ margin: '5px 0', fontSize: '14px', color: '#666' }}>
                Key: {project.key}
              </p>
              {project.description && (
                <p style={{ margin: '5px 0', fontSize: '12px', color: '#999' }}>
                  {project.description}
                </p>
              )}
              <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
                <span>📁 {project.branch_count} branches</span>
                <span style={{ marginLeft: '10px' }}>📊 {project.analysis_count} analyses</span>
              </div>
              {project.archived && (
                <span
                  style={{
                    display: 'inline-block',
                    marginTop: '10px',
                    padding: '4px 8px',
                    backgroundColor: '#fff3cd',
                    color: '#856404',
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
          <h2>🌳 Branches - {selectedProject.name}</h2>
          <div
            style={{
              marginBottom: '15px',
              padding: '15px',
              backgroundColor: '#fff3cd',
              borderRadius: '4px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{branches.length} branches</span>
            {!showRetentionEditor && (
              <button
                onClick={() => setShowRetentionEditor(true)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#2196f3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                ⚙️ Retention Policy
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
              gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
              gap: '15px',
            }}
          >
            {branches.map((branch) => (
              <div
                key={branch.branch_name}
                style={{
                  padding: '15px',
                  backgroundColor: '#f9f9f9',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                }}
              >
                <h4 style={{ margin: '0 0 10px 0' }}>
                  {branch.branch_name === 'master' || branch.branch_name === 'main'
                    ? '⭐ '
                    : ''}
                  {branch.branch_name}
                </h4>

                {branch.analysis_date && (
                  <p style={{ margin: '5px 0', fontSize: '12px', color: '#999' }}>
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
                  {branch.quality_gate && (
                    <div
                      style={{
                        padding: '8px',
                        backgroundColor:
                          branch.quality_gate === 'pass' ? '#e8f5e9' : '#ffebee',
                        borderRadius: '3px',
                        textAlign: 'center',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        color: getQualityGateColor(branch.quality_gate),
                      }}
                    >
                      Gate: {branch.quality_gate.toUpperCase()}
                    </div>
                  )}

                  {branch.coverage !== undefined && (
                    <div style={{ fontSize: '12px' }}>
                      <span style={{ color: '#666' }}>Coverage:</span>
                      <span
                        style={{
                          marginLeft: '5px',
                          fontWeight: 'bold',
                          color: getMetricColor(branch.coverage, 100),
                        }}
                      >
                        {branch.coverage}%
                      </span>
                    </div>
                  )}

                  {branch.duplication !== undefined && (
                    <div style={{ fontSize: '12px' }}>
                      <span style={{ color: '#666' }}>Duplication:</span>
                      <span
                        style={{
                          marginLeft: '5px',
                          fontWeight: 'bold',
                          color:
                            branch.duplication <= 5
                              ? '#4caf50'
                              : branch.duplication <= 10
                              ? '#ff9800'
                              : '#f44336',
                        }}
                      >
                        {branch.duplication}%
                      </span>
                    </div>
                  )}

                  {branch.security_score !== undefined && (
                    <div style={{ fontSize: '12px' }}>
                      <span style={{ color: '#666' }}>Security:</span>
                      <span
                        style={{
                          marginLeft: '5px',
                          fontWeight: 'bold',
                          color: getMetricColor(branch.security_score, 100),
                        }}
                      >
                        {branch.security_score}/100
                      </span>
                    </div>
                  )}

                  {branch.maintainability_score !== undefined && (
                    <div style={{ fontSize: '12px' }}>
                      <span style={{ color: '#666' }}>Maintainability:</span>
                      <span
                        style={{
                          marginLeft: '5px',
                          fontWeight: 'bold',
                          color: getMetricColor(branch.maintainability_score, 100),
                        }}
                      >
                        {branch.maintainability_score}/100
                      </span>
                    </div>
                  )}

                  {branch.vulnerabilities !== undefined && (
                    <div style={{ fontSize: '12px' }}>
                      <span style={{ color: '#666' }}>Vulnerabilities:</span>
                      <span
                        style={{
                          marginLeft: '5px',
                          fontWeight: 'bold',
                          color: branch.vulnerabilities === 0 ? '#4caf50' : '#f44336',
                        }}
                      >
                        {branch.vulnerabilities}
                      </span>
                    </div>
                  )}

                  {branch.bugs !== undefined && (
                    <div style={{ fontSize: '12px' }}>
                      <span style={{ color: '#666' }}>Bugs:</span>
                      <span
                        style={{
                          marginLeft: '5px',
                          fontWeight: 'bold',
                          color: branch.bugs === 0 ? '#4caf50' : '#f44336',
                        }}
                      >
                        {branch.bugs}
                      </span>
                    </div>
                  )}
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
        backgroundColor: '#f5f5f5',
        borderRadius: '4px',
        marginBottom: '15px',
      }}
    >
      <h3>📋 Data Retention Policy</h3>

      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
          Keep successful analyses for (days):
        </label>
        <input
          type="number"
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
        <p style={{ fontSize: '12px', color: '#666', marginBottom: '15px' }}>
          ℹ️ Old analyses will be automatically deleted according to the retention rules above.
        </p>
      )}

      <div>
        <button
          onClick={handleSave}
          style={{
            marginRight: '10px',
            padding: '8px 16px',
            backgroundColor: '#4caf50',
            color: 'white',
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
            backgroundColor: '#9e9e9e',
            color: 'white',
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
