import { expect, test } from "bun:test";
import { replaceSummaryState, shouldApplySummaryState } from "./summaryState";

const original = {
  summaries: [{ id: "a", project_id: "project-a" }, { id: "b", project_id: "project-b" }],
  items: [{ id: "a-1", summary_id: "a", status: "pendente" }, { id: "b-1", summary_id: "b", status: "concluido" }],
  prompts: [{ id: "b-prompt", summary_id: "b" }],
};

test("replaces only the affected summary, topics and prompts after save", () => {
  const result = replaceSummaryState(original, {
    summary: { id: "a", project_id: "project-a" },
    items: [{ id: "a-1", summary_id: "a", status: "em_andamento" }],
    prompts: [{ id: "a-prompt", summary_id: "a" }],
  });
  expect(result.items.find((item) => item.id === "a-1")?.status).toBe("em_andamento");
  expect(result.items.filter((item) => item.summary_id === "a" && item.status === "em_andamento")).toHaveLength(1);
  expect(result.prompts.filter((prompt) => prompt.summary_id === "a")).toHaveLength(1);
  expect(result.items.find((item) => item.id === "b-1")?.status).toBe("concluido");
  expect(result.prompts.find((prompt) => prompt.id === "b-prompt")).toBeDefined();
});

test("failed reads leave the last valid state untouched", () => {
  expect(original.items[0]?.status).toBe("pendente");
  expect(original.prompts).toHaveLength(1);
});

test("ignores a late response after a save or a rapid project switch", () => {
  expect(shouldApplySummaryState(1, 2, "project-a", "project-a")).toBe(false);
  expect(shouldApplySummaryState(2, 2, "project-a", "project-b")).toBe(false);
  expect(shouldApplySummaryState(2, 2, "project-a", "project-a")).toBe(true);
});
