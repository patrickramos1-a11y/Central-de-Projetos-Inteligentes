import { describe, expect, test } from "bun:test";
import { interpolateJourneyPrompt } from "./promptInterpolation";

const context = { projectName: "PCA Rio de Advance", company: "Rio de Advance", projectType: "PCA", stepName: "Iniciar projetos", responsible: "Ana", context: "Contexto confirmado", summary: "Sumario tecnico", date: new Date("2026-09-09T12:00:00Z") };

describe("interpolateJourneyPrompt", () => {
  test("substitui as variaveis da jornada sem alterar o template", () => {
    const template = "{{nome_projeto}} | {{empresa}} | {{responsavel}} | {{etapa_atual}}";
    expect(interpolateJourneyPrompt(template, context)).toBe("PCA Rio de Advance | Rio de Advance | Ana | Iniciar projetos");
    expect(template).toContain("{{nome_projeto}}");
  });

  test("preserva token desconhecido e sinaliza dados ausentes", () => {
    expect(interpolateJourneyPrompt("{{empresa}} {{desconhecida}}", { ...context, company: null })).toBe("[nao informado] {{desconhecida}}");
  });
});
