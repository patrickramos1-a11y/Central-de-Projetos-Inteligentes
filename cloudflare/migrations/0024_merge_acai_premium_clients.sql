CREATE TABLE IF NOT EXISTS client_merge_log (
  duplicate_client_id TEXT PRIMARY KEY,
  canonical_client_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  merged_at TEXT NOT NULL
);

INSERT OR IGNORE INTO client_merge_log (duplicate_client_id, canonical_client_id, reason, merged_at)
SELECT duplicate.id, canonical.id, 'Aglutinacao revisada: AÇAI PREMIUIM / ACAI PREMIUM', datetime('now')
  FROM clients duplicate
  JOIN clients canonical ON canonical.id = '1f3038cd6e1605b80c5d9b356dd03cf8'
 WHERE duplicate.id = '187f7b591f9980c4ad6e4cfa7dd671a5';

UPDATE projects
   SET client_id = '1f3038cd6e1605b80c5d9b356dd03cf8',
       company = 'ACAI PREMIUM',
       updated_at = datetime('now')
 WHERE client_id = '187f7b591f9980c4ad6e4cfa7dd671a5';

UPDATE client_steps
   SET client_id = '1f3038cd6e1605b80c5d9b356dd03cf8'
 WHERE client_id = '187f7b591f9980c4ad6e4cfa7dd671a5';

UPDATE client_contexts
   SET client_id = '1f3038cd6e1605b80c5d9b356dd03cf8'
 WHERE client_id = '187f7b591f9980c4ad6e4cfa7dd671a5';

UPDATE journey_template_client_scopes
   SET client_id = '1f3038cd6e1605b80c5d9b356dd03cf8',
       updated_at = datetime('now')
 WHERE client_id = '187f7b591f9980c4ad6e4cfa7dd671a5';

UPDATE journey_stage_client_scopes
   SET client_id = '1f3038cd6e1605b80c5d9b356dd03cf8',
       updated_at = datetime('now')
 WHERE client_id = '187f7b591f9980c4ad6e4cfa7dd671a5';

DELETE FROM clients WHERE id = '187f7b591f9980c4ad6e4cfa7dd671a5';
