import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { handleJourneyDomainRequest } from "../../worker/journeyDomain";

function createDatabase() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    create table project_summaries (id text primary key, project_id text not null);
    create table project_summary_items (id text primary key, summary_id text not null, parent_id text, status text not null, sort_order integer, updated_at text);
    create table generated_prompts (id text primary key, project_id text not null, summary_id text, summary_item_id text, base_prompt_id text, base_prompt_snapshot text, selected_blocks_json text, final_prompt text, notes text, ai_tool_id text, created_by text, created_at text, status text default 'ativo', archived_at text);
    insert into project_summaries values ('summary-a', 'project-a');
    insert into project_summaries values ('summary-b', 'project-b');
    insert into project_summary_items values ('root', 'summary-a', null, 'pendente', 1, null);
    insert into project_summary_items values ('child', 'summary-a', 'root', 'pendente', 2, null);
    insert into project_summary_items values ('other', 'summary-b', null, 'concluido', 1, null);
  `);
  type Bound = { sql: string; values: unknown[]; run: () => unknown };
  const prepare = (sql: string, values: unknown[] = []): D1PreparedStatement => {
    const bound: Bound = { sql, values, run: () => sqlite.prepare(sql).run(...values as Parameters<ReturnType<Database["prepare"]>["run"]>) };
    return {
      bind: (...args: unknown[]) => prepare(sql, args),
      first: async () => sqlite.prepare(sql).get(...values as Parameters<ReturnType<Database["prepare"]>["get"]>),
      all: async () => ({ results: sqlite.prepare(sql).all(...values as Parameters<ReturnType<Database["prepare"]>["all"]>) }),
      run: async () => bound.run(),
      __bound: bound,
    } as unknown as D1PreparedStatement;
  };
  const db = {
    prepare,
    batch: async (statements: D1PreparedStatement[]) => sqlite.transaction(() => statements.map((statement) => (statement as unknown as { __bound: Bound }).__bound.run()))(),
  } as unknown as D1Database;
  return { sqlite, db };
}

async function save(db: D1Database, promptId = "prompt-a") {
  const request = new Request("https://example.test/api/summaries/summary-a/prompts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ promptId, itemIds: ["root"], finalPrompt: "Desenvolva o topico." }),
  });
  const response = await handleJourneyDomainRequest(request, { DB: db } as Parameters<typeof handleJourneyDomainRequest>[1], ["api", "summaries", "summary-a", "prompts"], new URL(request.url));
  return (await response?.json()) as { data: { summary: { id: string }; items: Array<{ id: string; status: string }>; prompts: Array<{ id: string }> } };
}

test("saving a summary prompt returns the prompt and started topics atomically", async () => {
  const { db, sqlite } = createDatabase();
  try {
    const result = await save(db);
    expect(result.data.summary.id).toBe("summary-a");
    expect(result.data.prompts.map((prompt) => prompt.id)).toEqual(["prompt-a"]);
    expect(result.data.items.map((item) => item.status)).toEqual(["em_andamento", "em_andamento"]);
    expect(sqlite.query("select status from project_summary_items where id = 'other'").get()).toEqual({ status: "concluido" });
  } finally { sqlite.close(); }
});

test("retrying the same prompt id does not duplicate history", async () => {
  const { db, sqlite } = createDatabase();
  try {
    await save(db);
    await save(db);
    expect(sqlite.query("select count(*) as total from generated_prompts").get()).toEqual({ total: 1 });
  } finally { sqlite.close(); }
});

test("returning to the tab reads just the opened summary", async () => {
  const { db, sqlite } = createDatabase();
  try {
    await save(db);
    const request = new Request("https://example.test/api/summaries/summary-a/state");
    const response = await handleJourneyDomainRequest(request, { DB: db } as Parameters<typeof handleJourneyDomainRequest>[1], ["api", "summaries", "summary-a", "state"], new URL(request.url));
    const result = await response?.json() as { data: { items: Array<{ id: string }>; prompts: Array<{ id: string }> } };
    expect(result.data.items.map((item) => item.id)).toEqual(["root", "child"]);
    expect(result.data.prompts.map((prompt) => prompt.id)).toEqual(["prompt-a"]);
  } finally { sqlite.close(); }
});

test("a topic update failure rolls back the prompt and all topic changes", async () => {
  const { db, sqlite } = createDatabase();
  sqlite.exec("create trigger fail_child before update on project_summary_items when new.id = 'child' begin select raise(abort, 'failed child'); end;");
  try {
    await expect(save(db)).rejects.toThrow("failed child");
    expect(sqlite.query("select count(*) as total from generated_prompts").get()).toEqual({ total: 0 });
    expect(sqlite.query("select status from project_summary_items where id = 'root'").get()).toEqual({ status: "pendente" });
  } finally { sqlite.close(); }
});
