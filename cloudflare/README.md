# Cloudflare

Infraestrutura alvo da Central de Projetos IA:

- Cloudflare Worker com Static Assets para o Vite/React e API.
- Cloudflare D1 para dados relacionais.
- Cloudflare R2 para arquivos.
- Cloudflare Access para proteger o painel da equipe.

## Recursos sugeridos

- D1: `central-projetos-ia`
- R2: `central-projetos-ia-files`
- Worker/App/API: `central-projetos-ia-api`
- URL publica atual: `https://central-projetos-ia-api.patrickramos1-a11y.workers.dev`
- Pages: `central-de-projetos-inteligentes` criado, mas nao usado como rota principal nesta fase.

## Comandos

```bash
npm install
npm run cf:d1:migrate:local
npm run cf:dev
npm run build
```

Para aplicar no ambiente remoto depois de criar os recursos:

```bash
npm run cf:d1:migrate:remote
npm run build
npm run cf:deploy
```

Depois, configure o Cloudflare Access para proteger o Worker publicado.

Estado remoto ja criado:

- D1 `central-projetos-ia`: `8b150f2d-db0d-433e-8f88-98b5f83b3ef8`
- R2 `central-projetos-ia-files`
- Worker/App/API `central-projetos-ia-api`
- Subdominio workers.dev `patrickramos1-a11y`
- Pages project `central-de-projetos-inteligentes`, sem deployment principal

Pendencias no dashboard Cloudflare:

- Configurar **Cloudflare Access** no Worker para restringir o painel a equipe.

Como o token atual do Wrangler nao tem escopo de Access, essa protecao precisa ser feita no dashboard ou com um token da Cloudflare que tenha permissao de **Access: Apps and Policies Write**. Pelo dashboard: Workers & Pages > `central-projetos-ia-api` > Settings > Domains & Routes > habilitar Cloudflare Access na rota `workers.dev`, depois definir a politica com os e-mails permitidos.

## Exportar dados do Supabase

Quando chegar a hora do corte, gere um SQL de importacao preservando IDs:

```bash
SUPABASE_URL=https://seu-projeto.supabase.co SUPABASE_SERVICE_ROLE_KEY=sua-chave bun run cf:export:supabase
```

Depois aplique o arquivo gerado:

```bash
wrangler d1 execute central-projetos-ia --remote --file cloudflare/import/supabase-data.sql
```
