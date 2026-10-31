CREATE TABLE IF NOT EXISTS project_workspace_reference_events (
  id TEXT PRIMARY KEY,
  reference_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  actor_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  actor_name TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_reference_events_latest
  ON project_workspace_reference_events(reference_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_reference_events_project
  ON project_workspace_reference_events(project_id, created_at DESC);
