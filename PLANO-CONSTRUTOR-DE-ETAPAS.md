# Plano de Execucao - Construtor de Etapas

Status: planejado, ainda nao implementado
Ultima atualizacao: 2026-06-30
Projeto: Central de Projetos IA
Stack: Vite, React, TypeScript, Cloudflare Workers, D1 e R2

## 1. Objetivo

Transformar a Jornada em um ambiente configuravel com dois modos:

- Execucao: preencher campos, marcar checklist, enviar evidencias, copiar prompts, registrar resultados e concluir etapas.
- Edicao: montar etapas com blocos, propriedades, regras e condicoes, salvar rascunho e publicar.

O construtor deve atender projetos, clientes e, futuramente, processos internos. Este documento e a fonte de verdade da implementacao. As tarefas CE-* devem ser atualizadas conforme forem executadas.

## 2. Estado atual

A base funcional deve ser preservada:

- journey_templates e journey_steps representam modelos.
- projects e project_steps representam execucoes.
- clients e client_steps representam jornadas de clientes.
- checklist, prompts e links usam tabelas proprias.
- um projeto recebe copias das etapas do template.
- uma jornada real pode virar template.
- arquivos ficam no R2 e hoje sao registrados como links.
- o Worker oferece CRUD generico em /api/tables/*.
- usuarios sao nomes internos, sem autenticacao forte.

Limitacoes:

- objetivo, instrucoes, resultado e observacoes sao campos fixos;
- checklist, prompt e link sao os unicos conteudos dinamicos;
- nao ha rascunho, publicacao, versao ou auditoria estrutural;
- concluir etapa nao usa validacao centralizada;
- operacoes tabela a tabela nao garantem publicacao atomica;
- upload usa Base64 dentro de JSON;
- o usuario selecionado identifica autoria, mas nao e identidade segura.

## 3. Principios

1. A migracao sera aditiva e compativel com as tabelas atuais.
2. Editar template nao altera projetos iniciados.
3. Rascunho so afeta a operacao depois de publicado.
4. O Worker e a autoridade para validar conclusao.
5. Blocos e itens usam IDs estaveis.
6. Condicoes nunca aceitam JavaScript ou SQL do usuario.
7. Reordenacao por arraste tera teclado e botoes equivalentes.
8. Componentes entram por ondas, do simples ao avancado.
9. Publicar nunca apaga respostas, anexos ou historico.
10. O editor segue o Glass Journey System atual.

## 4. Escopo e limites

Incluido:

- modos Execucao e Edicao;
- biblioteca de componentes, canvas e propriedades;
- rascunho, autosave, validacao e publicacao;
- regras de conclusao e progresso;
- anexos R2 por bloco e item;
- templates, snapshots, versoes e auditoria;
- migracao de dados atuais;
- projetos e clientes.

Fora da primeira entrega:

- executar ChatGPT, Claude ou NotebookLM automaticamente;
- formulas ou scripts livres;
- notificacoes externas;
- permissao segura sem login;
- importacao generica de planilhas;
- editor complexo completo em celular.

No MVP, prompt permite copiar, abrir a ferramenta, registrar o resultado e marcar a atividade. Integracao automatica exige credenciais, custos e auditoria.

## 5. Contrato canonico

O JSON enviado evolui para um contrato versionado entre frontend, Worker, snapshots e testes.

~~~json
{
  "schemaVersion": 1,
  "projectId": "123",
  "stepId": "step_001",
  "title": "Criar a conversa de contexto e subir todos os documentos do cliente",
  "status": "em_andamento",
  "revision": 1,
  "blocks": [
    {
      "id": "block_001",
      "type": "long_text",
      "order": 1,
      "title": "Objetivo da etapa",
      "required": true,
      "visible": true,
      "editableInExecution": false,
      "collapsedByDefault": false,
      "config": {
        "mode": "display",
        "content": "Executar a atividade da fase 1..."
      }
    },
    {
      "id": "block_002",
      "type": "checklist",
      "order": 2,
      "title": "Documentos necessarios",
      "required": true,
      "visible": true,
      "editableInExecution": true,
      "config": {
        "completionMode": "all_required",
        "items": [
          {
            "id": "item_001",
            "label": "CNPJ",
            "order": 1,
            "required": true,
            "requiresFile": true,
            "acceptedFileTypes": ["pdf", "jpg", "png"]
          },
          {
            "id": "item_002",
            "label": "Contrato social",
            "order": 2,
            "required": true,
            "requiresFile": true,
            "acceptedFileTypes": ["pdf"]
          }
        ]
      }
    },
    {
      "id": "block_003",
      "type": "prompt",
      "order": 3,
      "title": "Prompt - recebimento de documentos",
      "required": true,
      "visible": true,
      "editableInExecution": true,
      "config": {
        "promptId": null,
        "toolId": null,
        "toolNameSnapshot": "ChatGPT",
        "contentSnapshot": "",
        "expectedOutput": "Confirmacao de recebimento dos arquivos",
        "executionMode": "manual"
      }
    }
  ],
  "completionRules": [
    {
      "id": "rule_001",
      "type": "required_blocks_completed",
      "enabled": true
    },
    {
      "id": "rule_002",
      "type": "all_required_checklist_items_checked",
      "enabled": true
    }
  ]
}
~~~

Regras:

- schemaVersion permite evoluir o formato.
- revision detecta edicao concorrente.
- IDs nao mudam ao editar ou reordenar.
- order e normalizado na publicacao.
- config aceita apenas propriedades validas para o tipo.
- valores preenchidos ficam fora da definicao.
- prompt e ferramenta guardam ID e snapshot textual.
- versao publicada e imutavel.

Definicao responde o que existe e como funciona. Valor responde o que foi preenchido na execucao.

## 6. Componentes

### Onda A - nucleo

| Tipo | Uso | Configuracoes |
| --- | --- | --- |
| section | organizar grupos | titulo, subtitulo, icone, recolhivel |
| short_text | dado curto | placeholder, limite, mascara, padrao |
| long_text | texto exibido ou preenchido | display/input, linhas, limite, recolhivel |
| checklist | conferencia simples ou avancada | itens, prazo, responsavel, evidencia |
| file_upload | documentos | extensoes, quantidade, tamanho, descricao, versao |
| prompt | prompt local ou da biblioteca | ferramenta, texto, entrada, saida, destino |
| date | data ou marco | minima, maxima, passado/futuro |
| due_date | prazo | alerta, atraso, prorrogacao |
| select | escolha | simples/multipla, opcoes, cores |
| status | estado | opcoes, cores, justificativa |
| responsible | atribuicao | usuario, setor, multiplos |
| link | material externo | titulo, URL, descricao |
| comment | historico | autoria, data, resolucao, anexo |

### Onda B - controle

- number, currency, percentage e progress;
- approval, table e priority.

### Onda C - logica

- condition, action_button e calculated.

A Onda C so entra depois de regras, auditoria e recuperacao de erro estarem testadas.

## 7. Experiencia

### Entrada

A Jornada recebe Editar estrutura e o controle Executar | Editar.

No modo Edicao:

- a etapa selecionada permanece;
- o sistema cria ou carrega rascunho;
- aparece Salvando, Rascunho salvo ou Erro ao salvar;
- Publicar fica bloqueado com erros;
- Cancelar restaura a ultima publicacao.

### Layout desktop

Coluna de etapas:

- selecionar, criar, duplicar, excluir e reordenar;
- configurar dependencia, prazo e responsavel;
- indicar erros por etapa.

Canvas:

- blocos na ordem final;
- selecionar, inserir, duplicar, recolher e excluir;
- mover por alca, teclado e botoes;
- mostrar erros no proprio bloco.

Propriedades:

- titulo, descricao, obrigatorio e visibilidade;
- configuracao especifica;
- condicoes, dependencias e impactos;
- ajuda e mensagem de erro.

Biblioteca:

- pesquisa;
- grupos Conteudo, Dados, Controle e Automacao;
- adicao por clique ou arraste.

### Responsividade e visual

- tablet usa gavetas;
- celular mantem Execucao completa;
- edicao simples funciona no celular, mas regras complexas recomendam tela maior;
- nenhuma acao depende somente de arrastar;
- verde indica validade e progresso;
- ambar indica rascunho e pendencia;
- vermelho fechado indica erro;
- Concluir etapa mostra os motivos de bloqueio.

## 8. Modelo D1

A migracao adiciona tabelas sem remover as atuais.

### step_structures

- id;
- journey_step_id, project_step_id ou client_step_id;
- state: draft, published ou archived;
- schema_version, version_number e revision;
- created_by_user_id e updated_by_user_id;
- created_at, updated_at e published_at;
- CHECK garantindo exatamente um proprietario;
- indices unicos parciais para um rascunho corrente por proprietario.

### step_blocks

- id, structure_id e stable_key;
- block_type, title, description e block_order;
- is_required, is_visible, editable_in_execution e collapsed_by_default;
- config_json;
- timestamps;
- UNIQUE(structure_id, stable_key).

config_json e validado conforme block_type.

### step_completion_rules

- id, structure_id, rule_type e rule_order;
- is_enabled;
- config_json;
- message de bloqueio;
- timestamps.

### step_block_values

- id;
- project_step_id ou client_step_id;
- block_stable_key;
- value_json e completion_state;
- updated_by_user_id;
- timestamps;
- UNIQUE por etapa e bloco.

### step_block_files

- id;
- project_step_id ou client_step_id;
- block_stable_key e item_stable_key opcional;
- r2_key, original_name, content_type e size_bytes;
- version_number e replaces_file_id;
- description, category e approval_status;
- uploaded_by_user_id, created_at e deleted_at.

Excluir pela interface faz exclusao logica; uma rotina posterior limpa o R2.

### step_structure_versions

- proprietario;
- version_number e schema_version;
- snapshot_json e change_summary;
- published_by_user_id e published_at;
- hash opcional de integridade.

### structure_audit_events

- entity_type, entity_id e action;
- before_json e after_json;
- actor_user_id e actor_name_snapshot;
- created_at e request_id.

A auditoria e operacional, nao juridica, enquanto nao houver autenticacao.

## 9. Motor de regras

Regras iniciais:

- required_blocks_completed;
- all_required_checklist_items_checked;
- required_files_uploaded;
- required_prompts_completed;
- required_approvals_granted;
- required_fields_filled;
- no_blocking_status;
- custom_condition_met.

Resposta:

~~~json
{
  "canComplete": false,
  "progress": 67,
  "blockingReasons": [
    {
      "code": "required_file_missing",
      "blockId": "block_002",
      "itemId": "item_001",
      "message": "Anexe o CNPJ para concluir a etapa."
    }
  ]
}
~~~

Operadores: equals, not_equals, in, not_in, contains, comparacoes numericas, is_empty, is_not_empty, all, any e not.

Efeitos: mostrar, ocultar, tornar obrigatorio, bloquear conclusao, definir status, liberar proxima etapa e criar pendencia.

Nao aceitar codigo livre.

Progresso:

- blocos informativos nao contam;
- blocos obrigatorios executaveis contam;
- checklist pode contar por item;
- pesos ficam para a Onda B;
- o Worker calcula o valor oficial.

## 10. API de dominio

O CRUD generico continua temporariamente. O construtor usa endpoints proprios.

Leitura:

- GET /api/projects/:projectId/steps/:stepId/structure
- GET /api/clients/:clientId/steps/:stepId/structure
- GET /api/templates/:templateId/steps/:stepId/structure
- GET /api/steps/:stepId/completion
- GET /api/steps/:stepId/history

Edicao:

- POST /api/steps/:stepId/draft
- PUT /api/steps/:stepId/draft
- POST /api/steps/:stepId/validate
- POST /api/steps/:stepId/publish
- DELETE /api/steps/:stepId/draft
- POST /api/steps/:stepId/restore/:versionId

Execucao:

- PATCH /api/steps/:stepId/values/:blockKey
- POST /api/steps/:stepId/complete
- POST /api/steps/:stepId/reopen
- POST /api/steps/:stepId/prompts/:blockKey/complete
- POST /api/steps/:stepId/approvals/:blockKey

Arquivos:

- POST /api/steps/:stepId/blocks/:blockKey/files
- GET /api/steps/:stepId/blocks/:blockKey/files
- DELETE /api/files/:fileId
- GET /api/files/:fileId/content

Trocar Base64 por multipart/form-data. Para arquivos grandes, usar multipart ou URL assinada. O Worker valida MIME, extensao, tamanho e quantidade.

Concorrencia:

- toda gravacao envia revision;
- revisao antiga retorna HTTP 409;
- publicacao usa DB.batch;
- conclusao valida, muda status e libera proxima etapa atomicamente;
- request_id evita duplicacao.

## 11. Validacao

Erros bloqueantes:

- etapa ou bloco sem titulo;
- tipo desconhecido ou configuracao invalida;
- IDs ou ordens duplicados;
- prompt obrigatorio sem conteudo;
- botao sem acao permitida;
- regra ou dependencia quebrada;
- ciclo de dependencias;
- campo obrigatorio sempre oculto;
- arquivo obrigatorio invalido;
- aprovacao obrigatoria sem aprovador.

Avisos:

- etapa sem objetivo;
- bloco opcional sem descricao;
- checklist sem itens obrigatorios;
- nenhum bloco contando no progresso;
- alteracao que afeta valores preenchidos.

## 12. Templates e versoes

Criar projeto por template copia a estrutura publicada para project_steps.

- template novo afeta projetos futuros;
- projeto iniciado mantem seu snapshot;
- atualizar projeto exige previa e confirmacao;
- publicacao cria versao, nunca edita versao antiga.

Acoes:

- salvar etapa ou jornada como template;
- duplicar, comparar e restaurar versoes;
- aplicar etapa a projeto existente;
- identificar projetos por versao.

Versao menor: texto ou configuracao compativel.
Versao maior: remocao de bloco, regra ou mudanca estrutural.

## 13. Permissoes

Perfis desejados:

- Administrador: tudo.
- Gestor: estrutura operacional.
- Usuario: preencher e executar.
- Visualizador: ler.

MVP aberto:

- adicionar role a app_users;
- enviar X-App-User-Id;
- ocultar edicao por perfil;
- registrar autoria informada;
- documentar que nao e seguranca.

Autorizacao real exige identidade verificada no Worker, em fase futura.

## 14. Autosave

1. Entrar em Edicao cria/carrega rascunho.
2. Interface atualiza localmente.
3. Apos pequena pausa, envia documento e revision.
4. Worker valida, salva e incrementa revision.
5. Interface mostra Rascunho salvo.
6. Conflito interrompe autosave e oferece comparar/recarregar.
7. Publicar executa validacao completa.
8. Cancelar confirma quando houver mudancas.

Copia local temporaria serve apenas para recuperar falha de rede.

## 15. Migracao

Ordem:

1. Novas tabelas e indices.
2. Novos endpoints sem remover /api/tables.
3. Adaptador legado para blocos.
4. Backfill idempotente.
5. Comparacao de contagens e amostras.
6. Novo renderer por flag.
7. Modo Edicao.
8. Campos antigos somente leitura.
9. Remocao do legado apenas em migracao futura.

Conversao:

| Origem | Destino |
| --- | --- |
| objective | long_text display |
| execution_instructions | long_text display |
| expected_output | long_text display |
| notes | long_text input |
| checklist | bloco checklist |
| prompts | blocos prompt |
| links | link ou file_upload |

O backfill preserva referencias, nao sobrescreve estrutura migrada e gera relatorio de falhas.

## 16. Fases

### Fase 0 - Contrato e protecao

- [ ] CE-001 Aprovar este documento.
- [ ] CE-002 Criar tipos TypeScript discriminados.
- [ ] CE-003 Criar validador schemaVersion 1.
- [ ] CE-004 Fazer backup/export do D1.
- [ ] CE-005 Criar flags do renderer/editor.
- [ ] CE-006 Definir limites de arquivo.

Aceite: contrato valida e backup e restauravel.

### Fase 1 - D1 e API

- [ ] CE-101 Criar migration.
- [ ] CE-102 Criar indices, CHECKs e FKs.
- [ ] CE-103 Implementar leitura agregada.
- [ ] CE-104 Implementar rascunho com revision.
- [ ] CE-105 Implementar publicacao com DB.batch.
- [ ] CE-106 Implementar auditoria.
- [ ] CE-107 Testar D1 local.

Aceite: estrutura e criada, salva, publicada e lida sem UI nova.

### Fase 2 - Migracao e Execucao

- [ ] CE-201 Criar adaptador legado.
- [ ] CE-202 Criar backfill.
- [ ] CE-203 Migrar textos, checklist, prompts e links.
- [ ] CE-204 Criar renderer por tipo.
- [ ] CE-205 Preservar projetos e clientes.
- [ ] CE-206 Comparar antes/depois.
- [ ] CE-207 Ativar por flag com fallback.

Aceite: dados existentes continuam iguais e executaveis.

### Fase 3 - Construtor MVP

- [ ] CE-301 Criar Executar | Editar.
- [ ] CE-302 Criar biblioteca.
- [ ] CE-303 Criar canvas.
- [ ] CE-304 Criar reordenacao acessivel.
- [ ] CE-305 Criar propriedades.
- [ ] CE-306 Implementar Onda A.
- [ ] CE-307 Criar autosave.
- [ ] CE-308 Criar validacao visual.
- [ ] CE-309 Publicar, cancelar e restaurar.

Aceite: etapa e montada, publicada e executada sem Configuracoes.

### Fase 4 - Regras e arquivos

- [ ] CE-401 Motor de regras no Worker.
- [ ] CE-402 Feedback no frontend.
- [ ] CE-403 Endpoint atomico de conclusao.
- [ ] CE-404 Motivos de bloqueio.
- [ ] CE-405 Liberar proxima etapa.
- [ ] CE-406 Upload multipart/form-data.
- [ ] CE-407 Metadados e versoes.
- [ ] CE-408 Validacao de arquivos.

Aceite: regra nao e burlada e anexos sao rastreaveis.

### Fase 5 - Templates e historico

- [ ] CE-501 Salvar etapa.
- [ ] CE-502 Salvar jornada.
- [ ] CE-503 Comparar versoes.
- [ ] CE-504 Restaurar rascunho.
- [ ] CE-505 Aplicar etapa existente.
- [ ] CE-506 Auditar alteracoes.
- [ ] CE-507 Exibir historico.

### Fase 6 - Avancados

- [ ] CE-601 Numero, moeda e percentual.
- [ ] CE-602 Progresso calculado.
- [ ] CE-603 Aprovacao.
- [ ] CE-604 Tabela tipada.
- [ ] CE-605 Condicoes.
- [ ] CE-606 Acoes permitidas.
- [ ] CE-607 Ciclos e referencias.

### Fase 7 - Seguranca e automacao

- [ ] CE-701 Definir identidade.
- [ ] CE-702 Autorizar no Worker.
- [ ] CE-703 Proteger arquivos.
- [ ] CE-704 Notificacoes.
- [ ] CE-705 Avaliar IA por API.

## 17. Testes

Unidade:

- contrato por bloco;
- condicoes e progresso;
- ciclos;
- adaptador legado;
- conclusao;
- versao.

Integracao:

- rascunho, conflito e publicacao;
- rollback de lote;
- conclusao valida/invalida;
- liberar proxima etapa;
- preservar valores;
- criar e salvar templates.

R2:

- upload e rejeicoes;
- evidencia por item;
- versao e exclusao logica;
- falha parcial sem inconsistencia.

Ponta a ponta:

1. Criar projeto.
2. Montar etapa.
3. Adicionar checklist, arquivo e prompt.
4. Reordenar por mouse e teclado.
5. Salvar e publicar.
6. Tentar concluir com pendencia.
7. Corrigir e concluir.
8. Salvar template.
9. Criar outro projeto.
10. Confirmar independencia do primeiro.

Regressao: usuarios, projetos, clientes, configuracoes, prompts, upload, Worker, D1 e R2.

## 18. Publicacao e rollback

Ordem:

1. Backup.
2. Migration aditiva.
3. Worker compativel.
4. Frontend com flags desligadas.
5. Backfill e relatorio.
6. Ativar para Patrick.
7. Ativar editor.
8. Ativar regras.
9. Ampliar usuarios.

Rollback:

- desligar flags;
- voltar ao renderer legado;
- preservar tabelas novas;
- restaurar D1 apenas em corrupcao;
- nunca usar DROP TABLE na mesma entrega.

## 19. Aceite final

- montar etapa sem Configuracoes;
- CRUD e reordenacao de blocos;
- rascunho separado;
- autosave confiavel;
- conflito detectado;
- conclusao validada no Worker;
- motivos de bloqueio claros;
- arquivos rastreaveis;
- dados atuais preservados;
- template sem efeito retroativo;
- historico com data e usuario informado;
- layout sem sobreposicao;
- build, testes e deploy aprovados.

## 20. Indicadores

- bloqueios por regra;
- blocos mais usados;
- prompts pendentes;
- arquivos ausentes;
- tempo por etapa;
- rascunhos abandonados;
- erros de autosave;
- conflitos;
- versoes em uso;
- projetos no legado.

## 21. Decisoes abertas

| Decisao | Prazo | Recomendacao |
| --- | --- | --- |
| limite de arquivo | Fase 4 | por bloco e teto no Worker |
| editor rico | Fase 3 | texto simples no MVP |
| atualizar por template | Fase 5 | previa e aplicacao manual |
| editor no celular | Fase 3 | execucao completa; edicao complexa em desktop |
| autenticacao | Fase 7 | avaliar Access com identidades |
| prompt automatico | Fase 7 | manual ate custo e segredo definidos |

## 22. Acompanhamento

| Fase | Status | Evidencia |
| --- | --- | --- |
| 0. Contrato | Pendente | tipos, validador, backup, flags |
| 1. D1 e API | Pendente | migration e endpoints |
| 2. Migracao | Pendente | paridade legado/novo |
| 3. Construtor | Pendente | editor em preview |
| 4. Regras | Pendente | conclusao e anexos |
| 5. Templates | Pendente | versoes e auditoria |
| 6. Avancados | Pendente | blocos testados |
| 7. Seguranca | Pendente | identidade no Worker |

Status permitidos: Pendente, Em andamento, Concluido, Bloqueado ou Adiado.

Ao concluir CE-*:

1. marcar checkbox;
2. atualizar fase;
3. adicionar commit/PR;
4. registrar migration;
5. registrar testes;
6. anotar mudanca de decisao.

## 23. Decisoes registradas

| Data | Decisao | Motivo |
| --- | --- | --- |
| 2026-06-30 | blocos tipados com config_json e valores separados | flexibilidade com validacao |
| 2026-06-30 | preservar tabelas atuais | risco e rollback |
| 2026-06-30 | snapshot ao aplicar template | impedir mudanca retroativa |
| 2026-06-30 | prompt manual no MVP | segredo, custo e auditoria |
| 2026-06-30 | perfis atuais sao operacionais | nome nao e autenticacao |

## 24. Referencias

- D1 batch: https://developers.cloudflare.com/d1/worker-api/d1-database/
- D1 prepared statements: https://developers.cloudflare.com/d1/worker-api/prepared-statements/
- R2 uploads: https://developers.cloudflare.com/r2/objects/upload-objects/
- Workers Static Assets: https://developers.cloudflare.com/workers/wrangler/configuration/#assets
- JSON Schema conditions: https://json-schema.org/understanding-json-schema/reference/conditionals
- HTML Drag and Drop: https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API
- Keyboard: https://developer.mozilla.org/en-US/docs/Web/Accessibility/Guides/Understanding_WCAG/Keyboard

## 25. Proxima acao

Executar apenas a Fase 0: tipos TypeScript, validador e backup do D1. Nao reescrever a tela antes de esses itens estarem verificados.
