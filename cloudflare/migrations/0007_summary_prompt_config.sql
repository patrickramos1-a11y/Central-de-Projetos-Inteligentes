-- Prompt configuration belongs to each summary version. This preserves the
-- base prompt and additional instructions used when that version is active.
ALTER TABLE project_summaries ADD COLUMN prompt_config_json TEXT NOT NULL DEFAULT '{}';
