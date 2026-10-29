CREATE TABLE IF NOT EXISTS project_workspace_checklist_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  is_done INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0, 1)),
  item_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workspace_checklist_project
  ON project_workspace_checklist_items(project_id, item_order, created_at);

CREATE TABLE IF NOT EXISTS project_workspace_contexts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  source_client_context_id TEXT REFERENCES client_contexts(id) ON DELETE SET NULL,
  source_version INTEGER,
  context_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workspace_context_project
  ON project_workspace_contexts(project_id, context_order, created_at);

CREATE TABLE IF NOT EXISTS journey_stage_library (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  current_version INTEGER NOT NULL DEFAULT 1,
  document_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stage_library_status_name
  ON journey_stage_library(status, name);

CREATE TABLE IF NOT EXISTS journey_stage_versions (
  stage_id TEXT NOT NULL REFERENCES journey_stage_library(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  document_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(stage_id, version)
);

CREATE TABLE IF NOT EXISTS template_stage_links (
  template_id TEXT NOT NULL REFERENCES journey_templates(id) ON DELETE CASCADE,
  template_step_id TEXT NOT NULL REFERENCES journey_steps(id) ON DELETE CASCADE,
  stage_id TEXT NOT NULL REFERENCES journey_stage_library(id) ON DELETE RESTRICT,
  linked_version INTEGER NOT NULL,
  auto_update INTEGER NOT NULL DEFAULT 1 CHECK (auto_update IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(template_id, template_step_id)
);
CREATE INDEX IF NOT EXISTS idx_template_stage_links_stage
  ON template_stage_links(stage_id, auto_update);

INSERT OR IGNORE INTO journey_stage_library
  (id, name, description, status, current_version, document_json, created_at, updated_at)
SELECT
  'stage-' || step.id,
  step.name,
  step.description,
  CASE WHEN step.status = 'ativo' THEN 'active' ELSE 'archived' END,
  1,
  COALESCE((
    SELECT document_json
      FROM journey_step_documents doc
     WHERE doc.owner_type = 'template'
       AND doc.step_id = step.id
       AND doc.state = 'published'
     ORDER BY doc.version_number DESC
     LIMIT 1
  ), '{}'),
  step.created_at,
  step.created_at
FROM journey_steps step
WHERE step.journey_template_id IS NOT NULL;

INSERT OR IGNORE INTO journey_stage_versions
  (stage_id, version, name, description, document_json, created_at)
SELECT id, current_version, name, description, document_json, created_at
FROM journey_stage_library;

INSERT OR IGNORE INTO template_stage_links
  (template_id, template_step_id, stage_id, linked_version, auto_update, created_at, updated_at)
SELECT journey_template_id, id, 'stage-' || id, 1, 1, created_at, created_at
FROM journey_steps
WHERE journey_template_id IS NOT NULL;
