ALTER TABLE projects ADD COLUMN client_id TEXT REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_client_id
  ON projects(client_id);

CREATE INDEX IF NOT EXISTS idx_projects_project_type_id
  ON projects(project_type_id);

CREATE INDEX IF NOT EXISTS idx_projects_status
  ON projects(status);

CREATE INDEX IF NOT EXISTS idx_projects_updated_at
  ON projects(updated_at);

CREATE INDEX IF NOT EXISTS idx_clients_name
  ON clients(name);

INSERT INTO project_types (id, name, description, status)
SELECT 'type-pca', 'PCA', 'Plano de Controle Ambiental.', 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM project_types WHERE id = 'type-pca' OR lower(trim(name)) = 'pca');

INSERT INTO project_types (id, name, description, status)
SELECT 'type-rca-pca', 'RCA/PCA', 'Relatorio de Controle Ambiental vinculado ao Plano de Controle Ambiental.', 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM project_types WHERE id = 'type-rca-pca' OR lower(trim(name)) IN ('rca/pca', 'rca + pca', 'rca-pca'));

INSERT INTO project_types (id, name, description, status)
SELECT 'type-ria', 'RIA', 'Relatorio de Impacto Ambiental ou relatorio ambiental equivalente.', 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM project_types WHERE id = 'type-ria' OR lower(trim(name)) = 'ria');

INSERT INTO project_types (id, name, description, status)
SELECT 'type-rce', 'RCE', 'Relatorio ou registro de controle ambiental.', 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM project_types WHERE id = 'type-rce' OR lower(trim(name)) = 'rce');

INSERT INTO project_types (id, name, description, status)
SELECT 'type-peaa', 'PEAA', 'Plano ou programa de educacao ambiental aplicado.', 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM project_types WHERE id = 'type-peaa' OR lower(trim(name)) = 'peaa');

INSERT INTO project_types (id, name, description, status)
SELECT 'type-pgrs', 'PGRS', 'Plano de Gerenciamento de Residuos Solidos.', 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM project_types WHERE id = 'type-pgrs' OR lower(trim(name)) = 'pgrs');

INSERT INTO project_types (id, name, description, status)
SELECT 'type-memorial', 'Memorial', 'Memorial descritivo ou tecnico.', 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM project_types WHERE id = 'type-memorial' OR lower(trim(name)) = 'memorial');

INSERT INTO project_types (id, name, description, status)
SELECT 'type-manual-boas-praticas', 'Manual de Boas Praticas', 'Manual de boas praticas, rotinas e padroes.', 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM project_types WHERE id = 'type-manual-boas-praticas' OR lower(trim(name)) = 'manual de boas praticas');

INSERT INTO project_types (id, name, description, status)
SELECT 'type-pop', 'POP', 'Procedimento Operacional Padrao.', 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM project_types WHERE id = 'type-pop' OR lower(trim(name)) = 'pop');

INSERT INTO project_types (id, name, description, status)
SELECT 'type-politica-ambiental', 'Politica ambiental', 'Politicas ambientais institucionais ou operacionais.', 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM project_types WHERE id = 'type-politica-ambiental' OR lower(trim(name)) = 'politica ambiental');

INSERT INTO project_types (id, name, description, status)
SELECT 'type-relatorio-tecnico', 'Relatorio tecnico', 'Relatorios tecnicos e diagnosticos.', 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM project_types WHERE id = 'type-relatorio-tecnico' OR lower(trim(name)) = 'relatorio tecnico');

INSERT INTO project_types (id, name, description, status)
SELECT 'type-projeto-ete', 'Projeto de ETE', 'Projeto relacionado a estacao de tratamento de efluentes.', 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM project_types WHERE id = 'type-projeto-ete' OR lower(trim(name)) = 'projeto de ete');

INSERT INTO project_types (id, name, description, status)
SELECT 'type-procedimento-operacional', 'Procedimento operacional', 'Procedimentos operacionais e rotinas tecnicas.', 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM project_types WHERE id = 'type-procedimento-operacional' OR lower(trim(name)) = 'procedimento operacional');

INSERT INTO project_types (id, name, description, status)
SELECT 'type-outro-personalizado', 'Outro / personalizado', 'Projetos personalizados sem categoria padrao.', 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM project_types WHERE id = 'type-outro-personalizado' OR lower(trim(name)) IN ('outro / personalizado', 'outro', 'personalizado'));

INSERT INTO clients (id, name, company, responsible, responsible_user_id, project_type_id, status, notes, created_at, updated_at)
SELECT
  lower(hex(randomblob(16))),
  grouped.company_name,
  grouped.company_name,
  grouped.responsible,
  grouped.responsible_user_id,
  grouped.project_type_id,
  'ativo',
  'Cliente criado automaticamente para consolidar projetos existentes.',
  datetime('now'),
  datetime('now')
FROM (
  SELECT
    trim(company) AS company_name,
    max(responsible) AS responsible,
    max(responsible_user_id) AS responsible_user_id,
    max(project_type_id) AS project_type_id
  FROM projects
  WHERE trim(coalesce(company, '')) <> ''
  GROUP BY lower(trim(company))
) AS grouped
WHERE NOT EXISTS (
  SELECT 1
  FROM clients
  WHERE lower(trim(clients.name)) = lower(trim(grouped.company_name))
     OR lower(trim(coalesce(clients.company, ''))) = lower(trim(grouped.company_name))
);

UPDATE projects
SET client_id = (
  SELECT clients.id
  FROM clients
  WHERE lower(trim(clients.name)) = lower(trim(projects.company))
     OR lower(trim(coalesce(clients.company, ''))) = lower(trim(projects.company))
  ORDER BY clients.created_at
  LIMIT 1
)
WHERE client_id IS NULL
  AND trim(coalesce(company, '')) <> ''
  AND EXISTS (
    SELECT 1
    FROM clients
    WHERE lower(trim(clients.name)) = lower(trim(projects.company))
       OR lower(trim(coalesce(clients.company, ''))) = lower(trim(projects.company))
  );

UPDATE projects
SET project_type_id = CASE
  WHEN upper(name) LIKE '%RCA%' AND upper(name) LIKE '%PCA%' THEN 'type-rca-pca'
  WHEN upper(name) LIKE '%RIA%' THEN 'type-ria'
  WHEN upper(name) LIKE '%RCE%' THEN 'type-rce'
  WHEN upper(name) LIKE '%PEAA%' THEN 'type-peaa'
  WHEN upper(name) LIKE '%PGRS%' THEN 'type-pgrs'
  WHEN upper(name) LIKE '%MEMORIAL%' THEN 'type-memorial'
  WHEN upper(name) LIKE '%MANUAL%' OR upper(name) LIKE '%BOAS PRATICAS%' THEN 'type-manual-boas-praticas'
  WHEN upper(name) LIKE '%POP%' THEN 'type-pop'
  WHEN upper(name) LIKE '%POLITICA AMBIENTAL%' OR upper(name) LIKE '%POLÍTICA AMBIENTAL%' THEN 'type-politica-ambiental'
  WHEN upper(name) LIKE '%RELATORIO TECNICO%' OR upper(name) LIKE '%RELATÓRIO TÉCNICO%' THEN 'type-relatorio-tecnico'
  WHEN upper(name) LIKE '%ETE%' THEN 'type-projeto-ete'
  WHEN upper(name) LIKE '%PROCEDIMENTO OPERACIONAL%' OR upper(name) LIKE '%DOSAGEM%' THEN 'type-procedimento-operacional'
  WHEN upper(name) LIKE '%PCA%' THEN 'type-pca'
  ELSE project_type_id
END
WHERE (project_type_id IS NULL OR trim(project_type_id) = '')
  AND (
    upper(name) LIKE '%RCA%' OR upper(name) LIKE '%PCA%' OR upper(name) LIKE '%RIA%' OR upper(name) LIKE '%RCE%' OR
    upper(name) LIKE '%PEAA%' OR upper(name) LIKE '%PGRS%' OR upper(name) LIKE '%MEMORIAL%' OR upper(name) LIKE '%MANUAL%' OR
    upper(name) LIKE '%BOAS PRATICAS%' OR upper(name) LIKE '%POP%' OR upper(name) LIKE '%POLITICA AMBIENTAL%' OR
    upper(name) LIKE '%POLÍTICA AMBIENTAL%' OR upper(name) LIKE '%RELATORIO TECNICO%' OR upper(name) LIKE '%RELATÓRIO TÉCNICO%' OR
    upper(name) LIKE '%ETE%' OR upper(name) LIKE '%PROCEDIMENTO OPERACIONAL%' OR upper(name) LIKE '%DOSAGEM%'
  );
