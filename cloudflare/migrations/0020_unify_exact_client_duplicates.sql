-- Consolidate only confirmed, exact-name duplicate records. The oldest record is
-- retained as the canonical client and all known relationships are reassigned.

UPDATE clients
SET
  company = COALESCE(NULLIF(company, ''), (SELECT NULLIF(company, '') FROM clients source WHERE lower(trim(source.name)) = 'from amazonia' AND source.id != clients.id AND source.company IS NOT NULL LIMIT 1)),
  logo_url = COALESCE(NULLIF(logo_url, ''), (SELECT NULLIF(logo_url, '') FROM clients source WHERE lower(trim(source.name)) = 'from amazonia' AND source.id != clients.id AND source.logo_url IS NOT NULL LIMIT 1)),
  client_kind = COALESCE(client_kind, (SELECT client_kind FROM clients source WHERE lower(trim(source.name)) = 'from amazonia' AND source.id != clients.id AND source.client_kind IS NOT NULL LIMIT 1)),
  is_active = CASE WHEN EXISTS (SELECT 1 FROM clients source WHERE lower(trim(source.name)) = 'from amazonia' AND source.is_active = 1) THEN 1 ELSE is_active END
WHERE id = 'c84bf0ca-b5a3-43f5-9514-5f93f1280951';

UPDATE projects SET client_id = 'c84bf0ca-b5a3-43f5-9514-5f93f1280951'
WHERE client_id IN (SELECT id FROM clients WHERE lower(trim(name)) = 'from amazonia' AND id != 'c84bf0ca-b5a3-43f5-9514-5f93f1280951');
UPDATE client_steps SET client_id = 'c84bf0ca-b5a3-43f5-9514-5f93f1280951'
WHERE client_id IN (SELECT id FROM clients WHERE lower(trim(name)) = 'from amazonia' AND id != 'c84bf0ca-b5a3-43f5-9514-5f93f1280951');
UPDATE client_contexts SET client_id = 'c84bf0ca-b5a3-43f5-9514-5f93f1280951'
WHERE client_id IN (SELECT id FROM clients WHERE lower(trim(name)) = 'from amazonia' AND id != 'c84bf0ca-b5a3-43f5-9514-5f93f1280951');
DELETE FROM clients WHERE lower(trim(name)) = 'from amazonia' AND id != 'c84bf0ca-b5a3-43f5-9514-5f93f1280951';

UPDATE clients
SET
  company = COALESCE(NULLIF(company, ''), (SELECT NULLIF(company, '') FROM clients source WHERE lower(trim(source.name)) = 'cotação de água' AND source.id != clients.id AND source.company IS NOT NULL LIMIT 1)),
  logo_url = COALESCE(NULLIF(logo_url, ''), (SELECT NULLIF(logo_url, '') FROM clients source WHERE lower(trim(source.name)) = 'cotação de água' AND source.id != clients.id AND source.logo_url IS NOT NULL LIMIT 1)),
  client_kind = COALESCE(client_kind, (SELECT client_kind FROM clients source WHERE lower(trim(source.name)) = 'cotação de água' AND source.id != clients.id AND source.client_kind IS NOT NULL LIMIT 1)),
  is_active = CASE WHEN EXISTS (SELECT 1 FROM clients source WHERE lower(trim(source.name)) = 'cotação de água' AND source.is_active = 1) THEN 1 ELSE is_active END
WHERE id = 'fa43d967-7474-4c79-a8ef-49cb5a51fba2';

UPDATE projects SET client_id = 'fa43d967-7474-4c79-a8ef-49cb5a51fba2'
WHERE client_id IN (SELECT id FROM clients WHERE lower(trim(name)) = 'cotação de água' AND id != 'fa43d967-7474-4c79-a8ef-49cb5a51fba2');
UPDATE client_steps SET client_id = 'fa43d967-7474-4c79-a8ef-49cb5a51fba2'
WHERE client_id IN (SELECT id FROM clients WHERE lower(trim(name)) = 'cotação de água' AND id != 'fa43d967-7474-4c79-a8ef-49cb5a51fba2');
UPDATE client_contexts SET client_id = 'fa43d967-7474-4c79-a8ef-49cb5a51fba2'
WHERE client_id IN (SELECT id FROM clients WHERE lower(trim(name)) = 'cotação de água' AND id != 'fa43d967-7474-4c79-a8ef-49cb5a51fba2');
DELETE FROM clients WHERE lower(trim(name)) = 'cotação de água' AND id != 'fa43d967-7474-4c79-a8ef-49cb5a51fba2';

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_exact_name_unique ON clients(lower(trim(name)));
