-- CHARUTINHO and LDV / J. A. DE OLIVEIRA identify the same company.
-- Keep the LDV record because it contains the approved client logo.
CREATE TABLE IF NOT EXISTS client_merge_log (
  duplicate_client_id TEXT PRIMARY KEY,
  canonical_client_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  merged_at TEXT NOT NULL
);

INSERT OR IGNORE INTO client_merge_log (duplicate_client_id, canonical_client_id, reason, merged_at)
VALUES (
  'e8a1b26f7d4eb577b2931e22fda17a83',
  '2157c1c5-f9c6-4586-b576-ae842b3bbd1c',
  'Aglutinacao revisada: CHARUTINHO / LDV - J. A. DE OLIVEIRA',
  datetime('now')
);

UPDATE projects
   SET client_id = '2157c1c5-f9c6-4586-b576-ae842b3bbd1c',
       company = 'LDV / J. A. DE OLIVEIRA',
       updated_at = datetime('now')
 WHERE client_id = 'e8a1b26f7d4eb577b2931e22fda17a83';

UPDATE client_steps
   SET client_id = '2157c1c5-f9c6-4586-b576-ae842b3bbd1c',
       updated_at = datetime('now')
 WHERE client_id = 'e8a1b26f7d4eb577b2931e22fda17a83';

UPDATE client_contexts
   SET client_id = '2157c1c5-f9c6-4586-b576-ae842b3bbd1c'
 WHERE client_id = 'e8a1b26f7d4eb577b2931e22fda17a83';

INSERT OR IGNORE INTO journey_template_client_scopes (template_id, client_id, created_at, updated_at)
SELECT template_id, '2157c1c5-f9c6-4586-b576-ae842b3bbd1c', created_at, datetime('now')
  FROM journey_template_client_scopes
 WHERE client_id = 'e8a1b26f7d4eb577b2931e22fda17a83';
DELETE FROM journey_template_client_scopes
 WHERE client_id = 'e8a1b26f7d4eb577b2931e22fda17a83';

INSERT OR IGNORE INTO journey_stage_client_scopes (stage_id, client_id, created_at, updated_at)
SELECT stage_id, '2157c1c5-f9c6-4586-b576-ae842b3bbd1c', created_at, datetime('now')
  FROM journey_stage_client_scopes
 WHERE client_id = 'e8a1b26f7d4eb577b2931e22fda17a83';
DELETE FROM journey_stage_client_scopes
 WHERE client_id = 'e8a1b26f7d4eb577b2931e22fda17a83';

UPDATE journey_step_documents
   SET owner_id = '2157c1c5-f9c6-4586-b576-ae842b3bbd1c',
       updated_at = datetime('now')
 WHERE owner_type = 'client' AND owner_id = 'e8a1b26f7d4eb577b2931e22fda17a83';

DELETE FROM clients WHERE id = 'e8a1b26f7d4eb577b2931e22fda17a83';
