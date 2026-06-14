# Central de Projetos IA

Aplicacao interna para configurar e conduzir jornadas operacionais de projetos tecnicos com apoio de IA.

O sistema nasce como uma plataforma configuravel: ferramentas, prompts, tipos de projeto, jornadas, etapas, vinculos e procedimentos sao cadastrados pela propria equipe. Ele nao parte de etapas fixas no codigo.

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

Isso serve apenas para validar o fluxo do MVP. Nao cadastre dados sensiveis enquanto o acesso estiver publico. A proxima fase deve trocar essas policies por autenticacao e permissoes da equipe.

## Scripts

```bash
npm install
npm run dev
npm run build
```

## Modulos do MVP

- Ferramentas de IA
- Categorias de prompts
- Prompts reutilizaveis
- Tipos de projeto
- Jornadas configuraveis
- Etapas de jornada
- Vinculos entre etapas e prompts
- Procedimentos internos

## Logos de ferramentas

As logos iniciais ficam em `public/ai-tools`:

- `/ai-tools/chatgpt.png`
- `/ai-tools/claude.png`
- `/ai-tools/notebooklm.png`

O campo `logo_url` da tabela `ai_tools` deve receber um desses caminhos, ou uma URL externa.

Se o banco ja tiver sido criado antes da inclusao das logos, execute apenas `supabase/add-ai-tool-logos.sql`.
