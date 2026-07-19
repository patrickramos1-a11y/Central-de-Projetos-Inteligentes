import { describe, expect, test } from "bun:test";
import { renumberSelectedSummaryTopics } from "./summaryTree";

describe("renumberSelectedSummaryTopics", () => {
  test("renumera capitulos apos remover o topico 10", () => {
    const result = renumberSelectedSummaryTopics([
      { id: "one", parentId: null, topicNumber: "1", title: "Um", level: 1, sortOrder: 1, selected: true },
      { id: "ten", parentId: null, topicNumber: "10", title: "Removido", level: 1, sortOrder: 2, selected: false },
      { id: "eleven", parentId: null, topicNumber: "11", title: "Novo dez", level: 1, sortOrder: 3, selected: true },
      { id: "eleven-one", parentId: "eleven", topicNumber: "11.1", title: "Filho", level: 2, sortOrder: 4, selected: true },
    ]);

    expect(result.map((item) => item.topicNumber)).toEqual(["1", "2", "2.1"]);
  });

  test("promove filho selecionado quando o pai foi excluido", () => {
    const result = renumberSelectedSummaryTopics([
      { id: "root", parentId: null, topicNumber: "1", title: "Raiz", level: 1, sortOrder: 1, selected: false },
      { id: "child", parentId: "root", topicNumber: "1.1", title: "Filho mantido", level: 2, sortOrder: 2, selected: true },
    ]);

    expect(result[0]).toMatchObject({ parentId: null, topicNumber: "1", level: 1 });
  });
});
