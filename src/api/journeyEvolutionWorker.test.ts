import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { handleJourneyDomainRequest } from "../../worker/journeyDomain";
import { duplicateProjectTemplate, getTemplateEditor, publishTemplateDraft, removeTemplateDraftFile, saveTemplateDraft, stageProjectModelFiles, uploadTemplateDraftFile } from "../../worker/templateEditor";
import { duplicateTemplateSnapshot, sanitizeModelConfig } from "../features/templates/templateModel";

function fixture() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    create table clients (id text primary key, name text);
    create table project_types (id text primary key, name text);
    create table journey_templates (id text primary key, name text, description text, project_type_id text, context text, status text, created_at text);
    create table template_workspace_guidance (template_id text primary key, guidance text, updated_at text);
    create table journey_steps (id text primary key, journey_template_id text references journey_templates(id), name text, description text, step_order integer, objective text, execution_instructions text, expected_output text, checklist text, status text, created_at text);
    create table step_prompts (id text primary key, journey_step_id text references journey_steps(id), prompt_id text, title text, content text, ai_tool_id text, prompt_status text, is_required integer, prompt_order integer, usage_notes text, created_at text);
    create table projects (id text primary key, name text, client_id text references clients(id), created_at text);
    create table project_steps (id text primary key, project_id text references projects(id), source_journey_step_id text, name text, status text, is_not_applicable integer default 0, updated_at text);
    create table project_step_contexts (id text primary key, project_step_id text, title text, content text);
    create table journey_step_documents (id text primary key, owner_type text, owner_id text, step_id text, schema_version integer, version_number integer, revision integer, state text, title text, document_json text, created_at text, updated_at text, published_at text, unique(owner_type, step_id, state));
    create table journey_step_values (id text primary key, owner_type text, owner_step_id text, document_id text references journey_step_documents(id), block_id text, value_json text, completion_state text, updated_by text, created_at text, updated_at text, unique(owner_type,owner_step_id,block_id));
    create table journey_step_files (id text primary key, owner_type text, owner_step_id text, document_id text references journey_step_documents(id), block_id text, item_id text, r2_key text, name text, content_type text, size_bytes integer, description text, created_by text, created_at text);
    create table journey_step_events (id text primary key, owner_type text, owner_step_id text, document_id text, block_id text, event_type text, event_payload_json text, created_by text, created_at text);
    insert into clients values ('client-a','Cliente A');
    insert into journey_templates values ('template-a','Modelo',null,null,'projeto','ativo','2026-01-01');
    insert into journey_steps values ('template-step','template-a','Inicio',null,1,null,null,null,'','ativo','2026-01-01');
    insert into projects values ('project-a','Projeto A','client-a','2026-01-01');
    insert into project_steps (id,project_id,source_journey_step_id,name,status,updated_at) values ('project-step','project-a','template-step','Inicio','pendente','2026-01-01');
  `);
  const migration = readFileSync(new URL("../../cloudflare/migrations/0019_template_versions_client_contexts.sql", import.meta.url), "utf8");
  sqlite.exec(migration);
  sqlite.exec(migration);
  const templateDocument = { schemaVersion: 1, ownerType: "template", templateId: "template-a", stepId: "template-step", structureId: "template-document", title: "Inicio", status: "ativo", state: "published", versionNumber: 1, revision: 1, blocks: [{ id: "prompt-block", type: "prompt", order: 1, title: "Prompt", required: false, config: { contentSnapshot: "modelo" } }], completionRules: [] };
  const projectDocument = { ...templateDocument, ownerType: "project", projectId: "project-a", templateId: undefined, stepId: "project-step", structureId: "project-document", state: "draft", blocks: [{ id: "context-block", type: "context", order: 1, title: "Contexto", required: false, config: { contexts: [] } }] };
  sqlite.prepare("insert into journey_step_documents (id,owner_type,owner_id,step_id,schema_version,version_number,revision,state,title,document_json,created_at) values (?,?,?,?,1,1,1,?,?,?,?)")
    .run("template-document", "template", "template-a", "template-step", "published", "Inicio", JSON.stringify(templateDocument), "2026-01-01");
  sqlite.prepare("insert into journey_step_documents (id,owner_type,owner_id,step_id,schema_version,version_number,revision,state,title,document_json,created_at) values (?,?,?,?,1,1,1,?,?,?,?)")
    .run("project-document", "project", "project-a", "project-step", "draft", "Inicio", JSON.stringify(projectDocument), "2026-01-01");

  const prepare = (sql: string, values: unknown[] = []): D1PreparedStatement => ({
    bind: (...args: unknown[]) => prepare(sql, args),
    first: async () => sqlite.prepare(sql).get(...values as never[]),
    all: async () => ({ results: sqlite.prepare(sql).all(...values as never[]) }),
    run: async () => { const result = sqlite.prepare(sql).run(...values as never[]); return { meta: { changes: result.changes } }; },
  }) as unknown as D1PreparedStatement;
  const db = { prepare, batch: async (statements: D1PreparedStatement[]) => {
    sqlite.exec("BEGIN");
    try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec("COMMIT"); return results; }
    catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  } } as unknown as D1Database;
  return { sqlite, db };
}

async function request(db: D1Database, path: string, method = "GET", body?: unknown) {
  const url = new URL(`https://example.test/api${path}`);
  const response = await handleJourneyDomainRequest(new Request(url, { method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) }), { DB: db } as Parameters<typeof handleJourneyDomainRequest>[1], url.pathname.split("/").filter(Boolean), url);
  if (!response) throw new Error("Route not handled");
  const result = await response.json() as { data: { data?: unknown } | unknown; error?: string };
  if (!response.ok) throw new Error(result.error ?? "Request failed");
  return result.data && typeof result.data === "object" && "data" in result.data ? result.data.data : result.data;
}

test("template draft is isolated until publish and duplicate drops execution links", async () => {
  const { sqlite, db } = fixture();
  try {
    const editor = await request(db, "/journey-templates/template-a/editor") as { snapshot: { steps: Array<{ name: string; document: { blocks: Array<{ title: string }> } }> }; draftRevision: null };
    editor.snapshot.steps[0].name = "Novo nome";
    editor.snapshot.steps[0].document.blocks[0].title = "Prompt novo";
    const saved = await request(db, "/journey-templates/template-a/editor", "PUT", { snapshot: editor.snapshot, expectedRevision: null }) as { draftRevision: number };
    expect(saved.draftRevision).toBe(1);
    expect(sqlite.query("select name from journey_steps where id = 'template-step'").get()).toEqual({ name: "Inicio" });
    expect(sqlite.query("select name from project_steps where id = 'project-step'").get()).toEqual({ name: "Inicio" });
    await request(db, "/journey-templates/template-a/publish", "POST", { expectedRevision: 1 });
    expect(sqlite.query("select name from journey_steps where id = 'template-step'").get()).toEqual({ name: "Novo nome" });
    expect(sqlite.query("select name from project_steps where id = 'project-step'").get()).toEqual({ name: "Inicio" });
    expect(sqlite.query("select count(*) as total from journey_template_versions where template_id = 'template-a' and state = 'published'").get()).toEqual({ total: 2 });
    const duplicate = await request(db, "/journey-templates/template-a/duplicate", "POST") as { id: string };
    expect(duplicate.id).not.toBe("template-a");
    expect(sqlite.query("select status from journey_templates where id = ?").get(duplicate.id)).toEqual({ status: "inativo" });
    const model = duplicateTemplateSnapshot({ schemaVersion: 1, templateId: "a", name: "A", description: "", projectTypeId: null, clientId: null, workspaceGuidance: "", steps: [{ id: "s", name: "S", description: "", stepOrder: 1, document: { schemaVersion: 1, ownerType: "template", templateId: "a", stepId: "s", structureId: "d", title: "S", status: "ativo", state: "published", versionNumber: 1, revision: 1, completionRules: [], blocks: [{ id: "b", type: "materials", order: 1, title: "Links", config: { links: [{ title: "Conversa privada", url: "https://chatgpt.com/share/abc" }, { title: "Pasta do projeto", url: "https://drive.google.com/drive/u/0/folders/private" }, { title: "Projeto ChatGPT", url: "https://chatgpt.com/g/g-p-abc/project" }, { title: "Modelo", url: "https://example.test/modelo" }] } }] } }] }, "b");
    expect(((model.steps[0].document.blocks[0].config.links) as Array<{ title: string }>).map((link) => link.title)).toEqual(["Modelo"]);
    expect((model.steps[0].document.blocks[0].config.links as unknown[]).length).toBe(1);
    expect(sanitizeModelConfig("file_upload", { fileMode: "resource_pack", files: [{ name: "private.pdf" }], evidenceFiles: ["private"], minFiles: 1 })).toEqual({ fileMode: "resource_pack", minFiles: 1 });
  } finally { sqlite.close(); }
});

test("new project context is saved with library origin atomically; later edits stay local", async () => {
  const { sqlite, db } = fixture();
  try {
    const value = { contexts: [{ id: "card-a", title: "Dados do local", content: "Versao 1", color: "blue" }] };
    await request(db, "/journey-steps/project/project-step/block-values/context-block", "PATCH", { value });
    const library = await request(db, "/clients/client-a/contexts") as Array<{ id: string; version: number; title: string }>;
    expect(library.length).toBe(1);
    const stored = JSON.parse(String((sqlite.query("select value_json from journey_step_values where owner_step_id = 'project-step'").get() as { value_json: string }).value_json));
    expect(stored.contexts[0].sourceContextId).toBe(library[0].id);
    expect(stored.contexts[0].sourceVersion).toBe(1);
    stored.contexts[0].content = "Editado apenas aqui";
    await request(db, "/journey-steps/project/project-step/block-values/context-block", "PATCH", { value: stored });
    expect(sqlite.query("select content from client_contexts where id = ?").get(library[0].id)).toEqual({ content: "Versao 1" });
    await request(db, `/clients/client-a/contexts/${library[0].id}`, "PATCH", { content: "Versao 2", expectedVersion: 1 });
    const old = JSON.parse(String((sqlite.query("select value_json from journey_step_values where owner_step_id = 'project-step'").get() as { value_json: string }).value_json));
    expect(old.contexts[0].content).toBe("Editado apenas aqui");
    expect(old.contexts[0].sourceVersion).toBe(1);
    await request(db, "/journey-steps/project/project-step/contexts/refresh", "POST", { blockId: "context-block", contextId: "card-a" });
    const refreshed = JSON.parse(String((sqlite.query("select value_json from journey_step_values where owner_step_id = 'project-step'").get() as { value_json: string }).value_json));
    expect(refreshed.contexts[0].content).toBe("Versao 2");
    await request(db, `/clients/client-a/contexts/${library[0].id}`, "PATCH", { status: "archived", expectedVersion: 2 });
    expect(request(db, "/journey-steps/project/project-step/contexts/import", "POST", { blockId: "context-block", contextIds: [library[0].id] })).rejects.toThrow("arquivado");
  } finally { sqlite.close(); }
});

test("partial library failure rolls back the project context and preserves previous value", async () => {
  const { sqlite, db } = fixture();
  try {
    sqlite.exec("drop table client_context_versions");
    expect(request(db, "/journey-steps/project/project-step/block-values/context-block", "PATCH", { value: { contexts: [{ id: "card-a", title: "A", content: "Texto" }] } })).rejects.toThrow();
    expect(sqlite.query("select count(*) as total from client_contexts").get()).toEqual({ total: 0 });
    expect(sqlite.query("select count(*) as total from journey_step_values").get()).toEqual({ total: 0 });
  } finally { sqlite.close(); }
});

test("unlinked contexts remain local, then can be reviewed and associated without title merging", async () => {
  const { sqlite, db } = fixture();
  try {
    sqlite.exec("update projects set client_id = null where id = 'project-a'");
    await request(db, "/journey-steps/project/project-step/block-values/context-block", "PATCH", { value: { contexts: [{ id: "old", title: "Mesmo titulo", content: "Texto A" }] } });
    expect(sqlite.query("select count(*) as total from client_contexts").get()).toEqual({ total: 0 });
    sqlite.exec("update projects set client_id = 'client-a' where id = 'project-a'");
    const report = await request(db, "/clients/client-a/contexts/reconciliation") as { candidates: Array<{ contextId: string }> };
    expect(report.candidates.map((candidate) => candidate.contextId)).toEqual(["old"]);
    await request(db, "/journey-steps/project/project-step/contexts/associate", "POST", { blockId: "context-block", contextIds: ["old"] });
    expect(sqlite.query("select count(*) as total from client_contexts").get()).toEqual({ total: 1 });
    const after = await request(db, "/clients/client-a/contexts/reconciliation") as { candidates: unknown[] };
    expect(after.candidates).toHaveLength(0);
  } finally { sqlite.close(); }
});

test("empty template can be edited and published; stale draft revisions are rejected", async () => {
  const { sqlite, db } = fixture();
  try {
    const created = await request(db, "/journey-templates", "POST", { name: "Vazio" }) as { id: string };
    const editor = await request(db, `/journey-templates/${created.id}/editor`) as { snapshot: { steps: unknown[]; workspaceGuidance: string }; draftRevision: null };
    expect(editor.snapshot.steps).toHaveLength(0);
    const stepId = crypto.randomUUID();
    editor.snapshot.workspaceGuidance = "Cadastre a pasta do servidor na jornada.";
    editor.snapshot.steps.push({ id: stepId, name: "Etapa inicial", description: "", stepOrder: 1, document: { schemaVersion: 1, ownerType: "template", templateId: created.id, stepId, structureId: crypto.randomUUID(), title: "Etapa inicial", status: "ativo", state: "draft", versionNumber: 1, revision: 1, blocks: [{ id: crypto.randomUUID(), type: "materials", order: 1, title: "Modelos", config: { links: [{ id: crypto.randomUUID(), title: "Modelo", url: "https://example.test/modelo" }] } }], completionRules: [] } });
    await request(db, `/journey-templates/${created.id}/editor`, "PUT", { snapshot: editor.snapshot, expectedRevision: null });
    expect(request(db, `/journey-templates/${created.id}/editor`, "PUT", { snapshot: editor.snapshot, expectedRevision: null })).rejects.toThrow("outra sessao");
    await request(db, `/journey-templates/${created.id}/publish`, "POST", { expectedRevision: 1 });
    expect(sqlite.query("select status from journey_templates where id = ?").get(created.id)).toEqual({ status: "ativo" });
    expect(sqlite.query("select guidance from template_workspace_guidance where template_id = ?").get(created.id)).toEqual({ guidance: "Cadastre a pasta do servidor na jornada." });
  } finally { sqlite.close(); }
});

test("publish rolls back when the draft changes before the transaction", async () => {
  const { sqlite, db } = fixture();
  try {
    const editor = await getTemplateEditor(db, "template-a");
    editor.snapshot.steps[0].name = "Nao publicar";
    await saveTemplateDraft(db, "template-a", editor.snapshot, null);
    const racingDb = {
      ...db,
      batch: async (statements: D1PreparedStatement[]) => {
        sqlite.query("update journey_template_versions set revision = revision + 1 where template_id = 'template-a' and state = 'draft'").run();
        return db.batch(statements);
      },
    } as D1Database;
    await expect(publishTemplateDraft(racingDb, "template-a", 1)).rejects.toThrow();
    expect(sqlite.query("select name from journey_steps where id = 'template-step'").get()).toEqual({ name: "Inicio" });
    expect(sqlite.query("select count(*) as total from template_publish_guards").get()).toEqual({ total: 0 });
  } finally { sqlite.close(); }
});

test("multiple client contexts import as independent snapshots and remain after archival", async () => {
  const { sqlite, db } = fixture();
  try {
    const a = await request(db, "/clients/client-a/contexts", "POST", { title: "A", content: "Texto A", category: "Tecnico" }) as { id: string };
    const b = await request(db, "/clients/client-a/contexts", "POST", { title: "B", content: "Texto B" }) as { id: string };
    await request(db, "/journey-steps/project/project-step/contexts/import", "POST", { blockId: "context-block", contextIds: [a.id, b.id] });
    const value = JSON.parse(String((sqlite.query("select value_json from journey_step_values where owner_step_id = 'project-step'").get() as { value_json: string }).value_json));
    expect(value.contexts).toHaveLength(2);
    expect(value.contexts.map((item: { sourceContextId: string }) => item.sourceContextId)).toEqual([a.id, b.id]);
    await request(db, `/clients/client-a/contexts/${a.id}`, "PATCH", { status: "archived", expectedVersion: 1 });
    const after = JSON.parse(String((sqlite.query("select value_json from journey_step_values where owner_step_id = 'project-step'").get() as { value_json: string }).value_json));
    expect(after.contexts[0].content).toBe("Texto A");
    const listed = await request(db, "/clients/client-a/contexts") as unknown[];
    expect(listed).toHaveLength(1);
  } finally { sqlite.close(); }
});

test("a rapid client change rejects another client's or stale library snapshot", async () => {
  const { sqlite, db } = fixture();
  try {
    const source = await request(db, "/clients/client-a/contexts", "POST", { title: "Origem", content: "Versao A" }) as { id: string };
    sqlite.exec("insert into clients values ('client-b','Cliente B')");
    sqlite.exec("update projects set client_id = 'client-b' where id = 'project-a'");
    const card = { id: "imported", title: "Origem", content: "Versao A", sourceContextId: source.id, sourceVersion: 1 };
    expect(request(db, "/journey-steps/project/project-step/block-values/context-block", "PATCH", { value: { contexts: [card] } })).rejects.toThrow("outro cliente");
    sqlite.exec("update projects set client_id = 'client-a' where id = 'project-a'");
    await request(db, `/clients/client-a/contexts/${source.id}`, "PATCH", { content: "Versao B", expectedVersion: 1 });
    expect(request(db, "/journey-steps/project/project-step/block-values/context-block", "PATCH", { value: { contexts: [card] } })).rejects.toThrow("desatualizado");
    expect(sqlite.query("select count(*) as total from journey_step_values").get()).toEqual({ total: 0 });
  } finally { sqlite.close(); }
});

test("template model files stay in draft until publish and keep version history", async () => {
  const { sqlite, db } = fixture();
  try {
    const row = sqlite.query("select document_json from journey_step_documents where id = 'template-document'").get() as { document_json: string };
    const document = JSON.parse(row.document_json);
    document.blocks.push({ id: "model-files", type: "file_upload", order: 2, title: "Modelos", required: false, config: { fileMode: "resource_pack" } });
    sqlite.prepare("update journey_step_documents set document_json = ? where id = 'template-document'").run(JSON.stringify(document));
    sqlite.prepare("insert into journey_step_files (id, owner_type, owner_step_id, document_id, block_id, r2_key, name, content_type, size_bytes, created_at) values ('old-file','template','template-step','template-document','model-files','old-key','modelo.pdf','application/pdf',3,'2026-01-01')").run();
    const objects = new Map<string, Uint8Array>([["old-key", new Uint8Array([1, 2, 3])]]);
    const files = {
      get: async (key: string) => objects.has(key) ? { body: new Blob([objects.get(key)!]).stream() } : null,
      put: async (key: string, body: ReadableStream<Uint8Array>) => { objects.set(key, new Uint8Array(await new Response(body).arrayBuffer())); },
      delete: async (key: string) => { objects.delete(key); },
    } as unknown as R2Bucket;
    const editor = await getTemplateEditor(db, "template-a");
    expect(editor.files.map((file) => file.name)).toEqual(["modelo.pdf"]);
    await saveTemplateDraft(db, "template-a", editor.snapshot, null);
    const staged = await getTemplateEditor(db, "template-a");
    expect(staged.files).toHaveLength(1);
    await uploadTemplateDraftFile(db, files, "template-a", "template-step", "model-files", new File(["new"], "novo.txt", { type: "text/plain" }));
    const uploaded = await getTemplateEditor(db, "template-a");
    expect(uploaded.files).toHaveLength(2);
    await removeTemplateDraftFile(db, files, "template-a", staged.files[0].id);
    expect(sqlite.query("select count(*) as total from journey_step_files where owner_type = 'template'").get()).toEqual({ total: 1 });
    await publishTemplateDraft(db, "template-a", 1);
    expect(sqlite.query("select name from journey_step_files where owner_type = 'template'").get()).toEqual({ name: "novo.txt" });
    expect(sqlite.query("select count(*) as total from template_version_files").get()).toEqual({ total: 2 });
    expect(objects.has("old-key")).toBe(true);
  } finally { sqlite.close(); }
});

test("duplicating a template copies only model files into an independent draft", async () => {
  const { sqlite, db } = fixture();
  try {
    const row = sqlite.query("select document_json from journey_step_documents where id = 'template-document'").get() as { document_json: string };
    const document = JSON.parse(row.document_json);
    document.blocks.push({ id: "model-files", type: "file_upload", order: 2, title: "Modelos", required: false, config: { fileMode: "resource_pack" } });
    sqlite.prepare("update journey_step_documents set document_json = ? where id = 'template-document'").run(JSON.stringify(document));
    sqlite.prepare("insert into journey_step_files (id, owner_type, owner_step_id, document_id, block_id, r2_key, name, content_type, size_bytes, created_at) values ('old-file','template','template-step','template-document','model-files','old-key','modelo.pdf','application/pdf',3,'2026-01-01')").run();
    const objects = new Map<string, Uint8Array>([["old-key", new Uint8Array([1, 2, 3])]]);
    const files = {
      get: async (key: string) => objects.has(key) ? { body: new Blob([objects.get(key)!]).stream() } : null,
      put: async (key: string, body: ReadableStream<Uint8Array>) => { objects.set(key, new Uint8Array(await new Response(body).arrayBuffer())); },
      delete: async (key: string) => { objects.delete(key); },
    } as unknown as R2Bucket;
    const duplicate = await duplicateProjectTemplate(db, files, "template-a");
    const staged = await getTemplateEditor(db, duplicate.id);
    expect(staged.files).toHaveLength(1);
    expect(staged.files[0].r2_key).not.toBe("old-key");
    expect(objects.get(staged.files[0].r2_key)).toEqual(objects.get("old-key"));
    await publishTemplateDraft(db, duplicate.id, 1);
    expect(sqlite.query("select count(*) as total from journey_step_files where owner_type = 'template'").get()).toEqual({ total: 2 });
    expect(sqlite.query("select count(*) as total from template_version_files where version_id in (select id from journey_template_versions where template_id = ?)").get(duplicate.id)).toEqual({ total: 1 });
  } finally { sqlite.close(); }
});

test("updating a template from a project stages model resources without changing the published files", async () => {
  const { sqlite, db } = fixture();
  try {
    const objects = new Map<string, Uint8Array>([["project-key", new Uint8Array([4, 5])]]);
    const files = {
      get: async (key: string) => objects.has(key) ? { body: new Blob([objects.get(key)!]).stream() } : null,
      put: async (key: string, body: ReadableStream<Uint8Array>) => { objects.set(key, new Uint8Array(await new Response(body).arrayBuffer())); },
      delete: async (key: string) => { objects.delete(key); },
    } as unknown as R2Bucket;
    sqlite.prepare("insert into journey_step_files (id, owner_type, owner_step_id, document_id, block_id, r2_key, name, content_type, size_bytes, created_at) values ('project-file','project','project-step','project-document','model-files','project-key','projeto.pdf','application/pdf',2,'2026-01-01')").run();
    const editor = await getTemplateEditor(db, "template-a");
    editor.snapshot.steps[0].document.blocks.push({ id: "model-files", type: "file_upload", order: 2, title: "Arquivos", config: { fileMode: "resource_pack" } });
    await saveTemplateDraft(db, "template-a", editor.snapshot, null);
    await stageProjectModelFiles(db, files, "template-a", [{ projectStepId: "project-step", templateStepId: "template-step", blockIds: ["model-files"] }]);
    const staged = await getTemplateEditor(db, "template-a");
    expect(staged.files.map((file) => file.name)).toEqual(["projeto.pdf"]);
    expect(staged.files[0].r2_key).not.toBe("project-key");
    expect(sqlite.query("select count(*) as total from journey_step_files where owner_type='template'").get()).toEqual({ total: 0 });
  } finally { sqlite.close(); }
});
