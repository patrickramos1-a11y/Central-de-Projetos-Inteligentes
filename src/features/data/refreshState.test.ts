import { describe, expect, test } from "bun:test";
import { mergeSuccessfulTables, replaceProjectRows, shouldApplyRefresh } from "./refreshState";

describe("refresh state", () => {
  test("retains previous rows when one table fails", () => {
    const current = { projects: [{ id: "saved" }], clients: [{ id: "old" }] };
    const next = mergeSuccessfulTables(current, [
      { tableName: "projects", data: null, error: new Error("offline") },
      { tableName: "clients", data: [{ id: "new" }], error: null },
    ]);
    expect(next.projects).toEqual([{ id: "saved" }]);
    expect(next.clients).toEqual([{ id: "new" }]);
  });

  test("replaces only the opened project's detail rows", () => {
    expect(replaceProjectRows([
      { project_id: "a", value: 1 },
      { project_id: "b", value: 2 },
    ], "a", [{ project_id: "a", value: 3 }])).toEqual([
      { project_id: "b", value: 2 },
      { project_id: "a", value: 3 },
    ]);
  });

  test("rejects a response that started before a local edit or a newer request", () => {
    expect(shouldApplyRefresh(1, 2, 1, 1)).toBe(false);
    expect(shouldApplyRefresh(1, 1, 1, 2)).toBe(false);
    expect(shouldApplyRefresh(2, 2, 2, 2)).toBe(true);
  });
});
