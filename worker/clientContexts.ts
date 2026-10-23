type ContextRow = Record<string, unknown>;
type ContextCard = {
  id: string;
  title: string;
  content: string;
  color?: string;
  sourceContextId?: string;
  sourceVersion?: number;
  [key: string]: unknown;
};

const now = () => new Date().toISOString();

export async function clientContextList(db: D1Database, clientId: string, search = "", includeArchived = false, category = "", offset = 0) {
  const client = await db.prepare("select id from clients where id = ?").bind(clientId).first();
  if (!client) throw new Error("Cliente nao encontrado.");
  const rows = await db.prepare(`select id, client_id, title, content, category, status, version, origin_type, origin_project_id, origin_step_id, origin_block_id, origin_context_id, created_at, updated_at, archived_at
    from client_contexts where client_id = ? and (? = 1 or status = 'active') and (? = '' or category = ?) and (? = '' or lower(title || ' ' || content || ' ' || coalesce(category, '')) like ?)
    order by updated_at desc, id desc limit 100 offset ?`)
    .bind(clientId, includeArchived ? 1 : 0, category, category, search, `%${search.toLowerCase()}%`, Math.max(0, offset)).all<ContextRow>();
  return rows.results ?? [];
}

export async function createClientContext(db: D1Database, clientId: string, body: { title?: string; content?: string; category?: string | null }) {
  const title = String(body.title ?? "").trim();
  const content = String(body.content ?? "").trim();
  if (!title || !content) throw new Error("Informe titulo e conteudo do contexto.");
  const client = await db.prepare("select id from clients where id = ?").bind(clientId).first();
  if (!client) throw new Error("Cliente nao encontrado.");
  const id = crypto.randomUUID();
  const timestamp = now();
  const category = String(body.category ?? "").trim() || null;
  await db.batch([
    db.prepare("insert into client_contexts (id, client_id, title, content, category, status, version, origin_type, created_at, updated_at) values (?, ?, ?, ?, ?, 'active', 1, 'client', ?, ?)").bind(id, clientId, title, content, category, timestamp, timestamp),
    db.prepare("insert into client_context_versions (context_id, version, title, content, category, created_at) values (?, 1, ?, ?, ?, ?)").bind(id, title, content, category, timestamp),
  ]);
  return getClientContext(db, clientId, id);
}

export async function getClientContext(db: D1Database, clientId: string, contextId: string) {
  const row = await db.prepare("select * from client_contexts where id = ? and client_id = ?").bind(contextId, clientId).first<ContextRow>();
  if (!row) throw new Error("Contexto do cliente nao encontrado.");
  return row;
}

export async function updateClientContext(db: D1Database, clientId: string, contextId: string, body: { title?: string; content?: string; category?: string | null; status?: string; expectedVersion?: number }) {
  const current = await getClientContext(db, clientId, contextId);
  if (body.expectedVersion !== undefined && Number(current.version) !== body.expectedVersion) throw new Error("Este contexto foi alterado em outra sessao. Atualize antes de salvar.");
  const title = String(body.title ?? current.title).trim();
  const content = String(body.content ?? current.content).trim();
  if (!title || !content) throw new Error("Informe titulo e conteudo do contexto.");
  const category = body.category === undefined ? current.category ?? null : String(body.category ?? "").trim() || null;
  const status = body.status === "archived" ? "archived" : body.status === "active" ? "active" : String(current.status);
  const version = Number(current.version) + 1;
  const timestamp = now();
  const results = await db.batch([
    db.prepare("update client_contexts set title = ?, content = ?, category = ?, status = ?, version = ?, updated_at = ?, archived_at = ? where id = ? and client_id = ? and version = ?")
      .bind(title, content, category, status, version, timestamp, status === "archived" ? timestamp : null, contextId, clientId, current.version),
    db.prepare("insert into client_context_versions (context_id, version, title, content, category, created_at) values (?, ?, ?, ?, ?, ?)")
      .bind(contextId, version, title, content, category, timestamp),
  ]);
  if (Number(results[0]?.meta?.changes ?? 0) !== 1) throw new Error("Este contexto foi alterado em outra sessao. Atualize antes de salvar.");
  return getClientContext(db, clientId, contextId);
}

export async function prepareProjectContextSave(db: D1Database, stepId: string, blockId: string, previous: ContextCard[], next: ContextCard[]) {
  const owner = await db.prepare("select p.id as project_id, p.client_id from project_steps s join projects p on p.id = s.project_id where s.id = ?")
    .bind(stepId).first<{ project_id: string; client_id: string | null }>();
  if (!owner) throw new Error("Projeto nao encontrado.");
  if (!owner.client_id) return { contexts: next, statements: [] as D1PreparedStatement[] };
  const previousIds = new Set(previous.map((context) => context.id));
  const statements: D1PreparedStatement[] = [];
  const contexts: ContextCard[] = [];
  for (const context of next) {
    if (previousIds.has(context.id)) { contexts.push(context); continue; }
    if (context.sourceContextId) {
      const source = await db.prepare("select version, title, content from client_contexts where id = ? and client_id = ? and status = 'active'")
        .bind(context.sourceContextId, owner.client_id).first<{ version: number; title: string; content: string }>();
      if (!source || Number(context.sourceVersion) !== Number(source.version) || context.title !== source.title || context.content !== source.content) {
        throw new Error("Contexto importado desatualizado ou de outro cliente. Atualize a biblioteca antes de salvar.");
      }
      contexts.push(context);
      continue;
    }
    const title = String(context.title ?? "").trim();
    const content = String(context.content ?? "").trim();
    if (!title || !content) throw new Error("Informe titulo e conteudo do contexto.");
    const sourceContextId = crypto.randomUUID();
    const timestamp = now();
    statements.push(db.prepare("insert into client_contexts (id, client_id, title, content, category, status, version, origin_type, origin_project_id, origin_step_id, origin_block_id, origin_context_id, created_at, updated_at) values (?, ?, ?, ?, null, 'active', 1, 'project', ?, ?, ?, ?, ?, ?)")
      .bind(sourceContextId, owner.client_id, title, content, owner.project_id, stepId, blockId, context.id, timestamp, timestamp));
    statements.push(db.prepare("insert into client_context_versions (context_id, version, title, content, category, created_at) values (?, 1, ?, ?, null, ?)")
      .bind(sourceContextId, title, content, timestamp));
    contexts.push({ ...context, sourceContextId, sourceVersion: 1 });
  }
  return { contexts, statements };
}

export async function contextSnapshots(db: D1Database, clientId: string, ids: string[]) {
  const uniqueIds = [...new Set(ids)].slice(0, 100);
  const rows: ContextRow[] = [];
  for (const id of uniqueIds) {
    const row = await db.prepare("select id, title, content, version from client_contexts where id = ? and client_id = ? and status = 'active'")
      .bind(id, clientId).first<ContextRow>();
    if (!row) throw new Error("Contexto indisponivel ou arquivado. Atualize a lista.");
    rows.push(row);
  }
  return rows.map((row) => ({ id: crypto.randomUUID(), title: String(row.title), content: String(row.content), color: "mint", sourceContextId: String(row.id), sourceVersion: Number(row.version) }));
}

export async function currentContextVersion(db: D1Database, clientId: string, sourceContextId: string) {
  return getClientContext(db, clientId, sourceContextId);
}

export async function clientContextReconciliation(db: D1Database, clientId: string) {
  const sources = (await db.prepare("select id, title from client_contexts where client_id = ?").bind(clientId).all<ContextRow>()).results ?? [];
  const libraryTitles = new Map<string, string[]>();
  for (const source of sources) {
    const key = String(source.title).trim().toLocaleLowerCase();
    libraryTitles.set(key, [...libraryTitles.get(key) ?? [], String(source.id)]);
  }
  const projects = await db.prepare("select id, name from projects where client_id = ? order by created_at desc").bind(clientId).all<{ id: string; name: string }>();
  const candidates: Array<{ projectId: string; projectName: string; stepId: string; blockId: string; contextId: string; title: string; content: string; possibleDuplicates: string[]; origin: "canonical" | "legacy" }> = [];
  for (const project of projects.results ?? []) {
    const steps = await db.prepare("select id from project_steps where project_id = ?").bind(project.id).all<{ id: string }>();
    for (const step of steps.results ?? []) {
      const document = await db.prepare("select document_json from journey_step_documents where owner_type = 'project' and step_id = ? and state in ('draft','published') order by case state when 'draft' then 0 else 1 end limit 1")
        .bind(step.id).first<{ document_json: string }>();
      const parsed = document ? JSON.parse(document.document_json) as { blocks?: Array<{ id: string; type: string }> } : null;
      const contextBlockIds = new Set((parsed?.blocks ?? []).filter((block) => block.type === "context").map((block) => block.id));
      const values = await db.prepare("select block_id, value_json from journey_step_values where owner_type = 'project' and owner_step_id = ?")
        .bind(step.id).all<{ block_id: string; value_json: string }>();
      const seen = new Set<string>();
      for (const value of values.results ?? []) {
        if (!contextBlockIds.has(value.block_id)) continue;
        const parsedValue = JSON.parse(value.value_json) as { contexts?: ContextCard[] };
        for (const context of parsedValue.contexts ?? []) {
          seen.add(context.id);
          if (context.sourceContextId) continue;
          candidates.push({ projectId: project.id, projectName: project.name, stepId: step.id, blockId: value.block_id, contextId: context.id, title: context.title, content: context.content, possibleDuplicates: libraryTitles.get(context.title.trim().toLocaleLowerCase()) ?? [], origin: "canonical" });
        }
      }
      const legacy = await db.prepare("select id, title, content from project_step_contexts where project_step_id = ?").bind(step.id).all<{ id: string; title: string; content: string }>();
      for (const context of legacy.results ?? []) {
        if (seen.has(context.id)) continue;
        candidates.push({ projectId: project.id, projectName: project.name, stepId: step.id, blockId: "", contextId: context.id, title: context.title, content: context.content, possibleDuplicates: libraryTitles.get(context.title.trim().toLocaleLowerCase()) ?? [], origin: "legacy" });
      }
    }
  }
  return { candidates, ambiguousCount: candidates.filter((item) => item.possibleDuplicates.length > 0).length };
}
