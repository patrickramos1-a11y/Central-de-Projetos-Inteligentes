-- Presentation is a personal runtime preference. It never belongs to a template
-- document or to a block value, so users can organize a journey independently.
CREATE TABLE IF NOT EXISTS journey_step_view_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('project', 'client')),
  owner_step_id TEXT NOT NULL,
  collapsed_block_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, owner_type, owner_step_id)
);

CREATE INDEX IF NOT EXISTS idx_journey_step_view_preferences_step
  ON journey_step_view_preferences(owner_type, owner_step_id, user_id);
