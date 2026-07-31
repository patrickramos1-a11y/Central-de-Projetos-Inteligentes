import { expect, test } from "bun:test";
import { normalizeJourneySnapshot } from "./journey";

test("normalizes a domain journey snapshot without administrative tables", () => {
  const snapshot = normalizeJourneySnapshot({
    ownerType: "project",
    entity: { id: "project-1" },
    steps: [{ id: "step-1" }],
    documents: [{ document: { stepId: "step-1", title: "Etapa" } }],
    values: [{ owner_step_id: "step-1", value: { applied: true } }],
    files: [{ id: "file-1", owner_step_id: "step-1", name: "modelo.docx", content_type: null, size_bytes: 2 }],
    completions: [{ stepId: "step-1", completion: { progress: 100 } }],
  });

  expect(snapshot.documentsByStep.get("step-1")?.title).toBe("Etapa");
  expect(snapshot.valuesByStep.get("step-1")).toHaveLength(1);
  expect(snapshot.filesByStep.get("step-1")).toHaveLength(1);
  expect(snapshot.completionByStep.get("step-1")?.progress).toBe(100);
});
