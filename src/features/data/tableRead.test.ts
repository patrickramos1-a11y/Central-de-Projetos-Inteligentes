import { describe, expect, test } from "bun:test";
import { buildTableReadQuery } from "../../../worker/tableRead";

const columns = ["id", "project_id", "status", "created_at"];

describe("table read query", () => {
  test("filters, projects columns and paginates with bound values", () => {
    const query = buildTableReadQuery("project_summaries", columns, new URL("https://example.test/api/tables/project_summaries?select=id,status&filter=project_id&value=p-1&order=created_at&ascending=false&limit=100&offset=200"));
    expect(query).toEqual({
      sql: "select id, status from project_summaries where project_id = ? order by created_at DESC, id DESC limit ? offset ?",
      bindings: ["p-1", 100, 200],
    });
  });

  test("keeps legacy full reads and rejects unknown columns or invalid pages", () => {
    expect(buildTableReadQuery("projects", columns, new URL("https://example.test/api/tables/projects"))).toEqual({
      sql: "select * from projects order by created_at ASC",
      bindings: [],
    });
    expect(buildTableReadQuery("projects", columns, new URL("https://example.test/api/tables/projects?select=secret"))).toBeNull();
    expect(buildTableReadQuery("projects", columns, new URL("https://example.test/api/tables/projects?filter=secret&value=x"))).toBeNull();
    expect(buildTableReadQuery("projects", columns, new URL("https://example.test/api/tables/projects?limit=5000"))).toBeNull();
  });
});
