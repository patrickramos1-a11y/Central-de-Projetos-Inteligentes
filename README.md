# Central de Projetos IA

Aplicacao interna para configurar e conduzir jornadas operacionais de projetos tecnicos com apoio de IA.

O sistema e separado em tres areas principais:

- **Projetos**: execucao real de projetos, etapas, checklist, prompts, observacoes e materiais.
- **Clientes**: jornada de entrada/implantacao com checklist, evidencias, logo e progresso.
- **Configuracoes**: ferramentas de IA, biblioteca de prompts, tipos de projeto, templates e procedimentos.

A ideia central e permitir que a equipe construa uma jornada dentro do proprio projeto ou cliente e, quando ela ficar boa, salve essa estrutura como template para reutilizar.

## Stack

- Vite
- React
- TypeScript
- Cloudflare Pages
- Cloudflare Workers
- Cloudflare D1
- Cloudflare R2
- Cloudflare Access

## Variaveis de ambiente

Crie `.env.local` localmente ou configure no Cloudflare Pages:

```env
VITE_API_BASE_URL=
```

Use `VITE_API_BASE_URL` vazio quando o frontend e a API estiverem no mesmo dominio. Use a URL do Worker quando a API estiver em dominio separado, por exemplo `https://central-projetos-ia-api.<subdominio>.workers.dev`.

## Cloudflare

Arquivos principais:

- `wrangler.jsonc`: configuracao do Worker, D1 e R2.
- `worker/index.ts`: API usada pelo frontend.
- `cloudflare/migrations/0001_initial.sql`: schema inicial do D1 e seeds.

Recursos sugeridos:

- D1: `central-projetos-ia`
- R2: `central-projetos-ia-files`
- Worker/API: `central-projetos-ia-api`
- Pages: `central-de-projetos-inteligentes`

## Scripts

```bash
npm install
npm run dev
npm run build
npm run cf:d1:migrate:local
npm run cf:dev
```

Deploy:

```bash
npm run cf:d1:migrate:remote
npm run cf:deploy:api
npm run cf:pages:deploy
```

Antes do deploy remoto, substitua `replace-with-d1-database-id` no `wrangler.jsonc` pelo ID real do banco D1 criado na Cloudflare.
O D1 remoto atual criado para este projeto e `central-projetos-ia`, ID `8b150f2d-db0d-433e-8f88-98b5f83b3ef8`.

Observacao Cloudflare: a conta precisa ter o subdominio `workers.dev` criado no dashboard em **Workers & Pages** para expor o Worker em URL publica. A API tambem indicou que o R2 ainda precisa ser habilitado no dashboard antes de anexos reais ficarem ativos.

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

## Tabelas principais

Configuracoes:

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

O banco D1 nao e exposto diretamente ao navegador. O frontend chama o Worker, e o Worker executa as operacoes no D1/R2.

Para uso interno, proteja o Cloudflare Pages e o Worker com Cloudflare Access antes de cadastrar dados sensiveis. O Supabase deve permanecer apenas como backup durante a transicao.
