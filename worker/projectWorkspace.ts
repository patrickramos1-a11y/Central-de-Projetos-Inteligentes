import { workspaceStatus, type WorkspaceKind, type WorkspaceReference } from "../src/features/workspace/workspaceModel";

type Env = { DB: D1Database };
type WorkspaceRow = { project_id: string; conversation_not_applicable: number; revision: number };
type CountRow = { project_id: string; directory_count: number; conversation_count: number; support_count: number };
type ClientRow = { id: string; name: string; company: string | null };

const headers = { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" };
const reply = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status, headers });
const fail = (message: string, status: number) => new Response(JSON.stringify({ error: message }), { status, headers });

export function toWorkspaceOverview(row: WorkspaceRow, counts?: CountRow) {
  const directoryCount = counts?.directory_count ?? 0;
  const conversationCount = counts?.conversation_count ?? 0;
  const supportCount = counts?.support_count ?? 0;
  const conversationNotApplicable = Boolean(row.conversation_not_applicable);
  return {
    projectId: row.project_id, directoryCount, conversationCount, supportCount,
    conversationNotApplicable, revision: row.revision,
    status: workspaceStatus(directoryCount, conversationCount, conversationNotApplicable),
  };
}

const countSql = `select project_id,
  sum(case when kind = 'directory' then 1 else 0 end) as directory_count,
  sum(case when kind = 'conversation' then 1 else 0 end) as conversation_count,
  sum(case when kind = 'support' then 1 else 0 end) as support_count
  from project_workspace_references group by project_id`;

export async function readWorkspaceOverview(db: D1Database) {
  const [rows, counts] = await Promise.all([
    db.prepare("select project_id, conversation_not_applicable, revision from project_workspaces").all<WorkspaceRow>(),
    db.prepare(countSql).all<CountRow>(),
  ]);
  const byProject = new Map((counts.results ?? []).map((row) => [row.project_id, row]));
  return (rows.results ?? []).map((row) => toWorkspaceOverview(row, byProject.get(row.project_id)));
}

async function readWorkspace(db: D1Database, projectId: string) {
  const [row, refs, counts, project] = await Promise.all([
    db.prepare("select project_id, conversation_not_applicable, revision from project_workspaces where project_id = ?").bind(projectId).first<WorkspaceRow>(),
    db.prepare("select id, project_id, kind, title, target, notes, sort_order, created_at, updated_at from project_workspace_references where project_id = ? order by kind, sort_order, created_at").bind(projectId).all<WorkspaceReference>(),
    db.prepare(`select * from (${countSql}) where project_id = ?`).bind(projectId).first<CountRow>(),
    db.prepare("select id, journey_template_id from projects where id = ?").bind(projectId).first<{ id: string; journey_template_id: string | null }>(),
  ]);
  if (!row || !project) return null;
  const guidance = project.journey_template_id
    ? await db.prepare("select guidance from template_workspace_guidance where template_id = ?").bind(project.journey_template_id).first<{ guidance: string }>()
    : null;
  return { ...toWorkspaceOverview(row, counts ?? undefined), references: refs.results ?? [], guidance: guidance?.guidance ?? "" };
}

type SubmittedReference = Pick<WorkspaceReference, "id" | "kind" | "title" | "target" | "notes">;

export function validateWorkspaceSubmission(body: unknown): { expectedRevision: number; conversationNotApplicable: boolean; references: SubmittedReference[] } | string {
  if (!body || typeof body !== "object") return "Envie os dados do local de trabalho.";
  const value = body as Record<string, unknown>;
  if (!Number.isSafeInteger(value.expectedRevision) || Number(value.expectedRevision) < 0) return "Versao invalida.";
  if (typeof value.conversationNotApplicable !== "boolean") return "Informe se a conversa nao se aplica.";
  if (!Array.isArray(value.references) || value.references.length > 100) return "Limite de 100 referencias por projeto.";
  const ids = new Set<string>();
  const references: SubmittedReference[] = [];
  for (const item of value.references) {
    if (!item || typeof item !== "object") return "Referencia invalida.";
    const ref = item as Record<string, unknown>;
    if (typeof ref.id !== "string" || !ref.id || ref.id.length > 100 || ids.has(ref.id)) return "Identificador de referencia invalido ou repetido.";
    if (ref.kind !== "directory" && ref.kind !== "conversation" && ref.kind !== "support") return "Tipo de referencia invalido.";
    if (typeof ref.title !== "string" || !ref.title.trim() || ref.title.length > 160) return "Informe um nome de ate 160 caracteres.";
    if (typeof ref.target !== "string" || !ref.target.trim() || ref.target.length > 4000) return "Informe um caminho ou endereco de ate 4000 caracteres.";
    if (ref.kind !== "directory") {
      try {
        const url = new URL(ref.target);
        if (url.protocol !== "https:" && url.protocol !== "http:") return "Links devem usar http ou https.";
      } catch { return "Informe um link http ou https valido."; }
    }
    if (ref.notes != null && (typeof ref.notes !== "string" || ref.notes.length > 2000)) return "Observacao deve ter ate 2000 caracteres.";
    ids.add(ref.id);
    references.push({ id: ref.id, kind: ref.kind as WorkspaceKind, title: ref.title.trim(), target: ref.target.trim(), notes: typeof ref.notes === "string" ? ref.notes.trim() || null : null });
  }
  if (value.conversationNotApplicable && references.some((ref) => ref.kind === "conversation")) return "Remova os links de conversa antes de marcar Nao se aplica.";
  return { expectedRevision: value.expectedRevision as number, conversationNotApplicable: value.conversationNotApplicable, references };
}

export function uniqueLegacyNames(client: ClientRow, clients: ClientRow[]) {
  const names = [client.name, client.company].filter((name): name is string => Boolean(name?.trim())).map((name) => name.trim().toLocaleLowerCase());
  const ownNames = [...new Set(names)];
  return ownNames.filter((name) => clients.filter((candidate) => [candidate.name, candidate.company].some((other) => other?.trim().toLocaleLowerCase() === name)).length === 1);
}

export async function handleProjectWorkspaceRequest(request: Request, env: Env, parts: string[]): Promise<Response | null> {
  if (parts[0] !== "api") return null;
  if (parts[1] === "workspaces" && parts[2] === "overview" && request.method === "GET") return reply(await readWorkspaceOverview(env.DB));

  if (parts[1] === "projects" && parts[2] && parts[3] === "workspace") {
    const projectId = parts[2];
    if (request.method === "GET") {
      const data = await readWorkspace(env.DB, projectId);
      return data ? reply(data) : fail("Projeto nao encontrado.", 404);
    }
    if (request.method !== "PUT") return fail("Metodo nao permitido.", 405);
    const submitted = validateWorkspaceSubmission(await request.json());
    if (typeof submitted === "string") return fail(submitted, 400);
    const before = await readWorkspace(env.DB, projectId);
    if (!before) return fail("Projeto nao encontrado.", 404);
    if (before.revision !== submitted.expectedRevision) return fail("O local de trabalho foi alterado em outra sessao. Atualize antes de salvar.", 409);
    const now = new Date().toISOString();
    const existing = new Map(before.references.map((ref) => [ref.id, ref]));
    const statements = [
      env.DB.prepare("delete from project_workspace_references where project_id = ? and (select revision from project_workspaces where project_id = ?) = ?").bind(projectId, projectId, submitted.expectedRevision),
      ...submitted.references.map((ref, index) => env.DB.prepare(`insert into project_workspace_references
        (id, project_id, kind, title, target, notes, sort_order, created_at, updated_at)
        select ?, ?, ?, ?, ?, ?, ?, ?, ? where (select revision from project_workspaces where project_id = ?) = ?`)
        .bind(ref.id, projectId, ref.kind, ref.title, ref.target, ref.notes, index, existing.get(ref.id)?.created_at ?? now, now, projectId, submitted.expectedRevision)),
      env.DB.prepare("update project_workspaces set conversation_not_applicable = ?, revision = revision + 1, updated_at = ? where project_id = ? and revision = ?")
        .bind(submitted.conversationNotApplicable ? 1 : 0, now, projectId, submitted.expectedRevision),
    ];
    const results = await env.DB.batch(statements);
    if (!results.at(-1)?.meta?.changes) return fail("O local de trabalho foi alterado em outra sessao. Atualize antes de salvar.", 409);
    return reply(await readWorkspace(env.DB, projectId));
  }

  if (parts[1] === "clients" && parts[2] && parts[3] === "workspaces" && request.method === "GET") {
    const clientId = parts[2];
    const client = await env.DB.prepare("select id, name, company from clients where id = ?").bind(clientId).first<ClientRow>();
    if (!client) return fail("Cliente nao encontrado.", 404);
    const explicit = await env.DB.prepare("select id, name, company, client_id, status from projects where client_id = ? order by name").bind(clientId).all<{ id: string; name: string; company: string | null; client_id: string | null; status: string }>();
    const clients = await env.DB.prepare("select id, name, company from clients").all<ClientRow>();
    const legacyNames = uniqueLegacyNames(client, clients.results ?? []);
    const legacy = legacyNames.length
      ? await env.DB.prepare(`select id, name, company, client_id, status from projects where client_id is null and lower(trim(company)) in (${legacyNames.map(() => "?").join(",")}) order by name`).bind(...legacyNames).all<{ id: string; name: string; company: string | null; client_id: string | null; status: string }>()
      : { results: [] };
    const projects = [...(explicit.results ?? []).map((project) => ({ ...project, linkType: "explicit" })), ...(legacy.results ?? []).map((project) => ({ ...project, linkType: "legacy" }))];
    const workspaces = await Promise.all(projects.map(async (project) => ({ project, workspace: await readWorkspace(env.DB, project.id) })));
    return reply(workspaces);
  }

  if (parts[1] === "journey-templates" && parts[2] && parts[3] === "workspace-guidance") {
    const templateId = parts[2];
    const exists = await env.DB.prepare("select id from journey_templates where id = ?").bind(templateId).first();
    if (!exists) return fail("Template nao encontrado.", 404);
    if (request.method === "GET") {
      const row = await env.DB.prepare("select guidance from template_workspace_guidance where template_id = ?").bind(templateId).first<{ guidance: string }>();
      return reply({ guidance: row?.guidance ?? "" });
    }
    if (request.method === "PUT") {
      const body = await request.json() as { guidance?: unknown };
      if (typeof body.guidance !== "string" || body.guidance.length > 4000) return fail("Orientacao deve ter ate 4000 caracteres.", 400);
      await env.DB.prepare(`insert into template_workspace_guidance(template_id, guidance, updated_at) values (?, ?, ?)
        on conflict(template_id) do update set guidance = excluded.guidance, updated_at = excluded.updated_at`)
        .bind(templateId, body.guidance.trim(), new Date().toISOString()).run();
      return reply({ guidance: body.guidance.trim() });
    }
    return fail("Metodo nao permitido.", 405);
  }
  return null;
}

export async function isProjectWorkspaceOrganized(db: D1Database, projectId: string) {
  const row = await db.prepare(`select w.conversation_not_applicable,
    sum(case when r.kind = 'directory' then 1 else 0 end) as directory_count,
    sum(case when r.kind = 'conversation' then 1 else 0 end) as conversation_count
    from project_workspaces w left join project_workspace_references r on r.project_id = w.project_id
    where w.project_id = ? group by w.project_id`).bind(projectId).first<{ conversation_not_applicable: number; directory_count: number; conversation_count: number }>();
  return Boolean(row && row.directory_count > 0 && (row.conversation_count > 0 || row.conversation_not_applicable));
}
