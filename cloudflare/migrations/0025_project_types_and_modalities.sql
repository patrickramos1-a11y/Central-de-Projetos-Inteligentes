CREATE TABLE IF NOT EXISTS project_modalities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  project_type_id TEXT NOT NULL REFERENCES project_types(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'arquivado')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_type_id, name)
);

ALTER TABLE projects ADD COLUMN project_modality_id TEXT REFERENCES project_modalities(id) ON DELETE SET NULL;
ALTER TABLE journey_templates ADD COLUMN project_modality_id TEXT REFERENCES project_modalities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_modalities_type_status
  ON project_modalities(project_type_id, status, name);
CREATE INDEX IF NOT EXISTS idx_projects_modality
  ON projects(project_modality_id);
CREATE INDEX IF NOT EXISTS idx_journey_templates_modality
  ON journey_templates(project_modality_id);

-- Preserve the existing broad-category identifiers because prompts and other
-- historical records already reference them.
INSERT OR IGNORE INTO project_types (id, name, description, status) VALUES
  ('5ce32ecd-3904-42c9-89f3-3cd20b110a83', 'PROJETOS', 'Elaboracao de projetos, planos, programas e estudos.', 'ativo'),
  ('ab8e264d-c5c5-456f-bb08-72dafcf66e32', 'PROCESSOS', 'Processos, procedimentos e rotinas operacionais.', 'ativo'),
  ('c7c5563b-07f8-4885-a8c7-5f99f9e40a15', 'RELATÓRIOS', 'Relatorios, diagnosticos e levantamentos tecnicos.', 'ativo'),
  ('ad8d5ecc-1302-4448-8586-88158993abd4', 'VISITAS', 'Visitas, vistorias e inspecoes de campo.', 'ativo');

UPDATE project_types
   SET name = 'PROJETOS',
       description = 'Elaboracao de projetos, planos, programas e estudos.',
       status = 'ativo'
 WHERE id = '5ce32ecd-3904-42c9-89f3-3cd20b110a83';

UPDATE project_types SET name = 'PROCESSOS', status = 'ativo'
 WHERE id = 'ab8e264d-c5c5-456f-bb08-72dafcf66e32';
UPDATE project_types SET name = 'RELATÓRIOS', status = 'ativo'
 WHERE id = 'c7c5563b-07f8-4885-a8c7-5f99f9e40a15';
UPDATE project_types SET name = 'VISITAS', status = 'ativo'
 WHERE id = 'ad8d5ecc-1302-4448-8586-88158993abd4';

UPDATE project_types
   SET status = 'inativo'
 WHERE id NOT IN (
   '5ce32ecd-3904-42c9-89f3-3cd20b110a83',
   'ab8e264d-c5c5-456f-bb08-72dafcf66e32',
   'c7c5563b-07f8-4885-a8c7-5f99f9e40a15',
   'ad8d5ecc-1302-4448-8586-88158993abd4'
 );

INSERT OR IGNORE INTO project_modalities (id, name, description, project_type_id, status) VALUES
  ('type-memorial', 'Memorial', 'Memorial descritivo ou tecnico.', '5ce32ecd-3904-42c9-89f3-3cd20b110a83', 'ativo'),
  ('type-pca', 'PCA', 'Plano de Controle Ambiental.', '5ce32ecd-3904-42c9-89f3-3cd20b110a83', 'ativo'),
  ('type-peaa', 'PEAA', 'Plano ou programa de educacao ambiental aplicado.', '5ce32ecd-3904-42c9-89f3-3cd20b110a83', 'ativo'),
  ('type-pgrs', 'PGRS', 'Plano de Gerenciamento de Residuos Solidos.', '5ce32ecd-3904-42c9-89f3-3cd20b110a83', 'ativo'),
  ('type-politica-ambiental', 'Politica ambiental', 'Politicas ambientais institucionais ou operacionais.', '5ce32ecd-3904-42c9-89f3-3cd20b110a83', 'ativo'),
  ('type-projeto-ete', 'Projeto de ETE', 'Projeto de estacao de tratamento de efluentes.', '5ce32ecd-3904-42c9-89f3-3cd20b110a83', 'ativo'),
  ('type-rca-pca', 'RCA/PCA', 'Relatorio de Controle Ambiental e Plano de Controle Ambiental.', '5ce32ecd-3904-42c9-89f3-3cd20b110a83', 'ativo'),
  ('type-rce', 'RCE', 'Relatorio ou registro de controle ambiental.', '5ce32ecd-3904-42c9-89f3-3cd20b110a83', 'ativo'),
  ('modality-ria', 'RIA', 'Relatorio de impacto ambiental.', '5ce32ecd-3904-42c9-89f3-3cd20b110a83', 'ativo'),
  ('modality-riaa', 'RIAA', 'Relatorio de impacto ambiental aplicado.', '5ce32ecd-3904-42c9-89f3-3cd20b110a83', 'ativo'),
  ('modality-rac', 'RAC', 'Relatorio ambiental de controle.', '5ce32ecd-3904-42c9-89f3-3cd20b110a83', 'ativo'),
  ('modality-rctac', 'RCTAC', 'Modalidade RCTAC.', '5ce32ecd-3904-42c9-89f3-3cd20b110a83', 'ativo'),
  ('modality-tac', 'TAC', 'Termo de ajustamento ou acompanhamento.', '5ce32ecd-3904-42c9-89f3-3cd20b110a83', 'ativo'),
  ('modality-plano-acao-emergencial', 'Plano de acao emergencial', 'Plano de resposta e acao emergencial.', '5ce32ecd-3904-42c9-89f3-3cd20b110a83', 'ativo'),
  ('type-outro-personalizado', 'Outro / personalizado', 'Modalidade personalizada.', '5ce32ecd-3904-42c9-89f3-3cd20b110a83', 'ativo'),
  ('type-pop', 'POP', 'Procedimento Operacional Padrao.', 'ab8e264d-c5c5-456f-bb08-72dafcf66e32', 'ativo'),
  ('type-manual-boas-praticas', 'Manual de Boas Praticas', 'Manual de boas praticas e rotinas.', 'ab8e264d-c5c5-456f-bb08-72dafcf66e32', 'ativo'),
  ('type-procedimento-operacional', 'Procedimento operacional', 'Procedimentos e rotinas tecnicas.', 'ab8e264d-c5c5-456f-bb08-72dafcf66e32', 'ativo'),
  ('modality-car', 'CAR', 'Cadastro Ambiental Rural.', 'ab8e264d-c5c5-456f-bb08-72dafcf66e32', 'ativo'),
  ('modality-retificacao-car', 'Retificacao de CAR', 'Retificacao de Cadastro Ambiental Rural.', 'ab8e264d-c5c5-456f-bb08-72dafcf66e32', 'ativo'),
  ('modality-processo-loc', 'Processo de LOC', 'Processo de licenciamento ou LOC.', 'ab8e264d-c5c5-456f-bb08-72dafcf66e32', 'ativo'),
  ('modality-treinamento-ambiental', 'Treinamento ambiental', 'Treinamento e educacao ambiental.', 'ab8e264d-c5c5-456f-bb08-72dafcf66e32', 'ativo'),
  ('type-relatorio-tecnico', 'Relatorio tecnico', 'Relatorios tecnicos e diagnosticos.', 'c7c5563b-07f8-4885-a8c7-5f99f9e40a15', 'ativo'),
  ('modality-relatorio-fotografico', 'Relatorio fotografico', 'Relatorio e registro fotografico.', 'c7c5563b-07f8-4885-a8c7-5f99f9e40a15', 'ativo'),
  ('modality-levantamento', 'Levantamento', 'Levantamento tecnico ou de campo.', 'c7c5563b-07f8-4885-a8c7-5f99f9e40a15', 'ativo'),
  ('modality-visita-tecnica', 'Visita tecnica', 'Visita, vistoria ou inspecao tecnica.', 'ad8d5ecc-1302-4448-8586-88158993abd4', 'ativo');

-- First preserve every explicit legacy classification as its equivalent modality.
UPDATE projects
   SET project_modality_id = project_type_id
 WHERE project_type_id IN (
   'type-memorial', 'type-pca', 'type-peaa', 'type-pgrs', 'type-politica-ambiental',
   'type-projeto-ete', 'type-rca-pca', 'type-rce', 'type-outro-personalizado',
   'type-pop', 'type-manual-boas-praticas', 'type-procedimento-operacional', 'type-relatorio-tecnico'
 );

-- Infer only names with a clear operational meaning. Uncertain records remain
-- without a modality so they can be reviewed instead of being silently misfiled.
UPDATE projects SET project_modality_id = CASE
  WHEN upper(name) LIKE '%RCA-PCA%' OR upper(name) LIKE '%RCA/PCA%' THEN 'type-rca-pca'
  WHEN upper(name) LIKE '%MEMORIAL%' THEN 'type-memorial'
  WHEN upper(trim(name)) = 'RIAA' OR upper(name) LIKE 'RIAA -%' THEN 'modality-riaa'
  WHEN upper(trim(name)) = 'RIA' OR upper(name) LIKE 'RIA -%' THEN 'modality-ria'
  WHEN upper(trim(name)) = 'RCE' OR upper(name) LIKE 'RCE -%' THEN 'type-rce'
  WHEN upper(trim(name)) = 'RCTAC' OR upper(name) LIKE 'RCTAC -%' THEN 'modality-rctac'
  WHEN upper(trim(name)) = 'PCA' OR upper(name) LIKE 'PCA -%' THEN 'type-pca'
  WHEN upper(trim(name)) = 'PGRS' OR upper(name) LIKE 'PGRS -%' THEN 'type-pgrs'
  WHEN upper(trim(name)) = 'PEAA' OR upper(name) LIKE 'PEAA -%' THEN 'type-peaa'
  WHEN upper(name) LIKE '%POLITICA%' OR upper(name) LIKE '%POLÍTICA%' THEN 'type-politica-ambiental'
  WHEN upper(name) LIKE '%PLANO DE AÇÃO EMERGENCIAL%' OR upper(name) LIKE '%PLANO DE ACAO EMERGENCIAL%' THEN 'modality-plano-acao-emergencial'
  WHEN upper(name) LIKE '%PROJETE ETE%' OR upper(name) LIKE '%PROJETO%ETE%' THEN 'type-projeto-ete'
  WHEN upper(name) LIKE '%POP%' THEN 'type-pop'
  WHEN upper(name) LIKE '%DOSAGEM%' THEN 'type-procedimento-operacional'
  WHEN upper(name) LIKE '%MANUAL%' THEN 'type-manual-boas-praticas'
  WHEN upper(name) LIKE '%RETIFICAÇÃO%CAR%' OR upper(name) LIKE '%RETIFICACAO%CAR%' THEN 'modality-retificacao-car'
  WHEN upper(name) LIKE '%CAR%' THEN 'modality-car'
  WHEN upper(name) LIKE '%PROCESSO%LOC%' THEN 'modality-processo-loc'
  WHEN upper(name) LIKE '%TREINAMENTO%' THEN 'modality-treinamento-ambiental'
  WHEN upper(name) LIKE '%RELATORIO%' OR upper(name) LIKE '%RELATÓRIO%' THEN 'type-relatorio-tecnico'
  WHEN upper(name) LIKE '%LEVANTAMENTO%' OR upper(name) LIKE '%ACOMPANHAMENTO%' THEN 'modality-levantamento'
  WHEN upper(name) = 'RAC' THEN 'modality-rac'
  WHEN upper(name) = 'TAC' THEN 'modality-tac'
  ELSE project_modality_id
END
WHERE project_modality_id IS NULL;

UPDATE projects
   SET project_type_id = (
     SELECT project_type_id FROM project_modalities WHERE id = projects.project_modality_id
   )
 WHERE project_modality_id IS NOT NULL;

UPDATE projects
   SET project_type_id = '5ce32ecd-3904-42c9-89f3-3cd20b110a83'
 WHERE project_type_id = '5ce32ecd-3904-42c9-89f3-3cd20b110a83';

UPDATE journey_templates
   SET project_modality_id = CASE
     WHEN upper(name) LIKE '%FOTOGR%' THEN 'modality-relatorio-fotografico'
     WHEN upper(name) LIKE '%RIA%' THEN 'modality-ria'
     ELSE NULL
   END;

UPDATE journey_templates
   SET project_type_id = CASE
     WHEN project_modality_id = 'modality-relatorio-fotografico' THEN 'c7c5563b-07f8-4885-a8c7-5f99f9e40a15'
     WHEN project_modality_id IS NOT NULL THEN '5ce32ecd-3904-42c9-89f3-3cd20b110a83'
     WHEN project_type_id = 'type-outro-personalizado' THEN '5ce32ecd-3904-42c9-89f3-3cd20b110a83'
     ELSE project_type_id
   END;
