-- Generated prompts are historical work products. Archiving hides an obsolete
-- composition from the execution tree while preserving its audit trail.
ALTER TABLE generated_prompts ADD COLUMN status TEXT NOT NULL DEFAULT 'ativo';
ALTER TABLE generated_prompts ADD COLUMN archived_at TEXT;
