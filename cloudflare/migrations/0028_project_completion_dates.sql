-- Delivery tracking: projects record when and by whom they were concluded.
-- Additive only. Existing concluded projects receive an estimated date
-- (last journey activity, falling back to updated_at) flagged as estimated.
ALTER TABLE projects ADD COLUMN completed_at TEXT;
ALTER TABLE projects ADD COLUMN completed_by TEXT;
ALTER TABLE projects ADD COLUMN completed_at_estimated INTEGER NOT NULL DEFAULT 0 CHECK (completed_at_estimated IN (0, 1));

UPDATE projects
SET completed_at = COALESCE(
      (
        SELECT max(e.created_at)
        FROM journey_step_events e
        JOIN project_steps s ON s.id = e.owner_step_id
        WHERE e.owner_type = 'project' AND s.project_id = projects.id
      ),
      updated_at
    ),
    completed_at_estimated = 1
WHERE status = 'concluido' AND completed_at IS NULL;

-- Event timestamps use SQLite datetime() format; store everything as ISO UTC.
UPDATE projects
SET completed_at = replace(completed_at, ' ', 'T') || 'Z'
WHERE completed_at IS NOT NULL AND instr(completed_at, 'T') = 0;

CREATE INDEX IF NOT EXISTS idx_projects_completed_at ON projects(completed_at);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at);
