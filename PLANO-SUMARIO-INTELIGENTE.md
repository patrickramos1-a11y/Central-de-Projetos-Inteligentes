# Plano de Execucao - Modulo de Sumario Inteligente

Status: MVP funcional implementado e publicado; refinamentos permanecem pendentes
Ultima atualizacao: 2026-07-01
Projeto: Central de Projetos IA
Stack atual: Vite, React, TypeScript, Cloudflare Workers, D1 e R2

## Atualizacao de execucao - 2026-07-01

Implementado e validado:

- migration D1 `0004_intelligent_summary.sql` aplicada no D1 remoto;
- parser hierarquico, avisos e preview consolidado;
- painel de importacao, revisao, selecao pai/filho e consolidacao;
- versoes de sumario e arquivamento da versao ativa anterior;
- complementos configuraveis e gerador de prompt por topico;
- copia, download Markdown e historico de prompts gerados;
- build Vite/TypeScript aprovado;
- testes unitarios do parser aprovados e API publica validada.

Implementado parcialmente:

- status e observacoes por topico existem, mas filtros e progresso no card do projeto ainda faltam;
- versoes sao armazenadas, mas comparacao e restauracao ainda nao possuem interface dedicada;
- o modulo aparece na Jornada, mas ainda nao associa topicos a fases/contextos nem aplica regras de conclusao no Worker.

Pendente:

- filtros, progresso integrado e destaque operacional completo;
- uso de contextos salvos e associacao de topicos a fases;
- regras server-side para conclusao das etapas de sumario/escrita;
- comparacao/restauracao, exportacao de pendencias, parser avancado e metricas.

## 1. Objetivo

Criar o Modulo de Sumario Inteligente dentro da Central de Projetos IA para transformar um sumario bruto colado pelo usuario em uma estrutura operacional do projeto.

O modulo deve permitir:

- importar um sumario bruto;
- identificar topicos e subtopicos;
- revisar, limpar, editar e selecionar itens;
- salvar uma versao consolidada ativa;
- transformar os itens selecionados em checklist de desenvolvimento textual;
- controlar status topico por topico;
- gerar prompts personalizados para desenvolver cada topico com IA;
- registrar o historico de prompts gerados.

O objetivo nao e gerar texto automaticamente nesta fase. O objetivo e organizar o sumario, montar bons prompts e permitir copiar para ChatGPT, Claude, NotebookLM ou outra ferramenta.

## 2. Conclusao do estudo

O conceito e coerente com a direcao atual da plataforma.

A Central deixou de ser apenas um cadastro de prompts e virou uma plataforma de jornadas. Dentro dessa logica, o Sumario Inteligente deve ser tratado como uma etapa operacional forte da jornada de projetos ambientais.

A melhor leitura de produto e:

> O sumario nao e um documento solto. Ele e uma estrutura executavel que guia a escrita topico por topico.

O modulo deve nascer vinculado ao projeto real, nao apenas ao template. Ele pode aparecer dentro da etapa de "Sumario do Projeto", mas os dados precisam pertencer ao projeto como um todo, porque o sumario influencia varias etapas posteriores da jornada.

## 3. Estado atual do repositorio

O repositorio ja possui uma base aproveitavel:

- `projects` representa projetos reais.
- `project_steps` representa etapas executaveis de projetos.
- `journey_templates` e `journey_steps` representam modelos.
- `project_step_checklist_items` controla checklist por etapa.
- `project_step_prompts` controla prompts por etapa.
- `project_step_links` registra links e materiais.
- `prompts` guarda a biblioteca geral de prompts.
- `ai_tools` guarda ChatGPT, Claude, NotebookLM e outras ferramentas.
- `project_step_phases` e `project_step_contexts` ja aparecem como trabalho em andamento para dividir etapas longas e salvar contextos reutilizaveis.
- O Worker oferece CRUD generico em `/api/tables/*`.
- O R2 ja esta ligado ao Worker pelo binding `FILES`.

Tambem existe o plano `PLANO-CONSTRUTOR-DE-ETAPAS.md`, que descreve um futuro construtor generico de blocos, regras e publicacao.

## 4. Coerencia com o Construtor de Etapas

O Sumario Inteligente nao substitui o Construtor de Etapas.

Ele deve ser uma funcionalidade especializada que podera, no futuro, virar um bloco do construtor.

Recomendacao:

- MVP do Sumario Inteligente: implementar como modulo proprio dentro da Jornada do Projeto.
- Futuro: transformar o modulo em um tipo de bloco especializado do Construtor de Etapas, por exemplo `project_summary`.

Motivo:

- O Sumario Inteligente tem regras proprias de parsing, hierarquia, versao ativa, itens executaveis e geracao de prompts.
- Esperar o construtor completo atrasaria uma funcionalidade que tem valor operacional imediato.
- Implementar separado, mas com contrato limpo, permite integrar depois sem retrabalho grande.

## 5. Decisao de arquitetura

O sumario deve ser modelado no nivel do projeto.

Tabela principal:

- `project_summaries`

Itens do sumario:

- `project_summary_items`

Complementos de prompt:

- `prompt_blocks`

Historico de prompts gerados:

- `generated_prompts`

Por que nao salvar tudo em `project_steps`?

- Uma etapa e uma parte da jornada.
- O sumario e uma estrutura do projeto inteiro.
- Um projeto pode revisar o sumario varias vezes.
- Os topicos do sumario podem ser usados em mais de uma etapa.
- A escrita topico a topico precisa de status independente da etapa principal.

Por que nao salvar como texto unico?

- Nao permite marcar topicos.
- Nao permite status por topico.
- Nao permite prompt por topico.
- Nao preserva hierarquia de forma confiavel.
- Nao gera progresso textual.

## 6. Relacao com a jornada ambiental atual

A jornada ambiental padrao ja possui etapas relacionadas ao sumario:

- explicar o projeto e pedir um sumario inicial;
- limpar e estruturar o sumario;
- enviar contexto adicional do topico a desenvolver;
- pedir desenvolvimento do topico ou subtopico;
- refinar com direcionamentos.

O Sumario Inteligente deve encaixar exatamente nessa regiao da jornada.

Fluxo recomendado:

1. A etapa "Explicar o projeto e pedir um sumario inicial" continua como orientacao operacional.
2. A etapa "Limpar e estruturar o sumario" passa a conter ou abrir o Modulo de Sumario Inteligente.
3. Depois de consolidado, os topicos viram checklist de desenvolvimento.
4. As etapas de escrita topico a topico usam o sumario consolidado como fonte.

Na fase futura de regras, a etapa de sumario podera exigir:

- existencia de sumario ativo;
- pelo menos um item selecionado;
- topicos com hierarquia valida;
- sumario consolidado copiado ou revisado.

## 7. Fluxo operacional proposto

### 7.1 Entrada na jornada

Dentro da tela da Jornada do Projeto, incluir uma area chamada:

**Sumario do Projeto**

Estados possiveis:

- sem sumario;
- rascunho importado;
- aguardando revisao;
- consolidado;
- em desenvolvimento;
- concluido.

Acoes principais:

- Importar sumario;
- Revisar sumario;
- Copiar sumario consolidado;
- Gerar checklist textual;
- Gerar prompt por topico.

### 7.2 Importacao

O usuario clica em **Importar Sumario**.

O sistema abre um modal com:

- campo grande para colar sumario bruto;
- botao Analisar;
- botao Cancelar.

O texto bruto deve ser preservado integralmente em `project_summaries.raw_text`.

### 7.3 Analise

Ao clicar em **Analisar**, o sistema identifica linhas que parecem topicos.

Padroes do MVP:

- `1. Introducao`
- `1 Introducao`
- `1 - Introducao`
- `1) Introducao`
- `1.1 Localizacao`
- `1.1.1 Caracterizacao da Area`

Padroes futuros:

- `I. Introducao`
- `CAPITULO 1 - Introducao`
- letras ou anexos;
- sumarios com pontilhado e pagina;
- linhas extraidas de PDF/Word com ruído.

Cada item identificado deve conter:

- `topic_number`;
- `title`;
- `level`;
- `parent_id` calculado;
- `sort_order`;
- `original_text`;
- `is_selected`;
- `parse_confidence`;
- `parse_warning`.

### 7.4 Revisao

O sistema abre uma lista hierarquica com checkboxes.

O usuario pode:

- marcar e desmarcar topicos;
- editar titulo;
- remover item;
- adicionar topico;
- adicionar subtopico;
- reorganizar ordem;
- visualizar previa do sumario final.

Regras:

- Se um topico pai for desmarcado, os filhos devem ser desmarcados ou ficar inativos.
- Se um subtitulo for marcado, o pai precisa estar marcado.
- Itens nao selecionados podem ficar no historico, mas nao entram no sumario consolidado.
- A hierarquia precisa ser preservada.

### 7.5 Consolidacao

Ao clicar em **Salvar Sumario Consolidado**, o sistema:

- arquiva a versao ativa anterior, se existir;
- cria nova versao ativa;
- salva os itens selecionados;
- gera o texto consolidado;
- inicia os status dos itens executaveis como `pendente`;
- calcula progresso textual inicial.

### 7.6 Execucao topico por topico

A tela passa a mostrar uma checklist de desenvolvimento textual.

Status dos itens:

- `pendente`;
- `em_andamento`;
- `desenvolvido`;
- `em_revisao`;
- `concluido`;
- `bloqueado`;
- `arquivado`.

O usuario deve conseguir:

- filtrar por status;
- selecionar um topico;
- gerar prompt;
- marcar como desenvolvido;
- marcar como revisado;
- marcar como concluido;
- registrar observacoes.

### 7.7 Geracao de prompt

Ao selecionar um topico e clicar em **Gerar Prompt**, abrir um modal com:

- topico selecionado;
- sumario consolidado;
- prompt base;
- complementos selecionaveis;
- observacoes adicionais;
- previa do prompt final;
- botao Copiar Prompt Final;
- botao Salvar Historico.

O prompt final deve ser montado por composicao, nao hardcoded.

Estrutura recomendada:

1. prompt base;
2. dados do projeto;
3. contexto geral do projeto;
4. sumario consolidado;
5. topico selecionado;
6. complementos selecionados;
7. observacoes do usuario;
8. resultado esperado.

## 8. Modelo D1 recomendado

### 8.1 `project_summaries`

Representa uma versao de sumario de um projeto.

Campos:

- `id`;
- `project_id`;
- `raw_text`;
- `consolidated_text`;
- `version_number`;
- `status`: `draft`, `active`, `archived`;
- `parse_status`: `not_analyzed`, `analyzed`, `needs_review`, `reviewed`;
- `item_count`;
- `selected_item_count`;
- `created_by`;
- `created_at`;
- `updated_at`;
- `activated_at`;
- `archived_at`.

Indices:

- por `project_id`;
- por `project_id, status`;
- unico parcial ou regra no Worker para apenas uma versao ativa por projeto.

### 8.2 `project_summary_items`

Representa topico ou subtopico.

Campos:

- `id`;
- `summary_id`;
- `project_id`;
- `parent_id`;
- `topic_number`;
- `title`;
- `level`;
- `sort_order`;
- `original_text`;
- `is_selected`;
- `status`: `pendente`, `em_andamento`, `desenvolvido`, `em_revisao`, `concluido`, `bloqueado`, `arquivado`;
- `notes`;
- `parse_confidence`;
- `parse_warning`;
- `created_at`;
- `updated_at`.

Indices:

- por `summary_id, sort_order`;
- por `project_id, status`;
- por `parent_id`.

### 8.3 `prompt_blocks`

Representa complementos reutilizaveis de prompt.

Campos:

- `id`;
- `title`;
- `description`;
- `content`;
- `category`;
- `ai_tool_id`;
- `project_type_id`;
- `journey_step_id`;
- `status`: `ativo`, `inativo`, `arquivado`;
- `created_at`;
- `updated_at`.

Observacao:

O sistema ja possui `prompts`. A recomendacao e manter `prompts` para prompts base completos e criar `prompt_blocks` para complementos menores.

### 8.4 `generated_prompts`

Historico de prompts gerados.

Campos:

- `id`;
- `project_id`;
- `summary_id`;
- `summary_item_id`;
- `base_prompt_id`;
- `base_prompt_snapshot`;
- `selected_blocks_json`;
- `final_prompt`;
- `notes`;
- `ai_tool_id`;
- `created_by`;
- `created_at`.

Importante:

Salvar snapshots do prompt base e dos complementos usados. Assim, se alguem editar a biblioteca depois, o historico continua fiel ao que foi copiado na epoca.

## 9. Contrato de parsing

Criar uma funcao pura para analisar sumarios.

Entrada:

~~~ts
type SummaryParseInput = {
  rawText: string;
};
~~~

Saida:

~~~ts
type SummaryParseResult = {
  items: ParsedSummaryItem[];
  warnings: SummaryParseWarning[];
  consolidatedPreview: string;
};
~~~

Item:

~~~ts
type ParsedSummaryItem = {
  id: string;
  topicNumber: string;
  title: string;
  level: number;
  parentTopicNumber: string | null;
  originalText: string;
  sortOrder: number;
  selected: boolean;
  confidence: number;
  warning?: string;
};
~~~

Regras iniciais:

- linhas vazias sao ignoradas;
- numeracao define hierarquia;
- `1.2.3` tem nivel 3;
- parent de `1.2.3` e `1.2`;
- linhas sem padrao podem virar aviso;
- texto original nunca deve ser perdido;
- analise deve ser deterministica, sem chamada de IA.

## 10. API de dominio

O CRUD generico pode continuar existindo, mas este modulo deve ter endpoints de dominio para operacoes que exigem regras.

Leitura:

- `GET /api/projects/:projectId/summary`
- `GET /api/projects/:projectId/summary/history`
- `GET /api/projects/:projectId/summary/items`
- `GET /api/prompt-blocks`
- `GET /api/generated-prompts?projectId=...`

Analise e consolidacao:

- `POST /api/projects/:projectId/summary/analyze`
- `POST /api/projects/:projectId/summary/consolidate`
- `PATCH /api/project-summary-items/:itemId`
- `POST /api/project-summary-items/:itemId/status`

Prompt:

- `POST /api/project-summary-items/:itemId/generate-prompt`
- `POST /api/generated-prompts`

Administracao:

- `POST /api/admin/summary/backfill`
- `POST /api/admin/prompt-blocks/seed`

O Worker deve validar:

- projeto existe;
- sumario pertence ao projeto;
- apenas uma versao ativa;
- parent/child coerentes;
- itens selecionados possuem pais selecionados;
- status permitido;
- prompt base existe quando informado;
- complementos existem e estao ativos quando usados.

## 11. Interface

### 11.1 Area dentro da Jornada do Projeto

Criar um painel `ProjectSummaryPanel`.

Posicao recomendada:

- dentro da Jornada do Projeto;
- perto das fases/contextos da etapa;
- com destaque quando a etapa atual for relacionada ao sumario;
- acessivel tambem por uma acao rapida no topo da jornada.

Estados visuais:

- sem sumario: convite para importar;
- rascunho analisado: revisar;
- consolidado: checklist e progresso;
- com pendencias: destaque ambar;
- concluido: progresso verde.

### 11.2 Modal de importacao

Campos:

- texto bruto;
- observacao opcional;
- botao Analisar Sumario.

Boas praticas:

- contador de linhas;
- aviso de que o texto bruto sera preservado;
- preview simples antes de salvar.

### 11.3 Modal de revisao

Elementos:

- lista hierarquica;
- checkbox por item;
- campo editavel para titulo;
- botoes adicionar/remover;
- controle mover para cima/baixo;
- preview do sumario final;
- contador de selecionados;
- alertas de linhas duvidosas.

### 11.4 Checklist textual

Elementos:

- lista de topicos;
- status;
- filtro;
- progresso geral;
- botao gerar prompt;
- botao copiar topico;
- botao marcar como desenvolvido;
- campo de observacoes.

### 11.5 Gerador de prompt

Elementos:

- topico selecionado;
- sumario consolidado;
- prompt base selecionado;
- complementos por categoria;
- observacoes adicionais;
- preview do prompt final;
- botao copiar;
- botao salvar historico.

## 12. Integracao com dados existentes

### `prompts`

Usar para prompt base de desenvolvimento de topico.

Criar ou cadastrar depois um prompt base como:

- "Desenvolver topico tecnico ambiental";
- ferramenta sugerida: ChatGPT ou Claude;
- variaveis: projeto, cliente, sumario, topico, contexto, complementos.

### `prompt_categories`

Pode categorizar:

- desenvolvimento textual;
- revisao;
- legislacao;
- normas;
- anexos;
- pendencias.

### `ai_tools`

Usar para indicar ferramenta preferencial no prompt final.

### `project_step_contexts`

Pode alimentar o campo "contexto geral do projeto" ou contexto especifico de etapa.

Recomendacao:

- no MVP, permitir incluir manualmente um contexto salvo no prompt;
- em fase futura, selecionar quais contextos entram na geracao.

### `project_step_phases`

Pode ser usado para organizar a etapa de sumario em partes menores:

- importar;
- revisar;
- consolidar;
- gerar prompts;
- desenvolver topicos.

### `project_step_prompts`

Continuam existindo para prompts fixos da etapa.

O Gerador de Prompt por Topico nao deve gravar em `project_step_prompts`, porque ele gera historico variavel por topico. Deve gravar em `generated_prompts`.

## 13. Regras de negocio

1. Um projeto pode ter varias versoes de sumario.
2. Apenas uma versao pode estar ativa.
3. Itens nao selecionados ficam no historico, mas nao entram no checklist textual.
4. Subtopico selecionado exige topico pai selecionado.
5. Topico pai desmarcado desmarca ou inativa subtitulos.
6. O usuario pode editar titulos antes de consolidar.
7. O sistema preserva a hierarquia.
8. O progresso textual considera apenas itens selecionados.
9. Prompt final e gerado por composicao de blocos.
10. Complementos sao configuraveis, nao hardcoded.
11. Historico salva snapshots.
12. O sistema nao chama IA no MVP.
13. Copiar prompt deve ser a acao primaria.
14. O sumario ativo deve ser facil de copiar integralmente.
15. Toda geracao deve registrar usuario informado quando houver `currentUserId`.

## 14. Fases de implementacao

### Fase 0 - Validacao de produto e contrato

- [ ] SI-001 Aprovar este plano.
- [ ] SI-002 Definir se o painel aparece em todas as etapas ou apenas nas etapas de sumario.
- [ ] SI-003 Definir status finais dos itens.
- [ ] SI-004 Definir prompt base inicial a ser cadastrado depois.
- [ ] SI-005 Definir complementos iniciais.
- [ ] SI-006 Definir se a analise roda no frontend, Worker ou ambos.

Aceite:

- decisoes registradas;
- contrato de dados aprovado;
- nenhum codigo de producao alterado.

### Fase 1 - Modelo D1 e tipos

- [ ] SI-101 Criar migration D1 para `project_summaries`.
- [ ] SI-102 Criar migration D1 para `project_summary_items`.
- [ ] SI-103 Criar migration D1 para `prompt_blocks`.
- [ ] SI-104 Criar migration D1 para `generated_prompts`.
- [ ] SI-105 Atualizar `tableColumns` no Worker.
- [ ] SI-106 Criar tipos TypeScript.
- [ ] SI-107 Criar funcoes puras de status e progresso.

Aceite:

- migration local aplica sem erro;
- Worker lista as novas tabelas;
- build passa.

### Fase 2 - Parser de sumario

- [ ] SI-201 Criar `parseProjectSummary`.
- [ ] SI-202 Reconhecer numeracoes MVP.
- [ ] SI-203 Preservar texto original.
- [ ] SI-204 Calcular nivel, pai e ordem.
- [ ] SI-205 Gerar avisos de linhas duvidosas.
- [ ] SI-206 Criar testes unitarios.
- [ ] SI-207 Criar preview consolidado.

Aceite:

- exemplos do anexo sao parseados;
- itens pai/filho ficam corretos;
- parser nao chama IA;
- testes cobrem entradas comuns e linhas invalidas.

### Fase 3 - Importar, revisar e consolidar

- [ ] SI-301 Criar `ProjectSummaryPanel`.
- [ ] SI-302 Criar modal de importacao.
- [ ] SI-303 Criar modal de revisao hierarquica.
- [ ] SI-304 Permitir editar titulo.
- [ ] SI-305 Permitir marcar/desmarcar.
- [ ] SI-306 Aplicar regras pai/filho.
- [ ] SI-307 Salvar sumario consolidado.
- [ ] SI-308 Arquivar versao ativa anterior.
- [ ] SI-309 Copiar sumario consolidado.

Aceite:

- usuario cola sumario;
- revisa itens;
- salva versao ativa;
- consegue copiar o resultado final.

### Fase 4 - Checklist textual

- [ ] SI-401 Renderizar topicos selecionados como checklist.
- [ ] SI-402 Criar filtros por status.
- [ ] SI-403 Permitir mudar status.
- [ ] SI-404 Calcular progresso textual.
- [ ] SI-405 Registrar observacoes por item.
- [ ] SI-406 Destacar bloqueados e pendentes.
- [ ] SI-407 Integrar progresso com card do projeto.

Aceite:

- cada topico tem status proprio;
- progresso atualiza;
- nenhum item nao selecionado aparece na execucao.

### Fase 5 - Complementos de prompt

- [ ] SI-501 Criar cadastro de `prompt_blocks` em Configuracoes.
- [ ] SI-502 Criar seeds opcionais de complementos.
- [ ] SI-503 Permitir ativar/inativar complementos.
- [ ] SI-504 Filtrar por categoria, ferramenta e tipo de projeto.
- [ ] SI-505 Criar selecao de complementos no gerador.

Complementos iniciais sugeridos:

- referencia a legislacao;
- referencia a normas tecnicas;
- maior detalhamento tecnico;
- texto mais direto e objetivo;
- explorar dados fornecidos;
- considerar anexos adicionais;
- linguagem tecnica ambiental;
- apontar pendencias de informacao.

Aceite:

- complementos sao cadastraveis;
- nenhum texto fica fixo no codigo;
- complementos ativos aparecem no gerador.

### Fase 6 - Gerador de prompt por topico

- [ ] SI-601 Selecionar prompt base da biblioteca.
- [ ] SI-602 Montar prompt final com variaveis.
- [ ] SI-603 Incluir dados do projeto.
- [ ] SI-604 Incluir sumario consolidado.
- [ ] SI-605 Incluir topico selecionado.
- [ ] SI-606 Incluir complementos selecionados.
- [ ] SI-607 Incluir observacoes adicionais.
- [ ] SI-608 Copiar prompt final.
- [ ] SI-609 Salvar historico em `generated_prompts`.

Aceite:

- usuario gera prompt final;
- prompt pode ser copiado;
- historico guarda snapshots.

### Fase 7 - Integracao com Jornada e Construtor

- [ ] SI-701 Exibir atalhos na etapa de Sumario do Projeto.
- [ ] SI-702 Permitir usar contextos salvos no prompt.
- [ ] SI-703 Permitir associar item do sumario a fase da etapa.
- [ ] SI-704 Criar regra futura: etapa de sumario so conclui com sumario ativo.
- [ ] SI-705 Criar regra futura: etapa de escrita considera topicos concluidos.
- [ ] SI-706 Avaliar bloco `project_summary` no Construtor de Etapas.

Aceite:

- modulo se comporta como parte da jornada;
- nao duplica funcionalidades do construtor;
- fica pronto para regras futuras.

### Fase 8 - Historico, versoes e refinamento

- [ ] SI-801 Tela de historico de versoes.
- [ ] SI-802 Comparar versoes de sumario.
- [ ] SI-803 Restaurar versao anterior.
- [ ] SI-804 Exportar sumario em Markdown.
- [ ] SI-805 Exportar lista de pendencias.
- [ ] SI-806 Melhorar parser para romanos, capitulos e paginas.
- [ ] SI-807 Criar metricas de uso.

Aceite:

- usuario entende qual versao esta ativa;
- consegue recuperar versoes anteriores;
- exportacoes ajudam a operacao diaria.

## 15. Testes

Unidade:

- parser de numeracao simples;
- parser de subtopicos;
- linhas invalidas;
- parent/child;
- regra pai selecionado;
- progresso textual;
- montagem de prompt;
- snapshots de historico.

Integracao:

- criar sumario;
- analisar;
- editar itens;
- consolidar;
- arquivar versao anterior;
- alterar status;
- gerar prompt;
- salvar historico.

Regressao:

- Projetos continua abrindo;
- Jornada do Projeto continua funcionando;
- Prompts por etapa continuam funcionando;
- Fases e contextos continuam funcionando;
- Clientes nao sao afetados;
- Configuracoes continuam funcionando;
- Worker e D1 continuam respondendo.

## 16. Riscos e cuidados

### Risco: duplicar o Construtor de Etapas

Mitigacao:

- manter Sumario Inteligente como modulo especializado;
- prever integracao futura como bloco;
- nao criar editor generico dentro dele.

### Risco: parser interpretar errado

Mitigacao:

- sempre abrir revisao antes de consolidar;
- preservar texto original;
- mostrar avisos;
- permitir edicao manual.

### Risco: prompt ficar rigido

Mitigacao:

- prompt base vem da biblioteca;
- complementos sao cadastraveis;
- observacoes sao livres;
- snapshots preservam historico.

### Risco: criar muitas tabelas soltas

Mitigacao:

- tabelas novas devem ter relacao clara com `projects`, `prompts` e `ai_tools`;
- manter nomes consistentes;
- evitar salvar JSON quando campo relacional for melhor.

### Risco: perder contexto operacional

Mitigacao:

- integrar com `project_step_contexts`;
- permitir copiar sumario e prompt;
- salvar historico de prompts gerados.

## 17. Decisoes abertas

| Decisao | Recomendacao | Fase |
| --- | --- | --- |
| Onde exibir o modulo | dentro da Jornada, com destaque na etapa de Sumario | Fase 0 |
| Parser no frontend ou Worker | funcao compartilhada, Worker como autoridade ao salvar | Fase 0 |
| Prompt base inicial | cadastrar em `prompts`, nao hardcoded | Fase 0 |
| Complementos iniciais | criar seeds opcionais e editaveis | Fase 5 |
| Vincular item a fase | adiar para integracao com fases/contextos | Fase 7 |
| IA automatica | fora do MVP | Futuro |
| Clientes tambem terao sumario | nao no MVP; foco em projetos | Futuro |

## 18. Indicadores futuros

- quantidade de sumarios consolidados;
- topicos pendentes;
- topicos desenvolvidos;
- progresso textual medio por projeto;
- complementos mais usados;
- prompts gerados por projeto;
- versoes de sumario por projeto;
- topicos bloqueados;
- tempo entre consolidacao e conclusao textual.

## 19. Ordem recomendada de execucao

1. Aprovar este plano.
2. Finalizar ou estabilizar a migration de fases/contextos que ja esta em andamento.
3. Implementar schema do Sumario Inteligente.
4. Implementar parser com testes.
5. Implementar importacao e revisao.
6. Implementar checklist textual.
7. Implementar complementos e gerador de prompt.
8. Integrar com fases/contextos e Construtor.

Nao e recomendado comecar pela tela antes de fechar o contrato de dados, porque a hierarquia e o versionamento do sumario sao a parte mais sensivel.

## 20. Aceite final do modulo

O modulo sera considerado pronto quando:

- o usuario conseguir colar um sumario bruto;
- o sistema identificar topicos e subtopicos;
- o usuario conseguir revisar, editar e selecionar itens;
- o sistema salvar uma versao consolidada ativa;
- os itens selecionados virarem checklist de desenvolvimento;
- cada topico tiver status proprio;
- o usuario conseguir gerar prompt para um topico;
- complementos forem configuraveis;
- o prompt final puder ser copiado;
- o historico de prompts gerados for salvo;
- a jornada do projeto continuar funcionando sem regressao;
- build e testes passarem;
- o deploy Cloudflare continuar servindo frontend, Worker, D1 e R2.

## 21. Referencia de direcao

Frase guia:

> O Sumario Inteligente transforma o sumario em uma trilha executavel de escrita: limpa, consolida, acompanha e gera prompts topico por topico.

