-- A stored compact abstract keeps client portfolio lists useful without
-- returning or rendering a duplicate of the context title.
ALTER TABLE client_contexts ADD COLUMN summary TEXT;

CREATE INDEX IF NOT EXISTS idx_client_contexts_client_created
  ON client_contexts(client_id, status, created_at DESC);
