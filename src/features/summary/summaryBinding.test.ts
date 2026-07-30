import { describe, expect, test } from "bun:test";
import { resolveBoundSummary } from "./summaryBinding";

const summaries = [
  { id: "version-1", status: "archived", version_number: 1 },
  { id: "version-2", status: "active", version_number: 2 },
  { id: "version-3", status: "active", version_number: 3 },
];

describe("resolveBoundSummary", () => {
  test("sempre prioriza a versao vinculada ao bloco", () => {
    expect(resolveBoundSummary(summaries, "version-1")?.id).toBe("version-1");
  });

  test("usa a versao ativa mais recente apenas para bloco legado nao vinculado", () => {
    expect(resolveBoundSummary(summaries, null)?.id).toBe("version-3");
  });

  test("nao substitui vinculacao ausente por uma versao ativa", () => {
    expect(resolveBoundSummary(summaries, "missing")).toBeNull();
  });
});
