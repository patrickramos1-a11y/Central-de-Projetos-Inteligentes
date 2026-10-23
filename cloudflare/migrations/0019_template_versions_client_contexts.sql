CREATE TABLE IF NOT EXISTS journey_template_versions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES journey_templates(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL CHECK (state IN ('draft', 'published')),
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  UNIQUE(template_id, version_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_template_single_draft ON journey_template_versions(template_id) WHERE state = 'draft';
CREATE INDEX IF NOT EXISTS idx_template_versions_lookup ON journey_template_versions(template_id, state, version_number DESC);

CREATE TABLE IF NOT EXISTS template_publish_guards (
  id TEXT PRIMARY KEY,
  valid INTEGER NOT NULL CHECK (valid = 1)
);

CREATE TABLE IF NOT EXISTS client_contexts (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  version INTEGER NOT NULL DEFAULT 1,
  origin_type TEXT NOT NULL CHECK (origin_type IN ('client', 'project')),
  origin_project_id TEXT,
  origin_step_id TEXT,
  origin_block_id TEXT,
  origin_context_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_client_contexts_client ON client_contexts(client_id, status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_contexts_origin ON client_contexts(origin_project_id, origin_step_id, origin_block_id, origin_context_id) WHERE origin_project_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS client_context_versions (
  context_id TEXT NOT NULL REFERENCES client_contexts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY(context_id, version)
);

CREATE TABLE IF NOT EXISTS template_draft_files (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES journey_templates(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  name TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_template_draft_files ON template_draft_files(template_id, step_id, block_id);

CREATE TABLE IF NOT EXISTS template_version_files (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES journey_template_versions(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  name TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_template_version_files ON template_version_files(version_id, step_id, block_id);
