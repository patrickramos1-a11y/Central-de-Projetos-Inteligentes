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

  test("ignora blocos opcionais e aceita link fixo em material obrigatorio", () => {
    const material = createBlock("materials", 1);
    material.required = true;
    material.config.links = [{ id: "guia", title: "Guia", url: "https://example.com/guia" }];
    const optionalPrompt = createBlock("prompt", 2);
    optionalPrompt.config.contentSnapshot = "Prompt que nao bloqueia a etapa.";

    const result = calculateCompletion(documentWith([material, optionalPrompt]), [], []);

    expect(result.canComplete).toBe(true);
    expect(result.progress).toBe(100);
  });

  test("exige todas as condicoes e a quantidade minima de arquivos nos blocos obrigatorios", () => {
    const prompt = createBlock("prompt", 1);
    prompt.required = true;
    prompt.config.applicationConditions = [{ id: "enviado", label: "Enviado junto ao projeto", required: true }];
    prompt.config.attachmentsEnabled = true;
    prompt.config.attachmentsRequired = true;
    const upload = createBlock("file_upload", 2);
    upload.required = true;
    upload.config.minFiles = 2;

    const incomplete = calculateCompletion(documentWith([prompt, upload]), [{ blockKey: prompt.id, value: { applied: true, conditionChecks: { enviado: true } } }], [{ blockKey: prompt.id }]);
    const complete = calculateCompletion(documentWith([prompt, upload]), [{ blockKey: prompt.id, value: { applied: true, conditionChecks: { enviado: true } } }], [{ blockKey: prompt.id }, { blockKey: upload.id }, { blockKey: upload.id }]);

    expect(incomplete.canComplete).toBe(false);
    expect(complete.canComplete).toBe(true);
  });
});
