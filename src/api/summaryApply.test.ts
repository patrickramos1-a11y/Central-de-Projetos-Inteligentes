import { describe, expect, test } from "bun:test";
import { rebindSummaryBlocks } from "../../worker/summaryApply";

describe("rebindSummaryBlocks", () => {
  const versions = new Set(["v1", "v2", "v3"]);

  test("points summary blocks of the project to the applied version", () => {
    const document = JSON.stringify({ blocks: [
      { id: "a", type: "prompt", config: {} },
      { id: "b", type: "project_summary", config: { summaryId: "v2", other: 1 } },
      { id: "c", type: "project_summary", config: {} },
    ] });
    const next = JSON.parse(rebindSummaryBlocks(document, versions, "v3")!);
    expect(next.blocks[1].config).toEqual({ summaryId: "v3", other: 1 });
    expect(next.blocks[2].config).toEqual({ summaryId: "v3" });
    expect(next.blocks[0].config).toEqual({});
  });

  test("leaves documents without changes untouched", () => {
    expect(rebindSummaryBlocks(JSON.stringify({ blocks: [{ id: "b", type: "project_summary", config: { summaryId: "v3" } }] }), versions, "v3")).toBeNull();
    expect(rebindSummaryBlocks(JSON.stringify({ blocks: [{ id: "b", type: "project_summary", config: { summaryId: "other-project" } }] }), versions, "v3")).toBeNull();
    expect(rebindSummaryBlocks("not json", versions, "v3")).toBeNull();
  });
});
