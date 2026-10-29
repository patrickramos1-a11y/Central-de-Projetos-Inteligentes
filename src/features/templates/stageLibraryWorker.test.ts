import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { handleStageLibraryRequest } from "../../../worker/stageLibrary";

function database() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    pragma foreign_keys = on;
    create table journey_templates (id text primary key);
    create table journey_steps (id text primary key, journey_template_id text, name text, description text);
    create table journey_step_documents (id text primary key, owner_type text, owner_id text, step_id text, schema_version integer, version_number integer, revision integer, state text, title text, document_json text, created_at text, updated_at text, published_at text);
    create table journey_template_versions (id text primary key, template_id text, snapshot_json text, updated_at text);
    create table projects (id text primary key);
    create table project_steps (id text primary key, project_id text, name text);
    create table journey_stage_library (id text primary key, name text, description text, status text, current_version integer, document_json text, created_at text, updated_at text);
    create table journey_stage_versions (stage_id text, version integer, name text, description text, document_json text, created_at text, primary key(stage_id, version));
    create table template_stage_links (template_id text, template_step_id text, stage_id text, linked_version integer, auto_update integer, created_at text, updated_at text, primary key(template_id, template_step_id));
  `);
  const oldDocument = { schemaVersion: 1, ownerType: "template", templateId: "t", stepId: "ts", structureId: "doc", title: "Antiga", status: "ativo", state: "published", versionNumber: 1, revision: 1, blocks: [], completionRules: [] };
  const snapshot = { schemaVersion: 1, templateId: "t", name: "Modelo", description: "", projectTypeId: null, clientId: null, workspaceGuidance: "", steps: [{ id: "ts", name: "Antiga", description: "", stepOrder: 1, document: oldDocument }] };
  sqlite.exec(`insert into journey_templates values ('t'); insert into journey_steps values ('ts','t','Antiga',null); insert into projects values ('p'); insert into project_steps values ('ps','p','Antiga');`);
  sqlite.query("insert into journey_step_documents values (?,?,?,?,1,1,1,'published',?,?,?,?,?)").run("doc", "template", "t", "ts", "Antiga", JSON.stringify(oldDocument), "2026-01-01", "2026-01-01", "2026-01-01");
  sqlite.query("insert into journey_template_versions values ('tv','t',?,'2026-01-01')").run(JSON.stringify(snapshot));
  sqlite.query("insert into journey_stage_library values ('s','Antiga',null,'active',1,?,'2026-01-01','2026-01-01')").run(JSON.stringify({ schemaVersion: 1, blocks: [], completionRules: [] }));
  sqlite.query("insert into journey_stage_versions values ('s',1,'Antiga',null,?,'2026-01-01')").run(JSON.stringify({ schemaVersion: 1, blocks: [], completionRules: [] }));
  sqlite.exec("insert into template_stage_links values ('t','ts','s',1,1,'2026-01-01','2026-01-01')");
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

test("shared stage updates linked templates while preserving existing projects", async () => {
  const { sqlite, db } = database();
  try {
    const document = { schemaVersion: 1, blocks: [{ id: "b", type: "checklist", order: 1, title: "Pre-requisitos", config: { items: [] } }], completionRules: [] };
    const request = new Request("https://example.test/api/stage-library/s", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: 1, name: "Levantamento", description: "Nova descricao", document }) });
    const response = await handleStageLibraryRequest(request, { DB: db }, ["api", "stage-library", "s"]);
    expect(response?.status).toBe(200);
    expect(sqlite.query("select name from journey_steps where id = 'ts'").get()).toEqual({ name: "Levantamento" });
    expect(sqlite.query("select name from project_steps where id = 'ps'").get()).toEqual({ name: "Antiga" });
    const saved = JSON.parse((sqlite.query("select snapshot_json from journey_template_versions where id = 'tv'").get() as { snapshot_json: string }).snapshot_json);
    expect(saved.steps[0]).toMatchObject({ name: "Levantamento", sourceStageId: "s", sourceStageVersion: 2 });
    expect(saved.steps[0].document.blocks[0]).toMatchObject({ title: "Pre-requisitos", type: "checklist" });
  } finally { sqlite.close(); }
});
