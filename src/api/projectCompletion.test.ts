import { describe, expect, test } from "bun:test";
import { planStepsOnProjectCompletion } from "../../worker/projectCompletion";

describe("planStepsOnProjectCompletion", () => {
  test("started steps conclude and untouched steps become not applicable", () => {
    const plan = planStepsOnProjectCompletion([
      { id: "done", status: "concluido", is_not_applicable: 0, has_progress: 3 },
      { id: "na", status: "pendente", is_not_applicable: 1, has_progress: 0 },
      { id: "running", status: "em_andamento", is_not_applicable: 0, has_progress: 0 },
      { id: "filled", status: "pendente", is_not_applicable: 0, has_progress: 2 },
      { id: "untouched", status: "pendente", is_not_applicable: 0, has_progress: 0 },
      { id: "blocked", status: "bloqueado", is_not_applicable: false, has_progress: null },
    ]);
    expect(plan).toEqual([
      { id: "running", action: "complete" },
      { id: "filled", action: "complete" },
      { id: "untouched", action: "not_applicable" },
      { id: "blocked", action: "complete" },
    ]);
  });
});
