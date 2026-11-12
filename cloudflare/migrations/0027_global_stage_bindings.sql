-- Global stage bindings keep project executions attached to the canonical
-- stage library. Runtime values remain in journey_step_values and are never
-- copied or deleted by a structure refresh.
CREATE TABLE IF NOT EXISTS project_stage_links (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_step_id TEXT NOT NULL REFERENCES project_steps(id) ON DELETE CASCADE,
  stage_id TEXT NOT NULL REFERENCES journey_stage_library(id) ON DELETE RESTRICT,
  linked_version INTEGER NOT NULL,
  auto_update INTEGER NOT NULL DEFAULT 1 CHECK (auto_update IN (0, 1)),
  last_sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (last_sync_status IN ('synced', 'review_required', 'error')),
  last_sync_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(project_id, project_step_id)
);
CREATE INDEX IF NOT EXISTS idx_project_stage_links_stage ON project_stage_links(stage_id, auto_update);

-- One append-only audit stream for canonical library changes. It deliberately
-- stores source ids instead of duplicating source content.
CREATE TABLE IF NOT EXISTS journey_library_events (
  id TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('stage', 'prompt')),
  source_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_payload_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_journey_library_events_source
  ON journey_library_events(source_kind, source_id, created_at DESC);

-- Existing projects created from a linked template become globally linked by
-- default. Rows are inserted only when the origin can be proven from the
-- source template step; all other projects remain untouched for review.
INSERT OR IGNORE INTO project_stage_links
  (project_id, project_step_id, stage_id, linked_version, auto_update, last_sync_status, created_at, updated_at)
SELECT
  project.id,
  project_step.id,
  template_link.stage_id,
  template_link.linked_version,
  template_link.auto_update,
  'synced',
  datetime('now'),
  datetime('now')
FROM projects project
JOIN project_steps project_step ON project_step.project_id = project.id
JOIN template_stage_links template_link
  ON template_link.template_id = project.journey_template_id
 AND template_link.template_step_id = project_step.source_journey_step_id
WHERE template_link.auto_update = 1;
