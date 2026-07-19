# Ramos Jornadas

Aplicacao interna para configurar e conduzir jornadas operacionais de projetos, clientes e processos tecnicos com apoio de IA.

O sistema e separado em tres areas principais:

- **Projetos**: execucao real de projetos, etapas, checklist, prompts, observacoes e materiais.
- **Clientes**: jornada de entrada/implantacao com checklist, evidencias, logo e progresso.
- **Configuracoes**: usuarios simples, ferramentas de IA, biblioteca de prompts, tipos de projeto, templates e procedimentos.

A ideia central e permitir que a equipe construa uma jornada dentro do proprio projeto ou cliente e, quando ela ficar boa, salve essa estrutura como template para reutilizar.

## Stack

- Vite
- React
- TypeScript
- Cloudflare Workers com Static Assets
- Cloudflare D1
- Cloudflare R2
- Entrada simples por usuario interno, sem login externo nesta fase

## Variaveis de ambiente

Crie `.env.local` localmente:

```env
VITE_API_BASE_URL=
```

Use `VITE_API_BASE_URL` vazio quando o frontend e a API estiverem no mesmo dominio. A publicacao atual usa o proprio Worker para servir frontend e API, entao o build final usa esta variavel vazia.

## Cloudflare

Arquivos principais:

- `wrangler.jsonc`: configuracao do Worker, Static Assets, D1 e R2.
- `worker/index.ts`: API usada pelo frontend.
- `cloudflare/migrations/0001_initial.sql`: schema inicial do D1 e seeds.

Recursos sugeridos:

- D1: `central-projetos-ia`
- R2: `central-projetos-ia-files`
- Worker/App/API: `central-projetos-ia-api`
- URL publica atual: `https://central-projetos-ia-api.patrickramos1-a11y.workers.dev`
- Pages: `central-de-projetos-inteligentes` criado, mas sem uso principal nesta fase.

## Scripts

```bash
npm install
npm run dev
npm run build
npm run test
npm run cf:d1:migrate:local
npm run cf:dev
```

Deploy:

```bash
npm run build
npm run cf:d1:migrate:remote
npm run cf:deploy
```

Antes de qualquer migration ou refatoracao que altere dados, crie um snapshot local ignorado pelo Git:

```bash
npm run cf:d1:backup
```

Para o Worker atual, use o fluxo de deploy de assets com MIME correto:

```bash
bun run cf:deploy:assets
```

Esse comando recompila o frontend e o Worker antes do envio. O comando `wrangler deploy` continua util para desenvolvimento, mas nao deve substituir esse fluxo de publicacao, pois ele nao aplica o ajuste de MIME dos assets.

Antes do deploy remoto, substitua `replace-with-d1-database-id` no `wrangler.jsonc` pelo ID real do banco D1 criado na Cloudflare.
O D1 remoto atual criado para este projeto e `central-projetos-ia`, ID `8b150f2d-db0d-433e-8f88-98b5f83b3ef8`.

Observacao Cloudflare: o subdominio `workers.dev` da conta e `patrickramos1-a11y`, e o app esta publicado em `central-projetos-ia-api.patrickramos1-a11y.workers.dev`. O bucket R2 `central-projetos-ia-files` ja foi criado e esta vinculado ao Worker pelo binding `FILES`.

Anexos de blocos usam a API `/api/journey-files/{project|client}/{stepId}/{blockId}`. O arquivo e salvo no R2 e seu registro fica vinculado ao bloco no D1.

Para exportar os dados atuais do Supabase e gerar SQL de importacao para D1:

```bash
SUPABASE_URL=https://seu-projeto.supabase.co SUPABASE_SERVICE_ROLE_KEY=sua-chave bun run cf:export:supabase
wrangler d1 execute central-projetos-ia --remote --file cloudflare/import/supabase-data.sql
```

## Fluxo principal

Projetos:

1. Abra **Projetos**.
2. Clique em **Novo projeto**.
3. Escolha tipo de projeto, empresa, responsavel e um template opcional.
4. Execute a **Jornada do Projeto**:
   - edite etapas diretamente na tela;
   - marque checklist;
   - copie prompts;
   - adicione prompts locais ou da biblioteca;
   - vincule materiais e links;
   - conclua ou bloqueie etapas;
   - salve a jornada real como template.

Clientes:

1. Abra **Clientes**.
2. Clique em **Novo cliente**.
3. Informe nome, empresa, logo, responsavel, mes de entrada e template.
4. Execute a **Jornada do Cliente**:
   - acompanhe o progresso pela logo/card do cliente;
   - marque checklist por etapa;
   - registre links de evidencias, PDFs, Drive ou pastas;
   - use pre-requisitos para concluir etapas;
   - salve a jornada real como template de cliente.

## Modulos do MVP

- Projetos reais
- Jornada do projeto
- Clientes
- Jornada do cliente
- Checklist por etapa
- Prompts por etapa
- Links e materiais por etapa
- Ferramentas de IA
- Categorias de prompts
- Prompts reutilizaveis
- Tipos de projeto
- Templates de jornada
- Etapas de template
- Vinculos entre etapas e prompts
- Procedimentos internos

## Dados canonicos de jornada

As tabelas legadas permanecem para compatibilidade. Toda nova estrutura e toda nova execucao de blocos usam o modelo canonico abaixo:

- `journey_step_documents`: estrutura versionada de uma etapa de projeto, cliente ou template.
- `journey_step_values`: valores de execucao, como checklist, contexto e prompt aplicado.
- `journey_step_files`: evidencias armazenadas no R2.
- `journey_step_events`: historico operacional basico.

Antes de aplicar uma migration remota, execute:

```bash
bun run cf:d1:backup
bun run cf:d1:migrate:remote
```

Depois de publicar uma migration nova, a conversao de registros legados e explicita e idempotente:

```bash
curl -X POST https://central-projetos-ia-api.patrickramos1-a11y.workers.dev/api/admin/migrate-canonical
```

## Tabelas legadas

Configuracoes:

- `app_users`
- `ai_tools`
- `prompt_categories`
- `prompts`
- `project_types`
- `journey_templates`
- `journey_steps`
- `step_prompts`
- `procedures`

Execucao:

- `projects`
- `project_steps`
- `project_step_checklist_items`
- `project_step_prompts`
- `project_step_links`
- `clients`
- `client_steps`
- `client_step_checklist_items`
- `client_step_links`

## Seguranca

O banco D1 nao e exposto diretamente ao navegador. O frontend chama o Worker no mesmo dominio, e o Worker executa as operacoes no D1/R2.

Nesta fase, o Worker publicado fica aberto e o painel usa apenas uma entrada simples por usuario interno. O usuario inicial e `Patrick`, e novos usuarios podem ser cadastrados na tela inicial ou em **Configuracoes > Usuarios**. Isso nao e autenticacao forte; serve apenas para organizar o uso durante o MVP.

O Supabase deve permanecer apenas como backup durante a transicao.
