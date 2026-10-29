import type { TemplateBlock, TemplateSnapshot } from "../src/features/templates/templateModel";

type Env = { DB: D1Database };
type StageDocument = { schemaVersion: 1; blocks: TemplateBlock[]; completionRules: Array<{ id: string; type: string; enabled: boolean; message?: string }> };
type StageRow = { id: string; name: string; description: string | null; status: string; current_version: number; document_json: string; created_at: string; updated_at: string; usage_count?: number };
const headers = { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" };
const reply = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status, headers });
const fail = (message: string, status = 400) => new Response(JSON.stringify({ error: message }), { status, headers });

function stageDocument(raw: unknown): StageDocument {
  let value: Record<string, unknown> = {};
  try { value = typeof raw === "string" ? JSON.parse(raw) as Record<string, unknown> : raw && typeof raw === "object" ? raw as Record<string, unknown> : {}; } catch { value = {}; }
  const blocks = Array.isArray(value.blocks) ? value.blocks.map((block, index) => {
    const item = block && typeof block === "object" ? block as Record<string, unknown> : {};
    return {
      ...item, id: String(item.id || crypto.randomUUID()), type: String(item.type || "long_text"), order: index + 1,
      title: String(item.title || "Bloco"), config: item.config && typeof item.config === "object" ? item.config as Record<string, unknown> : {},
    } as TemplateBlock;
  }) : [];
  return { schemaVersion: 1, blocks, completionRules: Array.isArray(value.completionRules) ? value.completionRules as StageDocument["completionRules"] : [] };
}

function expose(row: StageRow) {
  return { ...row, currentVersion: Number(row.current_version), usageCount: Number(row.usage_count ?? 0), document: stageDocument(row.document_json) };
}

async function stageById(db: D1Database, id: string) {
  return db.prepare(`select s.*, (select count(*) from template_stage_links l where l.stage_id = s.id and l.auto_update = 1) as usage_count
    from journey_stage_library s where s.id = ?`).bind(id).first<StageRow>();
}

function remapDocument(document: StageDocument, templateId: string, stepId: string, structureId: string, name: string, version: number) {
  return { schemaVersion: 1, ownerType: "template", templateId, stepId, structureId, title: name, status: "ativo", state: "published", versionNumber: version, revision: version, blocks: document.blocks, completionRules: document.completionRules };
}

async function updateLinkedTemplates(db: D1Database, stage: StageRow, document: StageDocument, version: number, timestamp: string) {
  const links = await db.prepare("select template_id, template_step_id from template_stage_links where stage_id = ? and auto_update = 1").bind(stage.id).all<{ template_id: string; template_step_id: string }>();
  const statements: D1PreparedStatement[] = [];
  for (const link of links.results ?? []) {
    const canonical = await db.prepare("select id, document_json from journey_step_documents where owner_type = 'template' and step_id = ? and state = 'published' order by version_number desc limit 1").bind(link.template_step_id).first<{ id: string; document_json: string }>();
    const structureId = canonical?.id ?? crypto.randomUUID();
    const mapped = remapDocument(document, link.template_id, link.template_step_id, structureId, stage.name, version);
    statements.push(db.prepare("update journey_steps set name = ?, description = ? where id = ? and journey_template_id = ?").bind(stage.name, stage.description, link.template_step_id, link.template_id));
    if (canonical) statements.push(db.prepare("update journey_step_documents set title = ?, version_number = ?, revision = revision + 1, document_json = ?, updated_at = ?, published_at = ? where id = ?").bind(stage.name, version, JSON.stringify(mapped), timestamp, timestamp, canonical.id));
    else statements.push(db.prepare("insert into journey_step_documents (id, owner_type, owner_id, step_id, schema_version, version_number, revision, state, title, document_json, created_at, updated_at, published_at) values (?, 'template', ?, ?, 1, ?, ?, 'published', ?, ?, ?, ?, ?)").bind(structureId, link.template_id, link.template_step_id, version, version, stage.name, JSON.stringify(mapped), timestamp, timestamp, timestamp));
    const versions = await db.prepare("select id, snapshot_json from journey_template_versions where template_id = ?").bind(link.template_id).all<{ id: string; snapshot_json: string }>();
    for (const templateVersion of versions.results ?? []) {
      try {
        const snapshot = JSON.parse(templateVersion.snapshot_json) as TemplateSnapshot;
        const next = { ...snapshot, steps: snapshot.steps.map((step) => step.id === link.template_step_id ? {
          ...step, name: stage.name, description: stage.description ?? "", sourceStageId: stage.id, sourceStageVersion: version,
          document: { ...step.document, title: stage.name, blocks: document.blocks, completionRules: document.completionRules },
        } : step) };
        statements.push(db.prepare("update journey_template_versions set snapshot_json = ?, updated_at = ? where id = ?").bind(JSON.stringify(next), timestamp, templateVersion.id));
      } catch { /* Keep malformed legacy snapshots untouched and available for manual review. */ }
    }
    statements.push(db.prepare("update template_stage_links set linked_version = ?, updated_at = ? where template_id = ? and template_step_id = ?").bind(version, timestamp, link.template_id, link.template_step_id));
  }
  if (statements.length) await db.batch(statements);
  return links.results?.length ?? 0;
}

export async function handleStageLibraryRequest(request: Request, env: Env, parts: string[]): Promise<Response | null> {
  if (parts[0] !== "api" || parts[1] !== "stage-library") return null;
  const id = parts[2];
  try {
    if (!id && request.method === "GET") {
      const rows = await env.DB.prepare(`select s.*, (select count(*) from template_stage_links l where l.stage_id = s.id and l.auto_update = 1) as usage_count
        from journey_stage_library s order by case s.status when 'active' then 0 else 1 end, lower(s.name), s.id`).all<StageRow>();
      return reply((rows.results ?? []).map(expose));
    }
    if (!id && request.method === "POST") {
      const body = await request.json() as Record<string, unknown>;
      const name = String(body.name ?? "Nova etapa").trim() || "Nova etapa";
      const description = String(body.description ?? "").trim() || null;
      const stageId = crypto.randomUUID(); const timestamp = new Date().toISOString(); const document = stageDocument(body.document);
      await env.DB.batch([
        env.DB.prepare("insert into journey_stage_library (id, name, description, status, current_version, document_json, created_at, updated_at) values (?, ?, ?, 'active', 1, ?, ?, ?)").bind(stageId, name, description, JSON.stringify(document), timestamp, timestamp),
        env.DB.prepare("insert into journey_stage_versions (stage_id, version, name, description, document_json, created_at) values (?, 1, ?, ?, ?, ?)").bind(stageId, name, description, JSON.stringify(document), timestamp),
      ]);
      return reply(expose((await stageById(env.DB, stageId))!), 201);
    }
    const current = id ? await stageById(env.DB, id) : null;
    if (!current) return fail("Etapa da biblioteca nao encontrada.", 404);
    if (request.method === "GET") return reply(expose(current));
    if (request.method === "DELETE") {
      const timestamp = new Date().toISOString();
      await env.DB.prepare("update journey_stage_library set status = 'archived', updated_at = ? where id = ?").bind(timestamp, id).run();
      return reply(expose((await stageById(env.DB, id))!));
    }
    if (request.method === "PUT") {
      const body = await request.json() as Record<string, unknown>;
      if (Number(body.expectedVersion) !== Number(current.current_version)) return fail("Esta etapa foi alterada em outra sessao. Atualize antes de salvar.", 409);
      const name = String(body.name ?? current.name).trim();
      const description = String(body.description ?? current.description ?? "").trim() || null;
      if (!name || name.length > 180) return fail("Informe um nome de ate 180 caracteres.");
      const document = stageDocument(body.document ?? current.document_json);
      const version = Number(current.current_version) + 1; const timestamp = new Date().toISOString();
      const next = { ...current, name, description };
      await env.DB.batch([
        env.DB.prepare("update journey_stage_library set name = ?, description = ?, current_version = ?, document_json = ?, updated_at = ? where id = ? and current_version = ?").bind(name, description, version, JSON.stringify(document), timestamp, id, current.current_version),
        env.DB.prepare("insert into journey_stage_versions (stage_id, version, name, description, document_json, created_at) values (?, ?, ?, ?, ?, ?)").bind(id, version, name, description, JSON.stringify(document), timestamp),
      ]);
      const updatedTemplates = await updateLinkedTemplates(env.DB, next, document, version, timestamp);
      return reply({ ...expose((await stageById(env.DB, id))!), updatedTemplates });
    }
    return fail("Metodo nao permitido.", 405);
  } catch (error) { return fail(error instanceof Error ? error.message : "Falha na biblioteca de etapas.", 500); }
}
