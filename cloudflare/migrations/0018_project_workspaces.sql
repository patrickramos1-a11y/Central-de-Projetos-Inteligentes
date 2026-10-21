CREATE TABLE IF NOT EXISTS project_workspaces (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  conversation_not_applicable INTEGER NOT NULL DEFAULT 0 CHECK (conversation_not_applicable IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS project_workspace_references (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('directory', 'conversation', 'support')),
  title TEXT NOT NULL,
  target TEXT NOT NULL,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_workspace_references_project_order ON project_workspace_references(project_id, kind, sort_order);
CREATE INDEX IF NOT EXISTS idx_projects_client_workspace ON projects(client_id, id);

CREATE TABLE IF NOT EXISTS template_workspace_guidance (
  template_id TEXT PRIMARY KEY REFERENCES journey_templates(id) ON DELETE CASCADE,
  guidance TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT OR IGNORE INTO project_workspaces(project_id) SELECT id FROM projects;

CREATE TRIGGER IF NOT EXISTS project_workspace_after_insert AFTER INSERT ON projects
BEGIN
  INSERT OR IGNORE INTO project_workspaces(project_id) VALUES (NEW.id);
END;
