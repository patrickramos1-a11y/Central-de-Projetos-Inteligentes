# Diagnóstico de UX e proposta de refatoração visual — Ramos Jornadas

> 12/11/2026 · Base: inspeção da plataforma publicada (Worker e Vercel), leitura do código (`src/app/App.tsx`, `src/styles.css`, `features/*`, `worker/*`), dados reais da API e comentários do Patrick.
>
> Documento de diagnóstico e proposta. Nada aqui foi implementado ainda.

---

## 1. Resumo executivo

A plataforma está **funcionalmente madura** (60 projetos, 66 clientes, 34 prompts, etapas compartilhadas com propagação canônica), mas a **camada de interface cresceu por acréscimo**: cada recurso novo ganhou um botão, um painel ou um modo, sem uma revisão do todo. O resultado:

1. **Um mesmo lugar faz coisas de naturezas diferentes.** A jornada do projeto mistura *executar* e *editar a estrutura*, e a tela de etapas mistura *configurar* e *visualizar*.
2. **Hierarquia visual fraca.** Muitos botões com o mesmo peso, lado a lado (a barra da etapa tem 11 controles), e formulários de cadastro acima da lista que a pessoa procura.
3. **Falta um modelo de "slot".** O template só consegue guardar links *fixos*; não existe "aqui entra o link do Drive dos Projetos Básicos", a ser preenchido em cada projeto.
4. **Faltam dados para gestão por semana.** O projeto não tem `completed_at`; hoje é impossível dizer com segurança o que foi entregue em cada semana.
5. **Dívida estrutural no front-end.** `App.tsx` tem **9.142 linhas** (197 `useState`, ~50 componentes) e `styles.css` tem **9.580 linhas**, além de 7 folhas de estilo. Qualquer ajuste visual hoje é arriscado e lento, e explica parte da incoerência entre telas.

A proposta é uma refatoração em **4 ondas**, começando por fundações (dados de entrega + shell/layout + design system), depois o que dá mais retorno no dia a dia (Projetos/Modo Entrega e Jornada só de execução), depois Templates/Etapas e por fim Configurações e Gestão.

---

## 2. Diagnóstico por área

### 2.1 Estrutura geral (shell, navegação, layout)

| Problema | Evidência | Impacto |
|---|---|---|
| Cabeçalho alto e "flutuante" | Nav em 2 linhas (Configurações cai para a linha de baixo em ~1000px); o cabeçalho fixo cobre o topo do conteúdo (prints 1, 2 e 5: título "Nova etapa" e campos cortados atrás do header). | Perda de ~130–200px úteis e sensação de tela poluída. |
| Sub-navegação de Configurações com rolagem horizontal e rótulos quebrados | "Biblioteca de Prompts" quebra em 3 linhas; "Etapas de Template" sai da tela. | Áreas importantes ficam escondidas. |
| Nomes sem acento | "Configuracoes", "Gestao", "Usuario", "Nao se aplica", "Orientacao". | Aparência de sistema inacabado. |
| Sem padrão de página | Cada tela monta seu próprio cabeçalho, ações e lista (`topbar`, `form-heading`, `template-editor-header`, `journey-command-bar`). | Botões de salvar mudam de lugar e de nome entre telas ("Salvar", "Salvar nova versao", "Salvar rascunho", "Publicar versao", "Salvar template", "Salvar visual inicial"). |
| Código monolítico | `App.tsx` 9.142 linhas; `styles.css` 9.580 linhas, 49 `@media`, 25 `!important`, mais `theme-cobalt.css` sobrescrevendo. | Cada mudança visual afeta outras telas; regressões frequentes. |

### 2.2 Projetos (carteira)

- A carteira está boa como **lista operacional** (filtros, agrupamento, ordenação, status do Local de trabalho).
- **Falta a visão por tempo** pedida: o que foi criado, entregue e quem produziu em cada semana (segunda a domingo).
- **Bloqueio de dados:** a tabela `projects` não tem `completed_at`. Nos dados reais, 21 dos 28 projetos concluídos têm `updated_at` na semana de 19/10, o que é sinal de atualização em lote, não de entrega. Sem `completed_at`, qualquer "entregues por semana" sairia errado.
- "Concluído" e "etapas concluídas" são independentes: a Gestão mostra **25 projetos concluídos com etapas abertas**. Isso polui os indicadores e precisa de regra clara (ver 3.2).

### 2.3 Jornada do projeto (execução)

- **"Editar estrutura" dentro do projeto é a maior fonte de confusão.** A barra da etapa reúne: Executar / Editar estrutura / Abrir todos / Recolher todos / Restaurar / Não se aplica / Concluir / campo "Nova etapa" / Adicionar etapa / Adicionar bloco / Salvar visual inicial / Salvar template (print 7). São três intenções diferentes no mesmo lugar:
  - executar a etapa (Concluir, Não se aplica);
  - organizar a visualização (Abrir/Recolher/Restaurar/Salvar visual inicial);
  - mudar a estrutura (Adicionar etapa/bloco, Salvar template).
- Como a etapa pode estar vinculada a uma **etapa compartilhada**, editar a estrutura dentro do projeto cria ambiguidade: a pessoa não sabe se está mudando só este projeto, o template ou a biblioteca.
- A trilha lateral é estreita e com rótulos minúsculos ("LOCAL TRAB.", "CLAUD"), sem status claro de cada etapa.
- A mensagem "Para concluir esta etapa: Preencha o bloco Links ou Diretório..." aparece em amarelo largo, mas o bloco a preencher não fica destacado.

### 2.4 Etapa 0 — Local de trabalho

- É o componente **mais bem resolvido** da plataforma: tipos claros (Servidor / Conversa / Apoio), ícone do provedor (Drive, NotebookLM etc.), autor e data, copiar/abrir.
- **Falta "Aplicar template".** Projetos de levantamento nascem só com a Etapa 0; quando o projeto "vira" projeto de fato, não há como aplicar um template inteiro. Hoje é preciso adicionar etapa por etapa.

### 2.5 Blocos de link/materiais nas etapas

Causa raiz do problema relatado ("não consigo fazer uma etapa com um link para preencher, igual ao espaço zero"):

- O bloco **Materiais** (`MaterialsBlock`) só conhece dois tipos de link: *links fixos do template* (mesma URL para todos os projetos) e *links soltos do projeto*. Não existe **"link esperado"**: um item com rótulo definido no template ("Projetos básicos — Drive") e URL preenchida em cada projeto.
- O bloco **não usa o mesmo componente da Etapa 0**: sem ícone do provedor, sem autor/data, sem "Não se aplica" e sem diferença entre diretório de servidor (copiar) e URL (abrir).
- Exige título **e** URL para salvar, sem sugerir o título a partir da URL.
- Resultado: a regra de conclusão ("Preencha o bloco Links...") existe, mas o bloco não guia o preenchimento.

### 2.6 Templates e biblioteca de etapas

- O editor de etapa compartilhada (prints 1 e 2) mostra **todos os blocos abertos** com campos de formulário: é uma tela de configuração, não uma prévia de como a etapa vai aparecer no projeto. Não dá para "ver a etapa" antes de usar.
- "Salvar nova versão", "Salvar visual inicial" e "Arquivar" ficam lado a lado sem explicar o efeito (quantos templates/projetos serão afetados).
- Cards da biblioteca repetem "Sem descrição. Abra para documentar…" e "Usada em: PROJETOS AMBIENTAIS, …" truncados; nomes duplicados ("Nova etapa", "SUMARIO", "Sumário") dificultam escolher.
- No editor de template (print 6), a etapa compartilhada aparece só como lista de blocos colapsados, sem prévia do conteúdo nem indicação do que o projeto vai preencher.

### 2.7 Configurações — Biblioteca de Prompts

- **Ordem invertida:** o formulário "Cadastrar novo prompt" abre por padrão e ocupa a primeira dobra inteira; a biblioteca (o que se consulta 90% do tempo) fica embaixo (prints 3–5).
- Busca pequena (≈270px), sem filtros por categoria/ferramenta/tipo/status, que já existem como campos.
- Formulário em 3 colunas desalinhadas: "Identificação" com grande espaço vazio; variáveis em chips soltos.
- Cards da lista mostram "Criado no bloco…" / "Cadastro de apoio da operação" em vez de informação útil (categoria, ferramenta, onde é usado, versão).
- O mesmo padrão `ConfigCrud` (formulário em cima, lista embaixo) se repete em Usuários, Ferramentas, Categorias, Tipos etc.

### 2.8 Gestão

- Repete a carteira de Projetos ("Projetos abertos – 34" com a mesma lista).
- Indicadores pouco acionáveis ("Acompanhar 34" = "Projetos ativos 34").
- "Concluído com etapas abertas" (25) mistura um problema de dados com uma fila de atenção.

---

## 3. Proposta de solução

### 3.1 Princípios de interface (valem para todas as telas)

1. **Uma tela, uma intenção.** Executar (Projetos), modelar (Templates/Etapas), administrar (Configurações), acompanhar (Gestão).
2. **Lista primeiro, formulário sob demanda.** Cadastrar e editar abrem em um painel lateral (drawer) à direita; a lista nunca sai da tela.
3. **Uma ação primária por contexto.** As demais vão para um menu "⋯".
4. **Pré-visualizar = ver como o projeto verá.** Toda edição de estrutura tem a aba "Prévia".
5. **Deixar claro o alcance antes de salvar:** "Esta alteração atualiza 3 templates e 12 projetos."
6. **Português com acentuação** em toda a interface.

### 3.2 Fundações (Onda 1)

**Shell e navegação**
- Barra lateral esquerda fixa e recolhível (ícone + rótulo): Projetos, Entregas, Clientes, Templates, Gestão, Configurações. Usuário e status de sincronização no rodapé da barra.
- Cabeçalho de página padrão (`PageHeader`): título, subtítulo curto, ação primária à direita e abas da página logo abaixo. Nada fixo cobrindo conteúdo.
- Configurações com navegação vertical interna (lista à esquerda), sem rolagem horizontal.

**Design system mínimo**
- Componentes: `PageHeader`, `Toolbar` (busca grande + filtros em chips), `DataTable/CardList`, `Drawer`, `ActionMenu`, `EmptyState`, `StatusPill`, `ProviderBadge`, `ConfirmImpact`.
- Tokens únicos (cor, espaçamento, raio, tipografia) e remoção gradual de `!important` e de duplicações entre `styles.css` e `theme-cobalt.css`.

**Separar o `App.tsx`**
- Mover cada visão para `src/features/<área>/` (ProjectsView, JourneyView, ClientsView, ManagementView, SettingsView, blocos) e os estados para hooks por área. Sem mudar comportamento; com os testes atuais como rede de segurança.

**Dados para entregas** (migration aditiva e idempotente, com `cf:d1:backup` antes)
- `projects.completed_at`, `projects.completed_by`, `projects.started_at` (opcional).
- Gravar `completed_at` ao concluir e limpar ao reabrir; registrar em eventos.
- Backfill: usar o evento de conclusão quando existir; senão `updated_at`, marcando `completed_at_estimated = 1` para que a tela sinalize "data estimada".
- Regra de conclusão: ao concluir com etapas abertas, perguntar "Marcar as etapas restantes como Não se aplica?". Isso acaba com a contradição dos 25 projetos.

### 3.3 Projetos + Modo Entrega (Onda 2)

**Carteira** com alternância de visão: `Lista` · `Quadro` (por status ou responsável) · **`Entregas`**.

**Modo Entrega (semana de segunda a domingo)**
- Linha do tempo de semanas (as 8 últimas + a atual), cada uma com:
  - **Criadas** (jornadas iniciadas), **Concluídas** (entregas) e **Em andamento** no fim da semana;
  - lista das entregas da semana: cliente (logo), projeto, tipo/modalidade, responsável e link direto;
  - comparação com a semana anterior (↑/↓).
- **Engajamento da equipe** por pessoa e semana:
  - projetos criados, concluídos e etapas concluídas;
  - referências registradas no Local de trabalho e blocos preenchidos (já existe autoria em `journey_step_events` e nas referências);
  - "última atividade" e um mapa de calor simples (pessoa × dia).
- Filtros: responsável, cliente, tipo/modalidade e período. Exportar a semana (copiar resumo em texto para WhatsApp/e-mail).
- Endpoint no Worker: `GET /api/deliveries?from=&to=` agregando por semana ISO, para não calcular tudo no navegador.

### 3.4 Jornada do projeto — só execução (Onda 2)

- **Remover "Editar estrutura" do projeto.** O projeto executa; estrutura se muda em Templates/Etapas.
- Exceções úteis, em menu "⋯ Ajustar este projeto": adicionar etapa (em branco ou da biblioteca), **aplicar template**, ocultar etapa (Não se aplica) e desvincular para personalizar (com aviso).
- Barra da etapa enxuta: nome da etapa + status; **primária: "Concluir etapa"**; secundária: "Não se aplica"; o resto (abrir/recolher todos, restaurar visual) vira ícones discretos.
- Trilha lateral mais larga e legível, com status por etapa (✓ concluída, ● em andamento, ○ pendente, ⊘ não se aplica, que aparece compactada) e progresso do projeto no topo.
- Quando a conclusão estiver bloqueada, destacar o bloco pendente e rolar até ele.

**Etapa 0 + Aplicar template**
- Botão "Aplicar template" no Local de trabalho (e no menu ⋯). Fluxo: escolher template → prévia das etapas → escolher etapas (todas por padrão) → aplicar mantendo vínculos canônicos. Endpoint reaproveita a criação de projeto por template (`/api/projects/:id/templates`).
- Mostrar ao lado o template aplicado e a versão.

### 3.5 Bloco de Links unificado com a Etapa 0 (Onda 2)

Novo bloco **"Links e diretórios"** (substitui Materiais, com migração automática dos existentes), reaproveitando o componente da Etapa 0:

- No template/etapa, definem-se **slots**: rótulo ("Projetos básicos"), tipo esperado (Drive, NotebookLM, servidor, conversa, qualquer URL), obrigatório ou não e orientação curta.
- No projeto, cada slot aparece como linha vazia com o ícone do provedor: "Colar link do Drive dos Projetos básicos". Ao colar, o provedor é detectado e o título é sugerido; registra autor e data.
- Mantém links fixos (iguais para todos) e links extras livres.
- A regra de conclusão passa a considerar "slots obrigatórios preenchidos ou Não se aplica".
- Os slots preenchidos aparecem também no Local de trabalho, em uma seção "Links das etapas", para tudo ficar encontrável num só lugar (e alimentar a Gestão).

### 3.6 Templates e Etapas (Onda 3)

- **Biblioteca de etapas** em duas colunas: lista à esquerda (busca, filtros por uso/cliente/arquivadas, nomes duplicados sinalizados) e etapa selecionada à direita.
- A etapa selecionada tem **abas: Prévia | Estrutura | Uso | Histórico**.
  - **Prévia** renderiza a etapa exatamente como no projeto (modo leitura): é a visualização "fluida" pedida.
  - **Estrutura**: blocos colapsados em cartões compactos, arrastar para reordenar, "+" entre blocos, configuração do bloco num drawer. Nada de todos os formulários abertos ao mesmo tempo.
  - **Uso**: templates e projetos vinculados.
  - **Histórico**: versões e eventos.
- Ação única **"Publicar versão"** com `ConfirmImpact` (quantos templates e projetos serão atualizados e o que não será tocado). Rascunho salvo automaticamente.
- **Editor de template**: trilha das etapas à esquerda e prévia da etapa à direita; "Adicionar etapa" abre a biblioteca com prévia ao lado. "Pré-visualizar novo projeto" vira a aba Prévia do template.
- Assistente de limpeza: listar etapas com nome igual ou parecido e uso 0, para arquivar ou consolidar (sem apagar).

### 3.7 Configurações — Biblioteca de Prompts e cadastros (Onda 4)

- Lista em primeiro plano com **busca larga** + filtros em chips (categoria, ferramenta, tipo de projeto, status) + ordenação.
- Cards ou tabela com: título, categoria, ferramenta (logo), versão, status, **onde é usado** (n.º de blocos/templates) e última atualização.
- Clique abre um **drawer de edição** com duas colunas: conteúdo (editor grande com destaque das `{{variáveis}}` e inserção por clique) e metadados (categoria, ferramenta, tipo, versão, status). "Novo prompt" abre o mesmo drawer vazio.
- Ações: duplicar, arquivar, ver usos. O mesmo padrão vale para Usuários, Ferramentas, Categorias, Tipos/Modalidades e Procedimentos.

### 3.8 Gestão (Onda 4)

Reposicionar como **central de atenção**, sem repetir a carteira:
- **Fila de ação**: bloqueados, sem responsável, sem tipo, Local de trabalho incompleto, etapas paradas há mais de N dias (por evento real, não por tempo decorrido).
- **Por responsável**: carga atual, entregas da semana, itens parados.
- **Referências**: busca global em diretórios, conversas e links de todos os projetos (o "onde está o arquivo do cliente X?").
- Indicadores somente quando levam a uma lista filtrada ao clicar.

---

## 4. Ideias além do que foi pedido

1. **Busca global (Ctrl+K)**: projetos, clientes, prompts, etapas e links num só campo.
2. **"Minha semana"** na entrada do usuário: meus projetos em andamento, etapas pendentes, o que concluí na semana.
3. **Retomar de onde parei**: abrir o projeto na última etapa trabalhada por aquele usuário.
4. **Resumo semanal automático** (texto pronto para o grupo da equipe) a partir do Modo Entrega.
5. **Saúde do template**: quantos projetos marcam a mesma etapa como "Não se aplica" (é sinal de que a etapa deveria sair do template).
6. **Autenticação real** (Cloudflare Access já está previsto nos headers `cf-access-jwt-assertion`): a identificação atual por clique no nome permite que qualquer pessoa assine como outra, o que compromete as métricas de engajamento.
7. **Uma única URL de produção.** Hoje existem Vercel (repassando `/api` ao Worker) e `workers.dev`. Sugestão: domínio próprio apontando para o Worker e o endereço da Vercel redirecionando para ele, para evitar duas versões do front-end publicadas em momentos diferentes.
8. **Prévia de impacto em toda ação destrutiva** (arquivar etapa, concluir com pendências, desvincular prompt).

---

## 5. Plano de execução

| Onda | Entregas | Risco | Depende de |
|---|---|---|---|
| **1 – Fundações** | Shell com barra lateral, `PageHeader`/`Drawer`/`Toolbar`, acentuação, divisão do `App.tsx` por área, migration `completed_at` + backfill + regra de conclusão | Médio (refatoração ampla, mas sem mudança de regra) | Backup D1 |
| **2 – Operação diária** | Modo Entrega + endpoint `/api/deliveries`, jornada só de execução, Aplicar template na Etapa 0, bloco Links com slots | Médio | Onda 1 |
| **3 – Modelagem** | Biblioteca de etapas com Prévia/Estrutura/Uso/Histórico, editor de template com prévia, publicar com impacto, limpeza de duplicadas | Médio-alto (toca propagação canônica) | Onda 2 (bloco Links) |
| **4 – Administração e gestão** | Configurações em lista + drawer, Biblioteca de Prompts nova, Gestão como central de atenção, busca global | Baixo-médio | Onda 1 |

Cada onda segue a regra da plataforma: `bun run test`, `bun run build`, `bun run build:worker`, teste em desktop/tablet/mobile e publicação com `cf:deploy:assets` + validação da URL pública.

---

## 6. Decisões necessárias antes de começar

1. **Conclusão de projeto com etapas abertas**: marcar as restantes como "Não se aplica" automaticamente ou só avisar?
2. **Engajamento**: quais ações contam (criar projeto, concluir etapa, preencher bloco, registrar link)? A métrica é visível para toda a equipe ou só para gestão?
3. **Edição de estrutura no projeto**: remover totalmente ou manter só "Adicionar etapa / Aplicar template / Não se aplica" (proposta)?
4. **URL oficial**: manter Vercel e Worker ou consolidar num domínio próprio?
5. **Ordem das ondas**: começar pelas Fundações (recomendado) ou antecipar Modo Entrega + Biblioteca de Prompts por darem retorno visível mais rápido?
