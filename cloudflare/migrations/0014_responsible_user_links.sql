ALTER TABLE projects ADD COLUMN responsible_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL;

ALTER TABLE clients ADD COLUMN responsible_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_responsible_user_id
  ON projects(responsible_user_id);

CREATE INDEX IF NOT EXISTS idx_clients_responsible_user_id
  ON clients(responsible_user_id);

UPDATE projects
SET responsible_user_id = (
  SELECT users.id
  FROM app_users AS users
  WHERE lower(trim(users.name)) = lower(trim(projects.responsible))
  ORDER BY CASE WHEN users.id = 'user-patrick' THEN 0 ELSE 1 END, users.created_at
  LIMIT 1
)
WHERE responsible_user_id IS NULL
  AND trim(coalesce(responsible, '')) <> ''
  AND EXISTS (
    SELECT 1
    FROM app_users AS users
    WHERE lower(trim(users.name)) = lower(trim(projects.responsible))
  );

UPDATE clients
SET responsible_user_id = (
  SELECT users.id
  FROM app_users AS users
  WHERE lower(trim(users.name)) = lower(trim(clients.responsible))
  ORDER BY CASE WHEN users.id = 'user-patrick' THEN 0 ELSE 1 END, users.created_at
  LIMIT 1
)
WHERE responsible_user_id IS NULL
  AND trim(coalesce(responsible, '')) <> ''
  AND EXISTS (
    SELECT 1
    FROM app_users AS users
    WHERE lower(trim(users.name)) = lower(trim(clients.responsible))
  );
