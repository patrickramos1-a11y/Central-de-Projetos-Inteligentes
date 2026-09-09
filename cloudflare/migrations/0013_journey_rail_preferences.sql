CREATE TABLE IF NOT EXISTS journey_rail_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('project', 'client')),
  owner_id TEXT NOT NULL,
  is_expanded INTEGER NOT NULL DEFAULT 0 CHECK (is_expanded IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, owner_type, owner_id)
);

CREATE INDEX IF NOT EXISTS idx_journey_rail_preferences_owner
  ON journey_rail_preferences(user_id, owner_type, owner_id);
