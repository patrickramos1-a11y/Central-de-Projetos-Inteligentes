import { expect, test } from "bun:test";
import { cloneSummaryMasterPromptConfig, resolveSummaryMasterPromptConfig, summaryMasterPromptConfig } from "./masterPrompt";

test("the summary master keeps the complete canonical instructions and dynamic scope variables", () => {
  const prompt = summaryMasterPromptConfig.basePromptSnapshot ?? "";

  expect(prompt).toContain("PROMPT MESTRE - DESENVOLVIMENTO DE DOCUMENTO AMBIENTAL POR TOPICOS");
  expect(prompt).toContain("{{sumario_consolidado}}");
  expect(prompt).toContain("{{topicos_selecionados}}");
  expect(prompt).toContain("{{contexto}}");
  expect(prompt).toContain("REVISAO INTERNA OBRIGATORIA");
  expect(prompt.length).toBeGreaterThan(8000);
});

test("each summary reads an isolated copy of the canonical configuration", () => {
  const copy = cloneSummaryMasterPromptConfig();
  copy.additions?.pop();

  expect(copy.additions?.length).toBe((summaryMasterPromptConfig.additions?.length ?? 0) - 1);
  expect(summaryMasterPromptConfig.additions?.length).toBeGreaterThan(10);
});

test("a thin legacy snapshot cannot replace the master prompt", () => {
  const legacySnapshot = "Desenvolva os topicos selecionados.";
  const resolved = resolveSummaryMasterPromptConfig();

  expect(resolved.basePromptSnapshot).not.toBe(legacySnapshot);
  expect(resolved.basePromptSnapshot).toContain("CONTEXTO TECNICO CADASTRADO");
});
