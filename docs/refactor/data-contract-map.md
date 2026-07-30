# Mapa de contratos de dados

Status: Fase 0 concluida em 2026-07-30.

| Dominio | Persistencia | Leitura de tela | Regra de compatibilidade |
| --- | --- | --- | --- |
| Estrutura de etapa | `journey_step_documents` | endpoint de jornada ou de etapa | legado so alimenta inicializacao explicita |
| Valor de bloco | `journey_step_values` | payload de etapa | nunca entra em template por acidente |
| Arquivo de etapa | `journey_step_files` e R2 | endpoint `journey-files` | recurso-modelo fica no template; evidencia fica na execucao |
| Sumario | tabelas `project_summaries` | bloco `project_summary` por `config.summaryId` | a vinculacao do bloco vence a versao ativa do projeto |
| Template | documentos `owner_type=template` | template por ID | copia estrutura, regras e recursos-modelo deliberados |
| Contexto | valor do bloco `context` | payload de etapa | so entra no template por promocao explicita |

## Endpoints de dominio existentes

- `GET /api/projects/:id/journey`
- `GET /api/clients/:id/journey`
- `GET /api/project-steps/:stepId/structure`
- `POST|PATCH|DELETE /api/project-steps/:stepId/blocks/...`
- `PATCH /api/project-steps/:stepId/block-values/:blockId`
- `POST /api/project-steps/:stepId/contexts`
- `POST /api/summaries/:summaryId/consolidate`
- `POST /api/summaries/:summaryId/prompts`
- `GET|POST|DELETE /api/journey-files/:ownerType/:stepId/:blockId`

## Regras de transicao

1. `/api/tables/*` permanece somente para cadastros administrativos durante a migracao por tela.
2. Nenhuma leitura cria `StepDocument`; inicializacao e operacao explicita.
3. `summaryId` informado e inexistente deve mostrar erro de vinculacao, nunca outra versao silenciosamente.
