CREATE TABLE IF NOT EXISTS journey_template_client_scopes (
  template_id TEXT PRIMARY KEY REFERENCES journey_templates(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_template_client_scopes_client
  ON journey_template_client_scopes(client_id, template_id);

CREATE TABLE IF NOT EXISTS journey_stage_client_scopes (
  stage_id TEXT PRIMARY KEY REFERENCES journey_stage_library(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stage_client_scopes_client
  ON journey_stage_client_scopes(client_id, stage_id);

CREATE TABLE IF NOT EXISTS journey_stage_merge_log (
  duplicate_stage_id TEXT PRIMARY KEY,
  canonical_stage_id TEXT NOT NULL REFERENCES journey_stage_library(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  merged_at TEXT NOT NULL
);

-- RIA - ADVANCE is a client-specific template. This mapping is intentionally
-- explicit so stages from this template can be offered only for ADVANCE.
INSERT OR IGNORE INTO journey_template_client_scopes
  (template_id, client_id, created_at, updated_at)
SELECT template.id, client.id, datetime('now'), datetime('now')
  FROM journey_templates template
  JOIN clients client ON lower(trim(client.name)) = 'advance'
 WHERE lower(trim(template.name)) = 'ria - advance';

-- These pairs were audited by normalized block content. Names alone are never
-- used to merge stages. Archived rows remain available as history.
INSERT OR IGNORE INTO journey_stage_merge_log VALUES
  ('stage-ff7eccbf-9444-40be-b8e6-6752e1a39d55', 'stage-6527cdf1-1493-415f-a368-e15cff90a1f7', 'normalized document equality', datetime('now')),
  ('stage-7828d551-5920-4060-b09b-7f91bb238daa', 'stage-3cc2a6e3-6ab3-42f8-85ca-a6cd07ec34ff', 'normalized document equality', datetime('now')),
  ('stage-b0ed76f8-62b3-463a-b32d-c87ea4080751', 'stage-63a85c46-5ff7-417e-821e-48988ef816a1', 'normalized document equality', datetime('now')),
  ('stage-d24ae5e7-2839-49f8-8c4d-356f817f1be4', 'stage-e98b93f4-19d8-4638-87a6-14e096da0589', 'normalized document equality', datetime('now'));

UPDATE template_stage_links
   SET stage_id = (SELECT canonical_stage_id FROM journey_stage_merge_log log WHERE log.duplicate_stage_id = template_stage_links.stage_id),
       updated_at = datetime('now')
 WHERE stage_id IN (SELECT duplicate_stage_id FROM journey_stage_merge_log);

UPDATE journey_template_versions
   SET snapshot_json = replace(
         replace(
           replace(
             replace(snapshot_json,
               'stage-ff7eccbf-9444-40be-b8e6-6752e1a39d55', 'stage-6527cdf1-1493-415f-a368-e15cff90a1f7'),
             'stage-7828d551-5920-4060-b09b-7f91bb238daa', 'stage-3cc2a6e3-6ab3-42f8-85ca-a6cd07ec34ff'),
           'stage-b0ed76f8-62b3-463a-b32d-c87ea4080751', 'stage-63a85c46-5ff7-417e-821e-48988ef816a1'),
         'stage-d24ae5e7-2839-49f8-8c4d-356f817f1be4', 'stage-e98b93f4-19d8-4638-87a6-14e096da0589')
 WHERE snapshot_json LIKE '%stage-ff7eccbf-9444-40be-b8e6-6752e1a39d55%'
    OR snapshot_json LIKE '%stage-7828d551-5920-4060-b09b-7f91bb238daa%'
    OR snapshot_json LIKE '%stage-b0ed76f8-62b3-463a-b32d-c87ea4080751%'
    OR snapshot_json LIKE '%stage-d24ae5e7-2839-49f8-8c4d-356f817f1be4%';

UPDATE journey_stage_library
   SET status = 'archived',
       description = 'Consolidada em uma etapa canônica por igualdade exata de conteúdo.',
       updated_at = datetime('now')
 WHERE id IN (SELECT duplicate_stage_id FROM journey_stage_merge_log);

-- A stage is client-specific only when every template that uses it belongs to
-- the same client. Shared stages remain global and reusable.
INSERT OR IGNORE INTO journey_stage_client_scopes
  (stage_id, client_id, created_at, updated_at)
SELECT links.stage_id, min(scope.client_id), datetime('now'), datetime('now')
  FROM template_stage_links links
  JOIN journey_template_client_scopes scope ON scope.template_id = links.template_id
 WHERE NOT EXISTS (
   SELECT 1
     FROM template_stage_links other
     LEFT JOIN journey_template_client_scopes other_scope ON other_scope.template_id = other.template_id
    WHERE other.stage_id = links.stage_id
      AND (other_scope.client_id IS NULL OR other_scope.client_id != scope.client_id)
 )
 GROUP BY links.stage_id
HAVING count(DISTINCT scope.client_id) = 1;
