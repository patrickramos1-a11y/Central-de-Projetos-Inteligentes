import { describe, expect, test } from "bun:test";
import { buildConsolidatedSummaryText, parseProjectSummary } from "./summaryParser";

describe("parseProjectSummary", () => {
  test("identifica topicos numerados simples", () => {
    const result = parseProjectSummary({
      rawText: "1. Introducao\n2 - Diagnostico\n3) Conclusao",
    });

    expect(result.items).toHaveLength(3);
    expect(result.items[0]).toMatchObject({ topicNumber: "1", title: "Introducao", level: 1, parentTopicNumber: null });
    expect(result.items[1]).toMatchObject({ topicNumber: "2", title: "Diagnostico", level: 1, parentTopicNumber: null });
    expect(result.warnings).toHaveLength(0);
  });

  test("preserva hierarquia por numeracao decimal", () => {
    const result = parseProjectSummary({
      rawText: "1 Caracterizacao\n1.1 Localizacao\n1.1.1 Acesso\n2 Prognostico",
    });

    expect(result.items.map((item) => [item.topicNumber, item.level, item.parentTopicNumber])).toEqual([
      ["1", 1, null],
      ["1.1", 2, "1"],
      ["1.1.1", 3, "1.1"],
      ["2", 1, null],
    ]);
  });

  test("gera avisos para linhas sem padrao e nao perde texto original", () => {
    const result = parseProjectSummary({
      rawText: "Introducao solta\n1. Area de estudo .... 12",
    });

    expect(result.warnings).toEqual([
      {
        lineNumber: 1,
        text: "Introducao solta",
        message: "Linha ignorada: nao segue a numeracao do MVP.",
      },
    ]);
    expect(result.items[0].originalText).toBe("1. Area de estudo .... 12");
    expect(result.items[0].title).toBe("Area de estudo");
  });
});

describe("buildConsolidatedSummaryText", () => {
  test("usa apenas itens selecionados e mantem recuo hierarquico", () => {
    const output = buildConsolidatedSummaryText([
      { topicNumber: "1", title: "Base", level: 1, selected: true, sortOrder: 1 },
      { topicNumber: "1.1", title: "Filho", level: 2, selected: true, sortOrder: 2 },
      { topicNumber: "2", title: "Descartado", level: 1, selected: false, sortOrder: 3 },
    ]);

    expect(output).toBe("1 Base\n  1.1 Filho");
  });
});
