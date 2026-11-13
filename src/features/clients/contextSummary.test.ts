import { expect, test } from "bun:test";
import { createContextSummary } from "../../../shared/contextSummary";

test("creates a concise context summary without repeating the title or headings", () => {
  const summary = createContextSummary("Contexto Consolidado", `Contexto Consolidado\n\n# 1. CONTEXTO GERAL\n\nA capacitacao ambiental organiza orientacoes operacionais para os colaboradores, com foco nos controles aplicaveis durante a rotina do empreendimento.`);
  expect(summary).toBe("A capacitacao ambiental organiza orientacoes operacionais para os colaboradores, com foco nos controles aplicaveis durante a rotina do empreendimento.");
});
