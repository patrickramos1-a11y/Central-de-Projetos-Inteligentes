import { serverDirectoryPath, workspaceStatus, type WorkspaceKind, type WorkspaceReference } from "../src/features/workspace/workspaceModel";
import { mergeWorkspaceReferences, normalizeManualReference, readLinkedWorkspaceReferences } from "./workspaceLinks";

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

function overviewWithReferences(row: WorkspaceRow, references: WorkspaceReference[]) {
  const counts = {
    project_id: row.project_id,
    directory_count: references.filter((ref) => ref.kind === "directory").length,
    conversation_count: references.filter((ref) => ref.kind === "conversation").length,
    support_count: references.filter((ref) => ref.kind === "support").length,
  };
  return toWorkspaceOverview({ ...row, conversation_not_applicable: counts.conversation_count ? 0 : row.conversation_not_applicable }, counts);
}

export async function readWorkspaceOverview(db: D1Database) {
  const [rows, manual, linked] = await Promise.all([
    db.prepare("select project_id, conversation_not_applicable, revision from project_workspaces").all<WorkspaceRow>(),
    db.prepare("select id, project_id, kind, title, target, notes, sort_order, created_at, updated_at from project_workspace_references").all<WorkspaceReference>(),
    readLinkedWorkspaceReferences(db),
  ]);
  const group = (references: WorkspaceReference[]) => {
    const byProject = new Map<string, WorkspaceReference[]>();
    for (const ref of references) byProject.set(ref.project_id, [...(byProject.get(ref.project_id) ?? []), ref]);
    return byProject;
  };
  const manualByProject = group((manual.results ?? []).map(normalizeManualReference));
  const linkedByProject = group(linked);
  return (rows.results ?? []).map((row) => overviewWithReferences(row,
    mergeWorkspaceReferences(manualByProject.get(row.project_id) ?? [], linkedByProject.get(row.project_id) ?? [])));
}

async function readWorkspace(db: D1Database, projectId: string) {
  const [row, manual, linked, project] = await Promise.all([
    db.prepare("select project_id, conversation_not_applicable, revision from project_workspaces where project_id = ?").bind(projectId).first<WorkspaceRow>(),
    db.prepare("select id, project_id, kind, title, target, notes, sort_order, created_at, updated_at from project_workspace_references where project_id = ? order by kind, sort_order, created_at").bind(projectId).all<WorkspaceReference>(),
    readLinkedWorkspaceReferences(db, projectId),
    db.prepare("select id, journey_template_id from projects where id = ?").bind(projectId).first<{ id: string; journey_template_id: string | null }>(),
  ]);
  if (!row || !project) return null;
  const guidance = project.journey_template_id
    ? await db.prepare("select guidance from template_workspace_guidance where template_id = ?").bind(project.journey_template_id).first<{ guidance: string }>()
    : null;
  const manualReferences = (manual.results ?? []).map(normalizeManualReference);
  const references = mergeWorkspaceReferences(manualReferences, linked);
  return { ...overviewWithReferences(row, references), references, manualReferences, guidance: guidance?.guidance ?? "" };
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
    if (ref.kind === "directory" && !serverDirectoryPath(ref.target)) return "Informe um caminho de diretorio do servidor, como \\\\Servidor\\Projetos\\...";
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
    if (submitted.conversationNotApplicable && before.references.some((ref) => ref.kind === "conversation" && ref.origin)) return fail("A jornada ja possui um link de conversa. Remova-o na etapa de origem antes de marcar Nao se aplica.", 400);
    const now = new Date().toISOString();
    const existing = new Map(before.manualReferences.map((ref) => [ref.id, ref]));
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
  const workspace = await readWorkspace(db, projectId);
  return workspace?.status === "organizado";
}
