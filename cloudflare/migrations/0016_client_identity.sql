ALTER TABLE clients ADD COLUMN client_kind TEXT CHECK (client_kind IN ('AC', 'AV'));

CREATE INDEX IF NOT EXISTS idx_clients_kind ON clients(client_kind);
