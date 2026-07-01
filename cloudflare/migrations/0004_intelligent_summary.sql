PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS project_summaries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL DEFAULT '',
  consolidated_text TEXT,
  version_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  parse_status TEXT NOT NULL DEFAULT 'not_analyzed' CHECK (parse_status IN ('not_analyzed', 'analyzed', 'needs_review', 'reviewed')),
  item_count INTEGER NOT NULL DEFAULT 0,
  selected_item_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  activated_at TEXT,
  archived_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_project_summaries_project ON project_summaries(project_id);
CREATE INDEX IF NOT EXISTS idx_project_summaries_project_status ON project_summaries(project_id, status);

CREATE TABLE IF NOT EXISTS project_summary_items (
  id TEXT PRIMARY KEY,
  summary_id TEXT NOT NULL REFERENCES project_summaries(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES project_summary_items(id) ON DELETE SET NULL,
  topic_number TEXT NOT NULL,
  title TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 1,
  original_text TEXT NOT NULL DEFAULT '',
  is_selected INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_andamento', 'desenvolvido', 'em_revisao', 'concluido', 'bloqueado', 'arquivado')),
  notes TEXT,
  parse_confidence REAL NOT NULL DEFAULT 0,
  parse_warning TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_project_summary_items_summary_order ON project_summary_items(summary_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_project_summary_items_project_status ON project_summary_items(project_id, status);
CREATE INDEX IF NOT EXISTS idx_project_summary_items_parent ON project_summary_items(parent_id);

CREATE TABLE IF NOT EXISTS prompt_blocks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL DEFAULT '',
  category TEXT,
  ai_tool_id TEXT REFERENCES ai_tools(id) ON DELETE SET NULL,
  project_type_id TEXT REFERENCES project_types(id) ON DELETE SET NULL,
  journey_step_id TEXT REFERENCES journey_steps(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'arquivado')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_prompt_blocks_status ON prompt_blocks(status);
CREATE INDEX IF NOT EXISTS idx_prompt_blocks_category ON prompt_blocks(category);

CREATE TABLE IF NOT EXISTS generated_prompts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  summary_id TEXT REFERENCES project_summaries(id) ON DELETE SET NULL,
  summary_item_id TEXT REFERENCES project_summary_items(id) ON DELETE SET NULL,
  base_prompt_id TEXT REFERENCES prompts(id) ON DELETE SET NULL,
  base_prompt_snapshot TEXT,
  selected_blocks_json TEXT,
  final_prompt TEXT NOT NULL DEFAULT '',
  notes TEXT,
  ai_tool_id TEXT REFERENCES ai_tools(id) ON DELETE SET NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_generated_prompts_project ON generated_prompts(project_id);
CREATE INDEX IF NOT EXISTS idx_generated_prompts_item ON generated_prompts(summary_item_id);
