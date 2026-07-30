-- A etapa pode ser dispensada para um projeto especifico sem apagar a sua estrutura.
ALTER TABLE project_steps ADD COLUMN is_not_applicable INTEGER NOT NULL DEFAULT 0;
