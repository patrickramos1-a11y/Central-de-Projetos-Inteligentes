# Plano Mestre de Refatoracao - Ramos Jornadas

Status: em execucao

Objetivo: conduzir a refatoracao completa da Ramos Jornadas sem perder dados reais, sem criar novas telas costuradas e sem encerrar rodadas antes de existir validacao objetiva. Este arquivo e a referencia operacional para as proximas execucoes.

## 1. Resultado esperado

Ao final, a plataforma deve permitir executar projetos e jornadas de clientes com clareza, em uma interface compacta e consistente:

- a pessoa ve o que esta pendente, o que fazer agora e o que foi concluido sem procurar pela tela;
- a execucao da jornada e diferente da edicao da sua estrutura;
- blocos comecam recolhidos e exibem tipo, estado, progresso e proxima pendencia;
- o Sumario Inteligente usa uma unica versao vinculada a etapa, com numeracao confiavel;
- templates copiam estruturas, condicoes e recursos-modelo, nunca valores reais de execucao;
- o mesmo motor de blocos atende Projetos e Clientes;
- nao existe rolagem interna estrutural desnecessaria, nem barras fixas cobrindo conteudo.

## 2. Decisoes travadas

### 2.1 Regra visual

`Glass no entorno; conteudo operacional em superficies solidas e densas.`

- glass: fundo, navegacao global, contexto do projeto e modais;
- superficie solida: area de trabalho, arvore, listas, formularios e blocos;
- verde: acao principal e progresso;
- azul: documentos, evidencias e links;
- violeta: IA, prompts e sumarios;
- ambar: pendencia e atencao;
- vermelho: bloqueio e acao destrutiva.

### 2.2 Tokens oficiais

| Token | Valor | Uso |
| --- | --- | --- |
| `--color-ink` | `#18352F` | texto forte e fundo profundo pontual |
| `--color-page` | `#DCE6E1` | fundo cinza-salvia |
| `--color-surface` | `#FBFDFC` | superficie operacional solida |
| `--color-green` | `#0B9B68` | acao principal |
| `--color-progress` | `#25D58A` | progresso e conclusao |
| `--color-document` | `#2878D4` | documentos e evidencias |
| `--color-ai` | `#7057D9` | IA, prompt e sumario |
| `--color-warning` | `#D99518` | atencao |
| `--color-danger` | `#C9555D` | bloqueio e exclusao |
| `--color-muted` | `#6B7B75` | dados tecnicos e texto secundario |

### 2.3 Tipografia e dimensoes

- `Inter`: interface, titulos, listas e formularios.
- `JetBrains Mono`: variaveis, trechos de prompt, IDs e dados tecnicos.
- escala: 12px meta, 14px controles/listas, 16px secoes, 24px titulos de pagina.
- espacamento: 4, 8, 12, 16, 24 e 32px.
- raios: 6px em linhas e campos, 8px em botoes, 10px em paineis; nao usar cards excessivamente arredondados.
- bloco recolhido: 48 a 64px de altura; so cresce quando aberto.

## 3. Regras de execucao do plano

1. Nao adicionar funcionalidades fora da fase atual sem registrar a necessidade neste arquivo.
2. Nao alterar ou apagar dados reais sem snapshot do D1 e validacao explicita.
3. Cada mudanca de interface deve reutilizar tokens e componentes; nao adicionar CSS pontual como solucao final.
4. Cada fase termina somente depois de testes, build, revisao desktop e mobile e validacao no RAC.
5. Publicacao usa exclusivamente:

```powershell
bun run test
bun run build
bun run cf:d1:backup
bun tmp/deploy-cloudflare-assets-mime.mjs
```

6. O estado da fase deve ser atualizado neste documento antes e depois da publicacao.

## 4. Mapa de fonte de verdade

| Domínio | Fonte canonica | Nao pode fazer |
| --- | --- | --- |
| Estrutura da etapa | `journey_step_documents` e `StepDocument` | reconstruir estrutura em leituras normais |
| Valores da execucao | `journey_step_values` e `journey_step_files` | entrar em templates por acidente |
| Sumario da etapa | `summaryId` explicito no bloco `project_summary` | buscar silenciosamente outra versao ativa |
| Template | documento de estrutura, regras e recursos-modelo | copiar checklist marcado, contexto real ou prompt aplicado |
| Contexto criado na execucao | valor do projeto atual | ser promovido a template sem acao deliberada |

### Correcao obrigatoria antes da fase visual

O Worker e o frontend devem sempre priorizar `block.config.summaryId`. O fallback para a versao ativa do projeto deve ser removido ou usado somente quando nao houver bloco vinculado e houver uma decisao explicita de vinculacao. Isso evita que o Sumario da execucao seja diferente do editor.

## 5. Fase 0 - Preparacao e contratos

Status: concluida em 2026-07-30

### Escopo

- registrar snapshot remoto do D1 e inventario de tabelas/dados usados pelo RAC e por uma jornada de Cliente;
- criar um mapa de compatibilidade entre tabelas legadas, documentos canonicos e endpoints atuais;
- definir contratos de leitura por tela: projeto, jornada, template, cliente e sumario;
- eliminar do fluxo normal qualquer criacao implicita de documento canonico durante leitura;
- corrigir a vinculacao unica entre bloco de sumario e `summaryId`;
- registrar dados demonstrativos ou inconsistentes para revisao, sem renomear automaticamente.

### Entregaveis

- `docs/refactor/data-contract-map.md`;
- teste de integridade para a vinculacao do sumario;
- endpoint de jornada que retorne estrutura, valores, arquivos e progresso sem exigir leitura de todas as tabelas administrativas.

### Gate de aceite

- RAC e Cliente de referencia possuem snapshot recuperavel;
- cada etapa le um unico `StepDocument` canonico;
- editor e execucao mostram a mesma versao do sumario vinculado;
- testes de migracao, template e sumario passam.

### Registro de conclusao

- snapshot remoto criado em `cloudflare/backups/` (fora do versionamento);
- mapa de contratos criado em `docs/refactor/data-contract-map.md`;
- `summaryId` explicito passou a ser a fonte de verdade no frontend e na validacao de conclusao do Worker;
- testes unitarios e build validados antes da proxima fase.

## 6. Fase 1 - Fundacao visual e componentes base

Status: concluida em 2026-07-30

### Escopo

- criar `tokens.css`, `layout.css`, `components.css` e estilos por dominio;
- migrar a fonte para Inter e JetBrains Mono;
- criar componentes reutilizaveis: `AppShell`, `PageHeader`, `JourneyContextBar`, `StepRail`, `ModeSwitch`, `CommandBar`, `WorkCanvas`, `CollapsibleBlockRow`, `StatusBadge`, `ProgressBar`, `Toast`, `Modal` e `EntityList`;
- reduzir transparencias empilhadas e transformar conteudo operacional em superficie solida;
- normalizar estados de hover, foco, carregamento, vazio, erro e sucesso;
- remover CSS duplicado apenas depois de cada equivalente novo estar visualmente validado.

### Gate de aceite

- nenhum componente novo usa cores ou espacamentos fora dos tokens;
- uma tela piloto de jornada usa exclusivamente os componentes base;
- contraste, foco de teclado e textos em botoes estao legiveis;
- nao ha regressao da navegacao, copia, checklist ou uploads.

### Registro de conclusao

- tokens aprovados, tipografia Inter e JetBrains Mono e superficies por funcao adicionados em `src/styles/`;
- componentes base de shell, contexto, trilha, barra de comandos, progresso, estado e toast criados;
- jornada de Projeto migrou para os primitivos de layout sem alterar os contratos de dados;
- notificacoes de acao agora se encerram automaticamente; a faixa de conexao nao reutiliza mais mensagens temporarias.

## 7. Fase 2 - Arquitetura de telas

Status: concluida em 2026-07-30

### 7.1 Projetos

- cabecalho compacto com busca, filtros e criar projeto;
- grade ou lista densa, com progresso coerente ao status;
- edicao de nome, cliente e responsavel em painel ou modal curto;
- projeto nao pode mostrar 100% concluido e estado operacional conflitante sem explicacao.

### 7.2 Executar jornada

- uma barra superior global compacta;
- contexto de projeto em uma faixa unica;
- trilha horizontal de etapas, rolavel somente lateralmente e com acao de editar etapas separada;
- uma superficie continua de trabalho;
- blocos recolhidos por padrao ao abrir etapa, trocar etapa ou trocar projeto;
- bloco recolhido mostra tipo, titulo, status, itens concluidos e proxima pendencia;
- modo Executar nao mostra mover, excluir, duplicar ou editar estrutura.

### 7.3 Editar estrutura

- modo proprio e claramente destacado;
- menu de blocos, propriedades, obrigatoriedade, condicoes, ordem, recursos-modelo e regras de conclusao;
- reordenacao e exclusao em uma experiencia focada, sem contaminar a execucao;
- edicao de etapas por painel compacto, com subir, descer, renomear, excluir e marcar como nao aplicavel.

### 7.4 Administracao

- prompts, templates, clientes e configuracoes usam lista densa + painel retratil superior;
- formularios nao ficam espremidos em barra lateral;
- listas exibem somente metadados necessarios, a edicao abre sob demanda.

### Gate de aceite

- as quatro telas respondem no primeiro viewport: pendente, proxima acao e concluido;
- apenas uma rolagem vertical domina cada tela;
- nenhuma barra fixa oculta conteudo;
- desktop e mobile funcionam sem sobreposicao.

### Registro de conclusao

- Projetos passaram a calcular progresso somente com etapas aplicaveis e apresentam estado coerente com a conclusao calculada;
- a jornada usa faixa de contexto, trilha horizontal, superficie operacional e barra de comandos compactas;
- administracao recebeu o mesmo padrao de lista densa com formulario superior;
- os estilos da jornada e da administracao foram isolados em `src/styles/journey.css` e `src/styles/admin.css`.

## 8. Fase 3 - Motor de blocos e conclusao

Status: concluida em 2026-07-30

### Escopo

- separar estruturalmente `StepDocument` de valores de execucao;
- manter textos curto/longo como orientacao somente leitura na execucao;
- criar e validar `short_answer` e `long_answer` como blocos de resposta;
- checklist com atualizacao otimista, alvo clicavel de no minimo 36px, progresso e reversao diante de erro;
- prompt com copia, contador, confirmacao de aplicacao e condicoes opcionais;
- materiais e links com links-modelo no template e links de execucao no projeto;
- arquivo/evidencia com multiplos arquivos, tipos permitidos configuraveis e validacao de tamanho;
- pacote de recursos-modelo que baixa todos os arquivos do bloco;
- etapas nao aplicaveis ficam compactas na trilha, mas podem ser reativadas;
- conclusao de etapa calculada pelo Worker, com motivos claros de bloqueio.

### Gate de aceite

- cada bloco possui estado compacto confiavel;
- uma condicao nao cadastrada nao bloqueia confirmacao de prompt;
- condicoes cadastradas bloqueiam ate serem atendidas;
- template nao recebe valores reais; recursos-modelo sao copiados somente quando configurados;
- nao ha tela em branco ao expandir bloco, adicionar evidencia ou editar prompt.

### Registro de execucao

- a leitura de jornada por dominio agora devolve documentos, valores, arquivos e conclusoes em uma unica resposta, sem depender do carregamento administrativo de tabelas;
- a migracao idempotente vincula apenas blocos de sumario legados sem `summaryId` a versao ativa do proprio projeto, garantindo uma unica fonte de verdade entre editor, execucao e conclusao;
- anexos de evidencia continuam exclusivos do projeto real; somente pacotes de recursos e anexos de prompt configurados podem ser levados ao template;
- o estado recolhido informa arquivo anexado e quantidade de anexos obrigatorios do prompt.

## 9. Fase 4 - Sumario Inteligente

Status: concluida em 2026-07-30

### Execucao

- arvore de acompanhamento na superficie de trabalho, aberta inicialmente apenas nos capitulos;
- linhas finas e compactas, sem selects permanentes ou baloes por topico;
- status no painel contextual ou menu compacto acionado pelo topico;
- selecao multipla para composicao de prompt aparece somente ao entrar nesse modo;
- botao para concluir itens selecionados;
- status do capitulo pode propagar aos subtópicos mediante confirmacao;
- prompts gerados aparecem por versao, com copia e arquivamento individual;
- gerar prompt atualiza o indicador visual e o estado minimo definido para o topico.

### Editor de estrutura

- modal/tela integral, larga e compacta;
- importar, analisar, selecionar, criar, mover, transformar nivel, excluir e consolidar;
- renumeracao unica e atomica ao mover ou excluir;
- nenhum painel de composicao de prompt no editor;
- configuracao de prompt base, prompt gatilho e adicionais pertence a versao do sumario;
- adicionais aparecem como cards compactos e editaveis, nao como grandes areas de texto abertas.

### Gate de aceite

- execucao e editor exibem a mesma versao e mesma arvore;
- excluir ou mover item renumera corretamente hierarquia afetada;
- consolidacao gera nova versao imutavel e torna-a `Versao em uso` somente apos sucesso;
- rascunho aparece como `Versao em edicao`;
- nenhuma rolagem interna estreita na arvore de execucao.

### Registro de execucao

- o bloco usa exclusivamente `config.summaryId` para resolver a versao exibida; a vinculacao de legado e feita pela migracao idempotente da Fase 3;
- consolidacao continua atomica no Worker, produzindo uma nova versao imutavel e preservando a anterior;
- a composicao de prompt agora tambem usa o endpoint de dominio do Sumario, com teste de contrato para URL e payload;
- a arvore operacional existente abre inicialmente apenas nos capitulos, tem selecao por ramo, conclusao em lote, status compacto e arquivamento individual de prompts;
- o editor dedicado permanece separado da composicao, conservando importacao, selecao, reorganizacao e consolidacao.

## 10. Fase 5 - Templates, Clientes e confiabilidade

Status: pendente

### Templates

- salvar template abre escolha: atualizar o template de origem ou criar novo;
- nome nao pode ser `undefined`;
- editar nome, visualizar resumo e excluir template com confirmacao;
- o card mostra metadados compactos; detalhes de etapas abrem em painel ou modal.

### Clientes

- aplicar o mesmo motor de blocos, etapas, arquivos, links e conclusao;
- validar ao menos uma jornada real de Cliente antes do corte final.

### R2 e historico

- anexar, listar, baixar e remover arquivos com tipos/tamanho configurados;
- registrar evento de bloco criado, editado, concluido, removido, arquivo alterado, contexto promovido, checklist atualizado e sumario consolidado;
- revisar nomes demonstrativos apenas em limpeza explicita e aprovada.

### Gate de aceite

- RAC e Cliente passam pelos fluxos completos;
- R2 responde para arquivo unico, multiplos arquivos e pacote de recursos;
- templates recriam estruturas sem valores de execucao;
- historico basico e acessivel para diagnostico.

## 11. Arquitetura alvo de codigo

```text
src/
  app/                 # shell, roteamento e estado de sessao simples
  api/                 # clientes tipados dos endpoints de dominio
  components/ui/       # primitivos reutilizaveis
  features/projects/   # lista, criacao e edicao de projetos
  features/journey/    # shell, etapas, execucao e estrutura
  features/blocks/     # renderizadores e editores por tipo de bloco
  features/summary/    # execucao, editor, arvore e composicao
  features/templates/  # biblioteca e atualizacao de templates
  features/clients/    # jornadas de cliente
  styles/              # tokens, layout, componentes e estilos por dominio
worker/
  journeyDomain.ts     # contratos e regras de jornada
  summaryDomain.ts     # consolidacao e versoes de sumario
  templateDomain.ts    # copia e atualizacao de templates
  filesDomain.ts       # R2, validacao e pacotes de recursos
shared/
  stepBuilder.ts       # tipos e validacao canonica
```

`src/main.tsx` deve se tornar somente o ponto de montagem da aplicacao. Nenhuma nova regra de dominio deve ser adicionada nele durante a refatoracao.

## 12. Matriz de validacao obrigatoria

| Cenário | Desktop | Mobile | Dados |
| --- | --- | --- | --- |
| RAC - execucao | 1440x900 e 1280x800 | 390x844 | blocos, checklist, prompt, contexto, sumario |
| RAC - estrutura | 1440x900 | 390x844 | adicionar, editar, mover, excluir, regras |
| Sumario | 1440x900 | 390x844 | versao, renumeracao, prompt, consolidacao |
| Templates | 1440x900 | 390x844 | atualizar, criar novo, excluir, copiar estrutura |
| Cliente real | 1440x900 | 390x844 | etapas, arquivos, links e conclusao |

Para cada cenário, registrar screenshot, comportamento esperado, resultado e eventual regressao antes de publicar.

## 13. Definicao de pronto para entrega final

A refatoracao so pode ser marcada como concluida quando todos os itens abaixo forem verdadeiros:

- [ ] todas as fases e gates deste plano foram aprovados;
- [ ] `bun run test` e `bun run build` passam;
- [ ] snapshot D1 foi gerado antes da ultima migration;
- [ ] RAC foi validado em desktop e mobile;
- [ ] uma jornada de Cliente foi validada em desktop e mobile;
- [ ] execucao, estrutura e sumario usam fontes de verdade coerentes;
- [ ] nao ha tela em branco, barra sobreposta ou rolagem interna estrutural desnecessaria;
- [ ] dados reais nao foram apagados;
- [ ] publicacao foi feita pelo fluxo de assets Cloudflare;
- [ ] URL publica foi verificada sem cache.

## 14. Ordem de inicio

Quando este plano for iniciado, executar somente a Fase 0 primeiro. A primeira tarefa pratica sera produzir o mapa de contratos e corrigir a ambiguidade do `summaryId`; so depois disso comecar a substituicao visual e a divisao de componentes.
