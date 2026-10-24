import { describe, expect, test } from "bun:test";
import { buildClientPortfolioRows, filterClientPortfolioRows, sortClientPortfolioRows } from "./clientPortfolioModel";

const rows = buildClientPortfolioRows({
  clients: [
    { id: "ac", name: "Cliente AC", company: "Empresa AC", client_kind: "AC", responsible_user_id: "u", status: "ativo", is_active: true, updated_at: "2026-10-20" },
    { id: "av", name: "Cliente AV", company: "Empresa AV", client_kind: "AV", responsible: "Gabi", status: "em_implantacao", is_active: false, updated_at: "2026-10-21" },
  ],
  users: [{ id: "u", name: "Patrick" }],
  projects: [
    { id: "p1", client_id: "ac" },
    { id: "p2", company: "Empresa AC" },
    { id: "p3", client_id: "av" },
  ],
  workspaces: [
    { projectId: "p1", directoryCount: 1, conversationCount: 1, supportCount: 2, conversationNotApplicable: false, revision: 1, status: "organizado" },
    { projectId: "p2", directoryCount: 2, conversationCount: 0, supportCount: 1, conversationNotApplicable: true, revision: 1, status: "organizado" },
  ],
  contextCounts: [{ clientId: "ac", count: 4 }],
});

describe("clientPortfolioModel", () => {
  test("aggregates projects, contexts, directories and links per client", () => {
    expect(rows.find((row) => row.id === "ac")).toMatchObject({ projectCount: 2, contextCount: 4, directoryCount: 3, linkCount: 4, responsibleName: "Patrick" });
    expect(rows.find((row) => row.id === "av")).toMatchObject({ projectCount: 1, contextCount: 0, directoryCount: 0, linkCount: 0, responsibleName: "Gabi" });
  });

  test("filters tabs, activity and count columns together", () => {
    const defaults = { query: "", kind: "all" as const, responsible: "all", status: "all", showInactive: false, minimumProjects: 0, minimumContexts: 0, minimumDirectories: 0, minimumLinks: 0 };
    expect(filterClientPortfolioRows(rows, defaults).map((row) => row.id)).toEqual(["ac"]);
    expect(filterClientPortfolioRows(rows, { ...defaults, showInactive: true, kind: "AV" }).map((row) => row.id)).toEqual(["av"]);
    expect(filterClientPortfolioRows(rows, { ...defaults, minimumContexts: 1 }).map((row) => row.id)).toEqual(["ac"]);
    expect(filterClientPortfolioRows(rows, { ...defaults, query: "empresa ac" }).map((row) => row.id)).toEqual(["ac"]);
  });

  test("sorts numeric and text columns without mutating source rows", () => {
    const original = rows.map((row) => row.id);
    expect(sortClientPortfolioRows(rows, "projects", "desc").map((row) => row.id)).toEqual(["ac", "av"]);
    expect(sortClientPortfolioRows(rows, "name", "desc").map((row) => row.id)).toEqual(["av", "ac"]);
    expect(rows.map((row) => row.id)).toEqual(original);
  });
});
