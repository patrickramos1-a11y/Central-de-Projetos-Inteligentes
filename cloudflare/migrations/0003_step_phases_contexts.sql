PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS project_step_phases (
  id TEXT PRIMARY KEY,
  project_step_id TEXT NOT NULL REFERENCES project_steps(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  phase_order INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_andamento', 'concluido', 'bloqueado')),
  requires_previous_phase INTEGER NOT NULL DEFAULT 0,
  prerequisite_phase_id TEXT REFERENCES project_step_phases(id) ON DELETE SET NULL,
  completion_condition TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  UNIQUE(project_step_id, phase_order)
);

CREATE INDEX IF NOT EXISTS idx_project_step_phases_step_order ON project_step_phases(project_step_id, phase_order);
CREATE INDEX IF NOT EXISTS idx_project_step_phases_prerequisite ON project_step_phases(prerequisite_phase_id);

CREATE TABLE IF NOT EXISTS project_step_contexts (
  id TEXT PRIMARY KEY,
  project_step_id TEXT NOT NULL REFERENCES project_steps(id) ON DELETE CASCADE,
  phase_id TEXT REFERENCES project_step_phases(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  context_order INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'rascunho', 'arquivado')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  UNIQUE(project_step_id, context_order)
);

CREATE INDEX IF NOT EXISTS idx_project_step_contexts_step_order ON project_step_contexts(project_step_id, context_order);
CREATE INDEX IF NOT EXISTS idx_project_step_contexts_phase ON project_step_contexts(phase_id);
