PRAGMA foreign_keys = ON;

-- Canonical runtime storage. Existing project_step_* tables remain untouched as
-- compatibility tables while every new write uses this owner-aware model.
CREATE TABLE IF NOT EXISTS journey_step_documents (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('project', 'client', 'template')),
  owner_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
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
  archived_at TEXT,
  UNIQUE(owner_type, step_id, state)
);

CREATE INDEX IF NOT EXISTS idx_journey_step_documents_owner ON journey_step_documents(owner_type, owner_id, step_id, state);

CREATE TABLE IF NOT EXISTS journey_step_values (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('project', 'client', 'template')),
  owner_step_id TEXT NOT NULL,
  document_id TEXT NOT NULL REFERENCES journey_step_documents(id) ON DELETE CASCADE,
  block_id TEXT NOT NULL,
  value_json TEXT NOT NULL DEFAULT 'null',
  completion_state TEXT NOT NULL DEFAULT 'empty' CHECK (completion_state IN ('empty', 'partial', 'complete', 'blocked')),
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  UNIQUE(owner_type, owner_step_id, block_id)
);

CREATE INDEX IF NOT EXISTS idx_journey_step_values_step ON journey_step_values(owner_type, owner_step_id);

CREATE TABLE IF NOT EXISTS journey_step_files (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('project', 'client', 'template')),
  owner_step_id TEXT NOT NULL,
  document_id TEXT NOT NULL REFERENCES journey_step_documents(id) ON DELETE CASCADE,
  block_id TEXT NOT NULL,
  item_id TEXT,
  r2_key TEXT NOT NULL,
  name TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_journey_step_files_step ON journey_step_files(owner_type, owner_step_id, block_id);

CREATE TABLE IF NOT EXISTS journey_step_events (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('project', 'client', 'template')),
  owner_step_id TEXT NOT NULL,
  document_id TEXT REFERENCES journey_step_documents(id) ON DELETE SET NULL,
  block_id TEXT,
  event_type TEXT NOT NULL,
  event_payload_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_journey_step_events_step ON journey_step_events(owner_type, owner_step_id, created_at);

-- Seed documents and runtime values only where a stable legacy structure already exists.
-- Rows without a structure are converted by the explicit Worker migration endpoint.
INSERT OR IGNORE INTO journey_step_documents (
  id, owner_type, owner_id, step_id, schema_version, version_number, revision,
  state, title, document_json, created_by, created_at, updated_at, published_at, archived_at
)
SELECT
  s.id,
  'project',
  p.project_id,
  s.project_step_id,
  s.schema_version,
  s.version_number,
  s.revision,
  s.state,
  s.title,
  s.document_json,
  s.created_by,
  s.created_at,
  s.updated_at,
  s.published_at,
  s.archived_at
FROM project_step_structures s
JOIN project_steps p ON p.id = s.project_step_id
WHERE s.project_step_id IS NOT NULL;

INSERT OR IGNORE INTO journey_step_values (
  id, owner_type, owner_step_id, document_id, block_id, value_json,
  completion_state, updated_by, created_at, updated_at
)
SELECT
  v.id,
  'project',
  v.project_step_id,
  v.structure_id,
  v.block_id,
  v.value_json,
  v.completion_state,
  v.updated_by,
  v.created_at,
  v.updated_at
FROM project_step_block_values v
JOIN journey_step_documents d ON d.id = v.structure_id;

INSERT OR IGNORE INTO journey_step_events (
  id, owner_type, owner_step_id, document_id, block_id, event_type,
  event_payload_json, created_by, created_at
)
SELECT
  e.id,
  'project',
  e.project_step_id,
  e.structure_id,
  e.block_id,
  e.event_type,
  e.event_payload_json,
  e.created_by,
  e.created_at
FROM project_step_block_events e;
