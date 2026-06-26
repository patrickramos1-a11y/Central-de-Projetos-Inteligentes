# Cloudflare

Infraestrutura alvo da Central de Projetos IA:

- Cloudflare Pages para o Vite/React.
- Cloudflare Worker para a API.
- Cloudflare D1 para dados relacionais.
- Cloudflare R2 para arquivos.
- Cloudflare Access para proteger o painel da equipe.

## Recursos sugeridos

- D1: `central-projetos-ia`
- R2: `central-projetos-ia-files`
- Worker/API: `central-projetos-ia-api`
- Pages: `central-de-projetos-inteligentes`

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
npm run cf:deploy:api
npm run cf:pages:deploy
```

Depois, configure o Cloudflare Access para proteger o domínio do Pages e, se a API ficar em domínio separado, proteja também o Worker.

Estado remoto ja criado:

- D1 `central-projetos-ia`: `8b150f2d-db0d-433e-8f88-98b5f83b3ef8`
- Worker script `central-projetos-ia-api`
- Pages project `central-de-projetos-inteligentes`

Pendencias no dashboard Cloudflare:

- Abrir **Workers & Pages** uma vez para criar o subdominio `workers.dev`.
- Habilitar **R2** para criar `central-projetos-ia-files` e reativar o binding `FILES` no `wrangler.jsonc`.

## Exportar dados do Supabase

Quando chegar a hora do corte, gere um SQL de importacao preservando IDs:

```bash
SUPABASE_URL=https://seu-projeto.supabase.co SUPABASE_SERVICE_ROLE_KEY=sua-chave bun run cf:export:supabase
```

Depois aplique o arquivo gerado:

```bash
wrangler d1 execute central-projetos-ia --remote --file cloudflare/import/supabase-data.sql
```
