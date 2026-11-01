import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { handleJourneyDomainRequest } from "../../worker/journeyDomain";

function createDatabase() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    create table journey_templates (id text primary key, name text, description text, status text, project_type_id text, project_modality_id text);
    create table project_types (id text primary key, name text);
    create table project_modalities (id text primary key, name text, project_type_id text);
    insert into journey_templates values ('template-a', 'Modelo', null, 'ativo', null, null);
    insert into project_types values ('ria', 'RIA');
  `);
  const prepare = (sql: string, values: unknown[] = []): D1PreparedStatement => ({
    bind: (...args: unknown[]) => prepare(sql, args),
    first: async () => sqlite.prepare(sql).get(...values as Parameters<ReturnType<Database["prepare"]>["get"]>),
    run: async () => sqlite.prepare(sql).run(...values as Parameters<ReturnType<Database["prepare"]>["run"]>),
  }) as unknown as D1PreparedStatement;
  return { sqlite, db: { prepare } as D1Database };
}

async function update(db: D1Database, projectTypeId: string | null) {
  const request = new Request("https://example.test/api/journey-templates/template-a", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project_type_id: projectTypeId }),
  });
  const response = await handleJourneyDomainRequest(request, { DB: db } as Parameters<typeof handleJourneyDomainRequest>[1], ["api", "journey-templates", "template-a"], new URL(request.url));
  return response?.json() as Promise<{ data: { project_type_id: string | null } }>;
}

test("template type changes persist without changing the template structure", async () => {
  const { sqlite, db } = createDatabase();
  try {
    expect((await update(db, "ria")).data.project_type_id).toBe("ria");
    expect(sqlite.query("select name, project_type_id from journey_templates where id = 'template-a'").get()).toEqual({ name: "Modelo", project_type_id: "ria" });
    expect((await update(db, null)).data.project_type_id).toBeNull();
  } finally { sqlite.close(); }
});

test("template type update rejects unknown ids and keeps the last valid classification", async () => {
  const { sqlite, db } = createDatabase();
  try {
    await update(db, "ria");
    expect(update(db, "missing")).rejects.toThrow("Tipo de projeto nao encontrado");
    expect(sqlite.query("select project_type_id from journey_templates where id = 'template-a'").get()).toEqual({ project_type_id: "ria" });
  } finally { sqlite.close(); }
});
