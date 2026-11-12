import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { handleStageLibraryRequest } from "../../../worker/stageLibrary";

function database() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    pragma foreign_keys = on;
    create table clients (id text primary key, name text);
    create table journey_templates (id text primary key, name text);
    create table journey_steps (id text primary key, journey_template_id text, name text, description text);
    create table journey_step_documents (id text primary key, owner_type text, owner_id text, step_id text, schema_version integer, version_number integer, revision integer, state text, title text, document_json text, created_at text, updated_at text, published_at text);
    create table journey_template_versions (id text primary key, template_id text, snapshot_json text, updated_at text);
    create table projects (id text primary key);
    create table project_steps (id text primary key, project_id text, name text, description text, updated_at text);
    create table project_stage_links (project_id text, project_step_id text, stage_id text, linked_version integer, auto_update integer, last_sync_status text, last_sync_error text, created_at text, updated_at text, primary key(project_id, project_step_id));
    create table journey_step_values (id text primary key, owner_type text, owner_step_id text, document_id text, block_id text, value_json text, completion_state text, updated_by text, created_at text, updated_at text);
    create table journey_step_events (id text primary key, owner_type text, owner_step_id text, document_id text, block_id text, event_type text, event_payload_json text, created_by text, created_at text);
    create table journey_library_events (id text primary key, source_kind text, source_id text, event_type text, event_payload_json text, created_by text, created_at text);
    create table journey_stage_library (id text primary key, name text, description text, status text, current_version integer, document_json text, created_at text, updated_at text);
    create table journey_stage_versions (stage_id text, version integer, name text, description text, document_json text, created_at text, primary key(stage_id, version));
    create table template_stage_links (template_id text, template_step_id text, stage_id text, linked_version integer, auto_update integer, created_at text, updated_at text, primary key(template_id, template_step_id));
    create table journey_template_client_scopes (template_id text primary key, client_id text, created_at text, updated_at text);
    create table journey_stage_client_scopes (stage_id text primary key, client_id text, created_at text, updated_at text);
  `);
  const oldDocument = { schemaVersion: 1, ownerType: "template", templateId: "t", stepId: "ts", structureId: "doc", title: "Antiga", status: "ativo", state: "published", versionNumber: 1, revision: 1, blocks: [{ id: "b", type: "checklist", order: 1, title: "Antigo", config: { items: [] } }], completionRules: [] };
  const projectDocument = { ...oldDocument, ownerType: "project", projectId: "p", stepId: "ps", structureId: "project-doc", state: "draft", source: { kind: "stage_library", id: "s", version: 1, mode: "linked" } };
  const snapshot = { schemaVersion: 1, templateId: "t", name: "Modelo", description: "", projectTypeId: null, clientId: null, workspaceGuidance: "", steps: [{ id: "ts", name: "Antiga", description: "", stepOrder: 1, document: oldDocument }] };
  sqlite.exec(`insert into journey_templates values ('t','Modelo'); insert into journey_steps values ('ts','t','Antiga',null); insert into projects values ('p'); insert into project_steps values ('ps','p','Antiga',null,null);`);
  sqlite.query("insert into journey_step_documents values (?,?,?,?,1,1,1,'published',?,?,?,?,?)").run("doc", "template", "t", "ts", "Antiga", JSON.stringify(oldDocument), "2026-01-01", "2026-01-01", "2026-01-01");
  sqlite.query("insert into journey_step_documents values (?,?,?,?,1,1,1,'draft',?,?,?,?,?)").run("project-doc", "project", "p", "ps", "Antiga", JSON.stringify(projectDocument), "2026-01-01", "2026-01-01", null);
  sqlite.query("insert into journey_template_versions values ('tv','t',?,'2026-01-01')").run(JSON.stringify(snapshot));
  sqlite.query("insert into journey_stage_library values ('s','Antiga',null,'active',1,?,'2026-01-01','2026-01-01')").run(JSON.stringify({ schemaVersion: 1, blocks: [], completionRules: [] }));
  sqlite.query("insert into journey_stage_versions values ('s',1,'Antiga',null,?,'2026-01-01')").run(JSON.stringify({ schemaVersion: 1, blocks: [], completionRules: [] }));
  sqlite.exec("insert into template_stage_links values ('t','ts','s',1,1,'2026-01-01','2026-01-01')");
  sqlite.exec("insert into project_stage_links values ('p','ps','s',1,1,'synced',null,'2026-01-01','2026-01-01')");
  sqlite.exec("insert into journey_step_values values ('value','project','ps','project-doc','b','{\"checked\":{\"item\":true}}','partial',null,'2026-01-01','2026-01-01')");
  const prepare = (sql: string, values: unknown[] = []): D1PreparedStatement => ({
    bind: (...args: unknown[]) => prepare(sql, args),
    first: async () => sqlite.query(sql).get(...values),
    all: async () => ({ results: sqlite.query(sql).all(...values) }),
    run: async () => ({ meta: { changes: sqlite.query(sql).run(...values).changes } }),
  }) as unknown as D1PreparedStatement;
  const db = { prepare, batch: async (statements: D1PreparedStatement[]) => {
    sqlite.exec("begin"); try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec("commit"); return results; } catch (error) { sqlite.exec("rollback"); throw error; }
  } } as unknown as D1Database;
  return { sqlite, db };
}

test("shared stage updates linked templates and projects while preserving runtime values", async () => {
  const { sqlite, db } = database();
  try {
    const document = { schemaVersion: 1, blocks: [{ id: "b", type: "checklist", order: 1, title: "Pre-requisitos", config: { items: [] } }, { id: "new", type: "long_text", order: 2, title: "Nova orientação", config: { content: "Nova regra" } }], completionRules: [] };
    const request = new Request("https://example.test/api/stage-library/s", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: 1, name: "Levantamento", description: "Nova descricao", document }) });
    const response = await handleStageLibraryRequest(request, { DB: db }, ["api", "stage-library", "s"]);
    expect(response?.status).toBe(200);
    expect(sqlite.query("select name from journey_steps where id = 'ts'").get()).toEqual({ name: "Levantamento" });
    expect(sqlite.query("select name from project_steps where id = 'ps'").get()).toEqual({ name: "Levantamento" });
    const project = JSON.parse((sqlite.query("select document_json from journey_step_documents where id = 'project-doc'").get() as { document_json: string }).document_json);
    expect(project.source).toMatchObject({ id: "s", version: 2, mode: "linked" });
    expect(project.blocks[0]).toMatchObject({ id: "b", title: "Pre-requisitos", type: "checklist" });
    expect(project.blocks[1]).toMatchObject({ id: "new", title: "Nova orientação" });
    expect(sqlite.query("select value_json from journey_step_values where id = 'value'").get()).toEqual({ value_json: '{"checked":{"item":true}}' });
    expect(sqlite.query("select last_sync_status from project_stage_links where project_step_id = 'ps'").get()).toEqual({ last_sync_status: "synced" });
    const saved = JSON.parse((sqlite.query("select snapshot_json from journey_template_versions where id = 'tv'").get() as { snapshot_json: string }).snapshot_json);
    expect(saved.steps[0]).toMatchObject({ name: "Levantamento", sourceStageId: "s", sourceStageVersion: 2 });
    expect(saved.steps[0].document.blocks[0]).toMatchObject({ title: "Pre-requisitos", type: "checklist" });
  } finally { sqlite.close(); }
});

test("removed canonical blocks remain as hidden legacy blocks instead of losing execution data", async () => {
  const { sqlite, db } = database();
  try {
    const document = { schemaVersion: 1, blocks: [{ id: "new", type: "long_text", order: 1, title: "Nova orientação", config: { content: "Nova regra" } }], completionRules: [] };
    const response = await handleStageLibraryRequest(new Request("https://example.test/api/stage-library/s", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: 1, name: "Levantamento", description: null, document }) }), { DB: db }, ["api", "stage-library", "s"]);
    expect(response?.status).toBe(200);
    const project = JSON.parse((sqlite.query("select document_json from journey_step_documents where id = 'project-doc'").get() as { document_json: string }).document_json);
    expect(project.blocks).toEqual(expect.arrayContaining([expect.objectContaining({ id: "b", visible: false, required: false, config: expect.objectContaining({ sourceStageOrphaned: true }) })]));
    expect(sqlite.query("select value_json from journey_step_values where id = 'value'").get()).toEqual({ value_json: '{"checked":{"item":true}}' });
  } finally { sqlite.close(); }
});

test("stage catalog exposes template origin and keeps client stages scoped", async () => {
  const { sqlite, db } = database();
  try {
    sqlite.exec("insert into clients values ('c','ADVANCE'); insert into journey_template_client_scopes values ('t','c','2026-01-01','2026-01-01'); insert into journey_stage_client_scopes values ('s','c','2026-01-01','2026-01-01')");
    const clientResponse = await handleStageLibraryRequest(new Request("https://example.test/api/stage-library?scope=client"), { DB: db }, ["api", "stage-library"]);
    expect(clientResponse?.status).toBe(200);
    const clientBody = await clientResponse?.json() as { data: Array<Record<string, unknown>> };
    expect(clientBody.data).toHaveLength(1);
    expect(clientBody.data[0]).toMatchObject({ clientId: "c", clientName: "ADVANCE", usageCount: 1 });
    expect(clientBody.data[0].templateUses).toEqual([{ templateId: "t", templateName: "Modelo", templateStepId: "ts", clientId: "c", clientName: "ADVANCE" }]);

    const globalResponse = await handleStageLibraryRequest(new Request("https://example.test/api/stage-library?scope=global"), { DB: db }, ["api", "stage-library"]);
    const globalBody = await globalResponse?.json() as { data: unknown[] };
    expect(globalBody.data).toHaveLength(0);
  } finally { sqlite.close(); }
});
