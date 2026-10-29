import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { handleProjectWorkspaceRequest, readWorkspaceOverview } from "../../../worker/projectWorkspace";
import { classifyJourneyLink, mergeWorkspaceReferences, normalizeManualReference, readLinkedWorkspaceReferences } from "../../../worker/workspaceLinks";
import type { WorkspaceReference } from "./workspaceModel";

function database() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    create table project_workspaces (project_id text, conversation_not_applicable integer, revision integer, updated_at text);
    create table projects (id text, journey_template_id text);
    create table template_workspace_guidance (template_id text, guidance text);
    create table project_workspace_references (id text, project_id text, kind text, title text, target text, notes text, sort_order integer, created_at text, updated_at text);
    create table project_workspace_checklist_items (id text, project_id text, label text, is_done integer, item_order integer, created_at text, updated_at text);
    create table project_workspace_contexts (id text, project_id text, title text, content text, category text, source_client_context_id text, source_version integer, context_order integer, created_at text, updated_at text);
    create table project_steps (id text, project_id text, name text);
    create table project_step_links (id text, project_step_id text, title text, url text, link_order integer, created_at text);
    create table journey_step_documents (id text, owner_type text, owner_id text, step_id text, state text, document_json text, created_at text, updated_at text);
    create table journey_step_values (id text, owner_type text, document_id text, block_id text, value_json text, created_at text, updated_at text);
  `);
  const d1 = {
    prepare(sql: string) {
      let values: unknown[] = [];
      const query = {
        bind(...next: unknown[]) { values = next; return query; },
        async all() { return { results: sqlite.query(sql).all(...values) }; },
        async first() { return sqlite.query(sql).get(...values); },
        async run() { return { meta: { changes: sqlite.query(sql).run(...values).changes } }; },
      };
      return query;
    },
    async batch(statements: Array<{ run: () => Promise<unknown> }>) {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  } as unknown as D1Database;
  return { sqlite, d1 };
}

describe("linked workspace references", () => {
  test("uses the destination instead of a misleading title to classify journey links", () => {
    expect(classifyJourneyLink("CHAT DA CONVERSA", "https://chatgpt.com/c/abc")).toBe("conversation");
    expect(classifyJourneyLink("PCA - RCA", "https://chatgpt.com/g/g-p-project/c/chat-id")).toBe("conversation");
    expect(classifyJourneyLink("Pasta de Trabalho", "https://chatgpt.com/g/g-p-project/project")).toBe("support");
    expect(classifyJourneyLink("Pasta do projeto", "https://drive.google.com/drive/u/0/folders/abc")).toBe("support");
    expect(classifyJourneyLink("Projeto", "\\\\luz-engenharia\\projetos\\PCA")).toBe("directory");
    expect(classifyJourneyLink("Notebook do projeto", "https://notebooklm.google.com/notebook/abc")).toBe("support");
    expect(classifyJourneyLink("Relatorio", "https://example.com/report.pdf")).toBe("support");
  });

  test("reads current journey links, follows updates and removes deleted links from the overview", async () => {
    const { sqlite, d1 } = database();
    sqlite.exec(`insert into projects values ('p', null);
      insert into project_workspaces (project_id, conversation_not_applicable, revision) values ('p', 0, 0);
      insert into project_steps values ('step', 'p', 'INICIAR PROJETOS');
      insert into journey_step_documents values ('doc', 'project', 'p', 'step', 'draft',
        '{"blocks":[{"id":"block","type":"materials","title":"Links e materiais","config":{"links":[{"id":"folder","title":"Pasta de Trabalho","url":"https://chatgpt.com/g/g-p-template/project"}]}}]}', '2026-01-01', '2026-01-01');
      insert into journey_step_values values ('value', 'project', 'doc', 'block',
        '{"links":[{"id":"chat","title":"Conversa do projeto","url":"https://chatgpt.com/c/chat"}]}', '2026-01-01', '2026-01-01');`);
    let overview = (await readWorkspaceOverview(d1))[0];
    expect(overview).toMatchObject({ directoryCount: 0, conversationCount: 1, supportCount: 0, status: "parcial" });
    let linked = await readLinkedWorkspaceReferences(d1, "p");
    expect(linked).toHaveLength(1);
    expect(linked.some((ref) => ref.title === "Pasta de Trabalho")).toBe(false);
    expect(linked.find((ref) => ref.kind === "conversation")?.origin?.stepName).toBe("INICIAR PROJETOS");

    sqlite.query("update journey_step_values set value_json = ? where id = 'value'").run(JSON.stringify({ links: [
      { id: "chat", title: "Conversa atualizada", url: "https://chatgpt.com/c/chat" },
      { id: "notebook", title: "NotebookLM", url: "https://notebooklm.google.com/notebook/one" },
    ] }));
    linked = await readLinkedWorkspaceReferences(d1, "p");
    expect(linked.find((ref) => ref.kind === "conversation")?.title).toBe("Conversa atualizada");
    expect((await readWorkspaceOverview(d1))[0].supportCount).toBe(1);

    sqlite.query("update journey_step_values set value_json = ? where id = 'value'").run(JSON.stringify({ links: [] }));
    overview = (await readWorkspaceOverview(d1))[0];
    expect(overview).toMatchObject({ directoryCount: 0, conversationCount: 0, supportCount: 0, status: "nao_iniciado" });
    sqlite.close();
  });

  test("does not duplicate a manual reference matching a journey link", () => {
    const manual = { id: "manual", project_id: "p", kind: "directory", title: "Pasta", target: "https://example.com/folder/", notes: null, sort_order: 0, created_at: "", updated_at: "" } satisfies WorkspaceReference;
    const linked = { ...manual, id: "journey:one", target: "https://example.com/folder", origin: { type: "journey" as const, stepId: "s", stepName: "Etapa", blockTitle: "Links" } };
    expect(mergeWorkspaceReferences([manual], [linked])).toEqual([manual]);
    expect(normalizeManualReference(manual).kind).toBe("support");
    expect(normalizeManualReference({ ...manual, kind: "support", title: "PCA - RCA", target: "https://chatgpt.com/g/g-p-project/c/chat-id" }).kind).toBe("conversation");
    expect(normalizeManualReference({ ...manual, kind: "conversation", title: "Pasta de Trabalho", target: "https://chatgpt.com/g/g-p-project/project" }).kind).toBe("support");
    expect(normalizeManualReference({ ...manual, target: "\\\\luz-engenharia\\projetos\\PCA" }).kind).toBe("directory");
  });

  test("reclassifies legacy manual web links in the overview without changing stored rows", async () => {
    const { sqlite, d1 } = database();
    sqlite.exec(`insert into projects values ('p', null);
      insert into project_workspaces values ('p', 0, 0, '2026-01-01');
      insert into project_workspace_references values ('one', 'p', 'directory', 'Pasta de Trabalho', 'https://chatgpt.com/g/g-p-project/project', null, 0, '2026-01-01', '2026-01-01');
      insert into project_workspace_references values ('two', 'p', 'support', 'PCA - RCA', 'https://chatgpt.com/g/g-p-project/c/chat-id', null, 1, '2026-01-01', '2026-01-01');`);
    expect((await readWorkspaceOverview(d1))[0]).toMatchObject({ directoryCount: 0, conversationCount: 1, supportCount: 1, status: "parcial" });
    expect(sqlite.query("select kind from project_workspace_references where id = 'one'").get()).toMatchObject({ kind: "directory" });
    sqlite.close();
  });

  test("keeps links entered in legacy project steps while ignoring template configuration", async () => {
    const { sqlite, d1 } = database();
    sqlite.exec(`insert into projects values ('p', null);
      insert into project_steps values ('step', 'p', 'CONTEXTO');
      insert into project_step_links values ('consultant-link', 'step', 'Pasta do cliente', 'https://drive.google.com/drive/folders/client', 0, '2026-01-01');
      insert into journey_step_documents values ('doc', 'project', 'p', 'step', 'draft',
        '{"blocks":[{"id":"block","type":"materials","title":"Links","config":{"links":[{"id":"template-link","title":"Pasta de Trabalho","url":"https://chatgpt.com/g/template/project"}]}}]}', '2026-01-01', '2026-01-01');`);
    const linked = await readLinkedWorkspaceReferences(d1, "p");
    expect(linked).toMatchObject([{ title: "Pasta do cliente", kind: "support", origin: { stepName: "CONTEXTO" } }]);
    sqlite.close();
  });

  test("uses a conversation URL saved as the title when the destination is a ChatGPT project", async () => {
    const { sqlite, d1 } = database();
    sqlite.exec(`insert into projects values ('p', null);
      insert into project_workspaces values ('p', 1, 0, '2026-01-01');
      insert into project_steps values ('step', 'p', 'CONTEXTO');
      insert into journey_step_documents values ('doc', 'project', 'p', 'step', 'draft',
        '{"blocks":[{"id":"block","type":"materials","title":"Links","config":{"links":[]}}]}', '2026-01-01', '2026-01-01');
      insert into journey_step_values values ('value', 'project', 'doc', 'block',
        '{"links":[{"id":"chat","title":"https://chatgpt.com/share/e/conversation-id","url":"https://chatgpt.com/g/g-p-project/project"}]}', '2026-01-01', '2026-01-01');`);
    const response = await handleProjectWorkspaceRequest(new Request("http://local/api/projects/p/workspace"), { DB: d1 }, ["api", "projects", "p", "workspace"]);
    const body = await response?.json() as { data: { references: WorkspaceReference[]; conversationCount: number; conversationNotApplicable: boolean } };
    expect(body.data).toMatchObject({ conversationCount: 1, conversationNotApplicable: false });
    expect(body.data.references).toMatchObject([{ title: "Conversa do projeto", target: "https://chatgpt.com/share/e/conversation-id", kind: "conversation" }]);
    expect(sqlite.query("select value_json from journey_step_values where id = 'value'").get()).toMatchObject({ value_json: expect.stringContaining("https://chatgpt.com/g/g-p-project/project") });
    sqlite.close();
  });

  test("saving manual references never copies or deletes links owned by the journey", async () => {
    const { sqlite, d1 } = database();
    sqlite.exec(`insert into projects values ('p', null);
      insert into project_workspaces (project_id, conversation_not_applicable, revision) values ('p', 0, 0);
      insert into project_steps values ('step', 'p', 'Contexto');
      insert into journey_step_documents values ('doc', 'project', 'p', 'step', 'draft',
        '{"blocks":[{"id":"block","type":"materials","title":"Links","config":{"links":[]}}]}', '2026-01-01', '2026-01-01');
      insert into journey_step_values values ('value', 'project', 'doc', 'block',
        '{"links":[{"id":"chat","title":"Conversa","url":"https://chatgpt.com/c/chat"}]}', '2026-01-01', '2026-01-01');`);
    const env = { DB: d1 };
    const parts = ["api", "projects", "p", "workspace"];
    const body = { expectedRevision: 0, conversationNotApplicable: false, references: [
      { id: "dir", kind: "directory", title: "Pasta", target: "C:\\Projetos\\P", notes: null },
    ] };
    const saved = await handleProjectWorkspaceRequest(new Request("http://local/api/projects/p/workspace", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }), env, parts);
    expect(saved?.status).toBe(200);
    const detail = (await saved?.json()) as { data: { references: WorkspaceReference[]; manualReferences: WorkspaceReference[]; status: string } };
    expect(detail.data).toMatchObject({ status: "organizado" });
    expect(detail.data.references).toHaveLength(2);
    expect(detail.data.manualReferences).toHaveLength(1);
    expect(sqlite.query("select count(*) as total from project_workspace_references").get()).toMatchObject({ total: 1 });
    sqlite.close();
  });
});
