import { describe, expect, test } from "bun:test";
import { calculateCompletion, createBlock, type StepDocument } from "./stepBuilder";

function documentWith(blocks: StepDocument["blocks"]): StepDocument {
  return {
    schemaVersion: 1,
    ownerType: "project",
    projectId: "project-1",
    stepId: "step-1",
    structureId: "structure-1",
    title: "Etapa de teste",
    status: "pendente",
    state: "draft",
    versionNumber: 1,
    revision: 1,
    blocks,
    completionRules: [],
  };
}

describe("modelo canonico de etapa", () => {
  test("reconhece o checklist legado e calcula sua conclusao", () => {
    const checklist = createBlock("checklist", 1);
    checklist.required = true;
    checklist.config.items = [{ id: "cnpj", label: "CNPJ", order: 1, required: true, requiresFile: false, acceptedFileTypes: [] }];

    const result = calculateCompletion(documentWith([checklist]), [{ blockKey: checklist.id, value: { checked: { cnpj: true } } }], []);

    expect(result.canComplete).toBe(true);
    expect(result.progress).toBe(100);
  });

  test("considera um prompt confirmado como aplicado", () => {
    const prompt = createBlock("prompt", 1);
    prompt.required = true;
    prompt.config.contentSnapshot = "Faca a leitura tecnica do material.";

    const result = calculateCompletion(documentWith([prompt]), [{ blockKey: prompt.id, value: { applied: true, copyCount: 1 } }], []);

    expect(result.canComplete).toBe(true);
    expect(result.progress).toBe(100);
  });

  test("nao bloqueia a execucao por um texto apenas informativo", () => {
    const guide = createBlock("long_text", 1);
    guide.required = true;
    guide.config.content = "Orientacao para a equipe.";

    const result = calculateCompletion(documentWith([guide]), [], []);

    expect(result.canComplete).toBe(true);
    expect(result.progress).toBe(0);
  });
});
