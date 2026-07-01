PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS project_step_structures (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL DEFAULT 'project' CHECK (owner_type IN ('project', 'client', 'template')),
  project_step_id TEXT REFERENCES project_steps(id) ON DELETE CASCADE,
  client_step_id TEXT REFERENCES client_steps(id) ON DELETE CASCADE,
  template_step_id TEXT REFERENCES journey_steps(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL DEFAULT 1,
  version_number INTEGER NOT NULL DEFAULT 1,
  revision INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'published', 'archived')),
  title TEXT NOT NULL DEFAULT '',
  document_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  published_at TEXT,
  archived_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_project_step_structures_project_step ON project_step_structures(project_step_id, state, version_number);
CREATE INDEX IF NOT EXISTS idx_project_step_structures_client_step ON project_step_structures(client_step_id, state, version_number);
CREATE INDEX IF NOT EXISTS idx_project_step_structures_template_step ON project_step_structures(template_step_id, state, version_number);

CREATE TABLE IF NOT EXISTS project_step_block_values (
  id TEXT PRIMARY KEY,
  project_step_id TEXT NOT NULL REFERENCES project_steps(id) ON DELETE CASCADE,
  structure_id TEXT REFERENCES project_step_structures(id) ON DELETE SET NULL,
  block_id TEXT NOT NULL,
  value_json TEXT NOT NULL DEFAULT 'null',
  completion_state TEXT NOT NULL DEFAULT 'empty' CHECK (completion_state IN ('empty', 'partial', 'complete', 'blocked')),
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  UNIQUE(project_step_id, block_id)
);

CREATE INDEX IF NOT EXISTS idx_project_step_block_values_step ON project_step_block_values(project_step_id);
CREATE INDEX IF NOT EXISTS idx_project_step_block_values_structure ON project_step_block_values(structure_id);

CREATE TABLE IF NOT EXISTS project_step_block_files (
  id TEXT PRIMARY KEY,
  project_step_id TEXT NOT NULL REFERENCES project_steps(id) ON DELETE CASCADE,
  structure_id TEXT REFERENCES project_step_structures(id) ON DELETE SET NULL,
  block_id TEXT NOT NULL,
  item_id TEXT,
  name TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  version_number INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  approval_status TEXT NOT NULL DEFAULT 'pendente' CHECK (approval_status IN ('pendente', 'aprovado', 'reprovado', 'arquivado')),
  url TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_project_step_block_files_step ON project_step_block_files(project_step_id);
CREATE INDEX IF NOT EXISTS idx_project_step_block_files_block ON project_step_block_files(project_step_id, block_id);

CREATE TABLE IF NOT EXISTS project_step_block_events (
  id TEXT PRIMARY KEY,
  project_step_id TEXT NOT NULL REFERENCES project_steps(id) ON DELETE CASCADE,
  structure_id TEXT REFERENCES project_step_structures(id) ON DELETE SET NULL,
  block_id TEXT,
  event_type TEXT NOT NULL,
  event_payload_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_project_step_block_events_step ON project_step_block_events(project_step_id, created_at);
CREATE INDEX IF NOT EXISTS idx_project_step_block_events_structure ON project_step_block_events(structure_id);