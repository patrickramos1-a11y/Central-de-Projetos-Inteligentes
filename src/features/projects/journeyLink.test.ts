import { describe, expect, test } from "bun:test";
import { buildJourneyLink, readJourneyLink } from "./journeyLink";

describe("journeyLink", () => {
  test("builds a deep link without dropping existing query parameters", () => {
    expect(buildJourneyLink("project 1", "step-2", "https://example.com/?v=release")).toBe("https://example.com/?v=release&project=project+1&step=step-2");
  });

  test("reads a journey target and defaults to the workspace step", () => {
    expect(readJourneyLink("https://example.com/?project=p1")).toEqual({ projectId: "p1", stepId: "__project_workspace__" });
    expect(readJourneyLink("https://example.com/?step=s1")).toBeNull();
  });
});
