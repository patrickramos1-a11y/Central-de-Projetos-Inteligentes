ALTER TABLE clients ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));

CREATE INDEX IF NOT EXISTS idx_clients_is_active_name ON clients(is_active, name);
