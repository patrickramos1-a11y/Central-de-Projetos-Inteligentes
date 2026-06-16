# Central de Projetos IA

Aplicacao interna para configurar e conduzir jornadas operacionais de projetos tecnicos com apoio de IA.

O sistema e separado em duas camadas:

- **Execucao**: projetos reais, etapas, checklist, prompts, observacoes e materiais.
- **Clientes**: jornada de entrada/implantacao com checklist, evidencias, logo e progresso.
- **Configuracoes**: ferramentas de IA, biblioteca de prompts, tipos de projeto, templates e procedimentos.

A ideia central e permitir que a equipe construa uma jornada dentro do proprio projeto ou cliente e, quando ela ficar boa, salve essa estrutura como template para reutilizar.

## Stack

- Vite
- React
- TypeScript
- Supabase
- Vercel

## Variaveis de ambiente

Crie `.env.local` localmente ou configure na Vercel:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## Banco Supabase

1. Crie um projeto novo no Supabase, sugerido: `central-projetos-ia`.
2. Abra o SQL Editor.
3. Execute o arquivo [`supabase/schema.sql`](supabase/schema.sql).
4. Copie a Project URL e a anon public key para as variaveis do app.

## Aviso de seguranca do MVP

Nesta primeira publicacao, o app foi planejado como link publico sem login. O schema habilita RLS, mas cria policies temporarias que permitem `select`, `insert`, `update` e `delete` para `anon`.

Isso serve apenas para validar o fluxo do MVP. Nao cadastre dados sensiveis enquanto o acesso estiver publico. O Supabase Advisor vai apontar essas policies como permissivas, e isso e esperado neste MVP. A proxima fase deve trocar essas policies por autenticacao e permissoes da equipe.

## Scripts

```bash
npm install
npm run dev
npm run build
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

Template inicial de cliente:

- `Integração de Novo Cliente`
  - Cadastro no SISRAMOS
  - Plano de Ação
  - Contrato
  - Gestão
  - Comunicação

## Logos de ferramentas

As logos iniciais ficam em `public/ai-tools`:

- `/ai-tools/chatgpt.png`
- `/ai-tools/claude.png`
- `/ai-tools/notebooklm.png`

O campo `logo_url` da tabela `ai_tools` deve receber um desses caminhos, ou uma URL externa.

Se o banco ja tiver sido criado antes da inclusao das logos, execute apenas `supabase/add-ai-tool-logos.sql`.
