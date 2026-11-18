import { describe, expect, test } from "bun:test";
import { buildJourneyLink, readJourneyLink } from "./journeyLink";

describe("journeyLink", () => {
  test("builds a deep link without dropping existing query parameters", () => {
    expect(buildJourneyLink("project 1", "step-2", "https://example.com/?v=release")).toBe("https://example.com/?v=release&project=project+1&step=step-2");
  });

  test("adds a readable company and project path when labels are available", () => {
    expect(buildJourneyLink("p1", undefined, "https://example.com/?v=release", { company: "Posto Av. Brasil", project: "Treinamento Edu. Amb." })).toBe("https://example.com/jornada/posto-av-brasil-treinamento-edu-amb?v=release&project=p1&step=__project_workspace__");
  });

  test("reads a journey target and defaults to the workspace step", () => {
    expect(readJourneyLink("https://example.com/?project=p1")).toEqual({ projectId: "p1", stepId: "__project_workspace__" });
    expect(readJourneyLink("https://example.com/?step=s1")).toBeNull();
  });
});
