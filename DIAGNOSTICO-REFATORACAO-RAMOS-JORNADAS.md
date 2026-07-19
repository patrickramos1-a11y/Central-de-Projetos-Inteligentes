# Diagnostico de Refatoracao - Ramos Jornadas

Status: fases 0 e 1 implementadas; aguardando validacao visual do RAC antes da fase 2
Data: 2026-07-19

## Leitura executiva

O produto ja provou a direcao certa: projetos reais, etapas, blocos, biblioteca de prompts, contextos e um sumario executavel existem e funcionam no projeto RAC.

O problema atual nao e falta de funcionalidades. E falta de uma fronteira clara entre configuracao, edicao de uma etapa e execucao da jornada. A aplicacao foi evoluida por camadas e agora mistura tres modelos:

1. tabelas legadas de jornada (`project_steps`, checklist, prompts, links, fases e contextos);
2. documento de blocos por etapa (`project_step_structures`);
3. modulo especializado de sumario (`project_summaries`, itens e prompts gerados).

Cada camada resolve uma necessidade real, mas elas ainda nao possuem uma unica fonte de verdade. O resultado visivel e excesso de controles, comportamento pouco previsivel e manutencao lenta.

## Entrega registrada em 2026-07-19

- criado snapshot do D1 com 28 tabelas em `cloudflare/backups/` antes da proxima migration; os backups locais permanecem fora do Git;
- criado `bun run cf:d1:backup` para repetir o snapshot com a autenticacao do Wrangler;
- criado `bun run test`, limitado aos testes do produto em `src`, sem executar arquivos temporarios externos;
- mantido `bun run build` como validacao obrigatoria;
- publicada a jornada com dois modos claros: **Executar** abre por padrao e **Editar estrutura** concentra criacao, ordenacao, exclusao, configuracao e template;
- reduzidos os controles de estrutura na execucao: checklist permanece marcavel, prompts permanecem copiaveis e confirmaveis, contextos permanecem copiaveis e materiais permanecem acessiveis;
- removidos do catalogo os blocos que ainda nao entregam comportamento completo: Upload, Status e Data;
- compactados contexto do projeto, trilha horizontal e barra de comandos em uma unica composicao sem elementos fixos concorrentes;
- publicado pelo fluxo `tmp/deploy-cloudflare-assets-mime.mjs`, com assets confirmados na URL publica.

### Auditoria somente leitura do RAC

O projeto RAC e seus oito passos foram preservados. Antes de qualquer limpeza de dados, a lista para aprovacao e:

- `NOTEBOOKL LM`: revisar para `NotebookLM`;
- `flugrama`: revisar para `Fluxograma`;
- duas etapas chamadas `Nova etapa`: renomear ou remover somente apos confirmacao;
- `CLAUD`: confirmar se o nome desejado e `Claude`.

Nenhum desses registros foi alterado nesta entrega.

## O que ja foi entregue e deve ser preservado

- projetos, clientes, templates, usuarios simples e biblioteca de prompts no D1;
- jornada de projeto com etapas reais e indicadores de progresso;
- construtor de blocos com inclusao, edicao, exclusao, duplicacao e ordenacao;
- blocos de checklist, prompt, contexto, materiais, comentario e sumario;
- contexto em formato de cards copiaveis;
- prompt vinculado a biblioteca, copia, confirmacao de aplicacao e contagem de copias;
- parser, versoes, arvore, selecao e consolidacao do Sumario Inteligente;
- Glass Journey System como linguagem visual base;
- build de producao aprovado em 2026-07-19.

## Onde a entrega ainda nao chegou ao objetivo

### 1. A tela de jornada ainda mistura modos de trabalho

Na mesma tela aparecem navegacao de projetos, trilha de etapas, criacao de etapa, criacao de bloco, conclusao, template, controles de bloco e conteudo de execucao. Isso torna cada etapa grande demais e faz a pessoa decidir o tempo inteiro se esta configurando ou trabalhando.

Direcao: separar explicitamente os modos **Executar** e **Editar estrutura**. A execucao deve mostrar somente o necessario para concluir o trabalho. A edicao deve liberar blocos, propriedades, ordenacao e regras em um ambiente proprio.

### 2. O bloco e o legado concorrem como fonte de verdade

O Worker cria uma estrutura de blocos sob demanda a partir das tabelas legadas. Depois disso, uma parte dos dados passa a existir no documento de blocos e outra continua nas tabelas antigas. Salvar um projeto como template ainda copia apenas o modelo legado, nao a estrutura de blocos.

Direcao: tornar `StepDocument` a fonte de verdade da estrutura de uma etapa. As tabelas legadas devem ser somente uma ponte de migracao e compatibilidade ate serem desativadas por modulo. Templates precisam salvar e instanciar blocos, sem valores da execucao.

### 3. O Sumario Inteligente esta funcional, mas opera como editor permanente

A arvore apresenta, em cada linha, selecao de consolidacao, status, controles de prompt, recolher, excluir e edicao. Para 57 ou 65 topicos, isso cria uma lista visualmente espessa e dificil de ler. A pessoa quer acompanhar o desenvolvimento; nao editar a estrutura inteira a todo momento.

Direcao:

- **Execucao do sumario**: arvore fina, com numero, titulo, status e indicador de prompt. Selecionar uma ou varias linhas abre uma barra contextual curta; nao repetir acoes em todas as linhas.
- **Editar estrutura**: modal/tela dedicada apenas para colar, selecionar o que entra, renumerar, reorganizar e consolidar.
- **Compor prompt**: painel lateral ou drawer aberto somente quando ha selecao. A composicao vira uma acao contextual e nao um segundo painel permanente.
- manter `Versao em uso` e `Versao em edicao`, com explicacao curta em portugues.

### 4. Navegacao e barras fixas desperdicam espaco vertical

O cabecalho global, a apresentacao do projeto, a trilha de etapas e a barra de comandos ocupam grande parte da primeira tela. Em alguns pontos, a rolagem leva o conteudo para baixo de elementos fixos, dando a sensacao de sobreposicao e desalinhamento.

Direcao: usar uma unica barra superior compacta. O contexto do projeto vira uma linha de breadcrumb com progresso. A trilha de etapas continua horizontal, mas compacta e rolavel. A barra de comandos deve existir uma vez, abaixo da trilha, e mudar conforme o modo atual.

### 5. Catalogo de blocos e comportamento real ainda divergem

O catalogo oferece `status` e `data`, mas eles ainda caem no campo generico. O upload exibe uma mensagem de funcionalidade futura. Fases ainda nao se comportam como agrupadores estruturais completos. Campos curtos e longos sao orientacoes informativas, mas essa regra nao esta clara no editor.

Direcao: reduzir o catalogo inicial ao que esta completo e util: texto informativo, texto de resposta, checklist, prompt, contexto, materiais, upload, comentario, fase e sumario. Cada tipo precisa ter propriedades e comportamento proprio antes de ser exibido no menu.

### 6. A arquitetura de frontend concentrou responsabilidades demais

`src/main.tsx` concentra mais de 5 mil linhas: telas, estado, chamadas de API, regras de negocio, formularios e componentes especializados. `src/styles.css` tambem acumulou mais de 5 mil linhas, com varias redefinicoes de layout e sumario. Isso faz um ajuste visual alterar pontos inesperados.

Direcao: modularizar por dominio, sem trocar React, Vite ou Cloudflare:

- `features/projects` para listagem e criacao;
- `features/journey` para execucao e edicao;
- `features/summary` para arvore e composicao;
- `features/prompt-library` para cadastros;
- `components/ui` para botoes, paineis, campos e feedback;
- `api` para clientes de dominio, sem o nome legado `supabase`.

### 7. A API e generica demais para um fluxo operacional

O frontend carrega 24 tabelas no inicio e envia alteracoes diretamente pela API generica `/api/tables/*`. Isso explica carregamentos instaveis, estados vazios momentaneos e regras importantes ainda ficando no navegador. Tambem deixa dificil validar uma acao de negocio completa.

Direcao: manter a API generica apenas para configuracoes simples. Criar endpoints de dominio para jornada, template, prompt e sumario, por exemplo:

- `GET /api/projects/:id/journey`;
- `POST /api/projects/:id/steps`;
- `POST /api/templates/from-project/:id`;
- `POST /api/summary/:id/consolidate`;
- `POST /api/summary/:id/prompts`;
- `GET /api/prompt-library`.

O Worker deve calcular conclusao, criar template e publicar estrutura de forma atomica.

### 8. Qualidade de dados ainda esta em modo de prototipo

O RAC tem etapas como `Nova etapa`, `flugrama` e `NOTEBOOKL LM`. Isso e normal durante a descoberta, mas reduz a confianca da tela que deveria orientar a equipe.

Direcao: criar uma rodada separada de limpeza de dados e padronizacao de nomes, sem misturar com refatoracao de interface.

### 9. O teste automatizado nao e confiavel como sinal de qualidade

O build de producao passa. Porem, `bun test` varre arquivos temporarios em `tmp/chrome-profile2` e termina com 43 falhas de extensoes do Chrome, alheias ao projeto. Os quatro testes do parser de sumario passam, mas o comando geral nao representa a saude do repositorio.

Direcao: configurar testes explicitamente para `src/**/*.test.ts`, adicionar cobertura para StepDocument, conclusao, template por blocos e consolidacao do sumario. A primeira regra e ter um comando de teste que so execute testes do produto.

## Arquitetura alvo

```text
Configuracoes              Template                    Projeto real
prompts, ferramentas       estrutura de etapas         valores da execucao
        |                         |                            |
        +-------------------------+----------------------------+
                                  |
                        StepDocument canonico
                                  |
          +-----------------------+------------------------+
          |                                                |
   Modo Editar estrutura                               Modo Executar
   blocos, regras, ordem,                              respostas, checklist,
   publicacao e versao                                 prompts e progresso
                                  |
                         Worker de dominio
                 validacao, status, historico e D1
```

## Plano de recuperacao recomendado

### Etapa 0 - Congelar o escopo e criar uma linha de base

- nao adicionar novos tipos de bloco ou telas de Clientes;
- salvar backup do D1 e registrar o estado do RAC;
- criar testes isolados e inventario dos blocos realmente usados;
- corrigir nomes de dados de demonstracao e remover etapas vazias do RAC quando autorizado.

Aceite: build passa, testes do produto passam, RAC abre sem dados de demonstracao confusos.

### Etapa 1 - Refatorar o esqueleto da jornada

- criar shell unico de jornada: breadcrumb, trilha horizontal e uma barra de comandos;
- eliminar espacos verticais excessivos, sobreposicoes e barras duplicadas;
- introduzir alternancia clara entre `Executar` e `Editar estrutura`;
- manter o visual Glass Journey, mas reduzir sombras, alturas e elementos repetidos.

Aceite: a primeira tela do RAC mostra projeto, etapas e proxima acao sem rolagem desnecessaria.

### Etapa 2 - Consolidar o modelo de blocos

- definir o contrato compartilhado como unico contrato de blocos;
- migrar estruturas existentes de forma controlada, nao durante um GET comum;
- fazer template salvar estrutura de blocos e criar projeto com valores vazios;
- completar ou ocultar blocos ainda incompletos;
- tornar fase um agrupador real, com dependencias e progresso proprio.

Aceite: uma etapa nova nasce vazia; um template replica blocos e regras; uma execucao nao altera o template.

### Etapa 3 - Finalizar o Sumario Inteligente como modulo de execucao

- tela principal: arvore fina com status, progresso e prompt associado;
- edicao estrutural em modal dedicado;
- selecao multipla e barra contextual para gerar prompt;
- composicao de prompt em drawer, visivel somente quando usada;
- historico de prompt e status por topico sem controles repetidos em cada linha.

Aceite: um usuario consegue acompanhar 65 topicos, selecionar um ramo e copiar um prompt sem aprender icones ambiguos.

### Etapa 4 - Separar dominios de frontend e API

- extrair componentes e estado de `main.tsx` por funcionalidade;
- consolidar tokens e componentes em vez de continuar acrescentando CSS ao final;
- substituir o cliente chamado `supabase` por cliente Cloudflare/API;
- trocar o carregamento global de 24 tabelas por dados da tela atual;
- criar comandos de dominio no Worker para jornada, sumario e templates.

Aceite: alterar a biblioteca de prompts nao carrega sumarios nem todos os projetos; regras de conclusao ficam no Worker.

### Etapa 5 - Dados, confiabilidade e clientes

- executar limpeza dos projetos de exemplo;
- revisar erro, carregamento e confirmacoes de copia/salvamento;
- aplicar o mesmo motor de blocos a Clientes somente depois de Projetos estar estavel;
- adicionar permissao real quando a plataforma entrar no ecossistema integrado.

Aceite: a equipe consegue usar o RAC completo sem explicacao paralela e sem depender de dados de teste.

## Ordem de decisao

1. Aprovar este diagnostico e a sequencia acima.
2. Executar apenas Etapa 0 e Etapa 1 em uma entrega pequena e verificavel.
3. Validar visualmente o RAC com voce.
4. Somente entao mexer no modelo de blocos e no Sumario.

Essa ordem evita a repeticao do problema atual: aumentar a quantidade de funcionalidade antes de estabilizar a experiencia e a fonte de verdade dos dados.
