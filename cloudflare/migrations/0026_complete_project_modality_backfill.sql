UPDATE projects
   SET project_modality_id = 'type-rca-pca',
       project_type_id = '5ce32ecd-3904-42c9-89f3-3cd20b110a83'
 WHERE project_modality_id IS NULL
   AND (
     upper(name) LIKE '%RCA - PCA%'
     OR upper(name) LIKE '%RCA + PCA%'
   );

-- Every project belongs to one of the four principal types. A missing modality
-- is deliberately retained when the project name is not enough to classify it.
UPDATE projects
   SET project_type_id = '5ce32ecd-3904-42c9-89f3-3cd20b110a83'
 WHERE project_type_id IS NULL;
