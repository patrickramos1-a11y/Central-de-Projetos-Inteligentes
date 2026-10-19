import { describe, expect, test } from "bun:test";
import { normalizeClientName, planRadarImport } from "../../../scripts/import-radar-clients";

describe("Radar client import", () => {
  test("matches accents, punctuation and known legacy aliases without creating duplicates", () => {
    const source = [
      { id: "1", name: "POSTO AV. BRASIL", clientType: "AC" as const, isActive: true, logoUrl: "data:image/png;base64,AA==" },
      { id: "2", name: "SIMETRIA / ÍCONE", clientType: "AC" as const, isActive: true, logoUrl: null },
    ];
    const existing = [
      { id: "a", name: "POSTO AV BRASIL", company: null, logo_url: null, client_kind: null, is_active: true },
      { id: "b", name: "SIMETRIA", company: null, logo_url: null, client_kind: null, is_active: true },
    ];
    expect(normalizeClientName("Ícone / Açaí")).toBe("ICONE ACAI");
    expect(planRadarImport(source, existing).map((item) => item.targets[0]?.id)).toEqual(["a", "b"]);
  });

  test("imports every AC and only AVs with logos", () => {
    const source = [
      { id: "1", name: "AC sem logo", clientType: "AC" as const, isActive: true, logoUrl: null },
      { id: "2", name: "AV sem logo", clientType: "AV" as const, isActive: true, logoUrl: null },
      { id: "3", name: "AV com logo", clientType: "AV" as const, isActive: false, logoUrl: "data:image/png;base64,AA==" },
    ];
    expect(planRadarImport(source, []).map((item) => item.source.id)).toEqual(["1", "3"]);
  });
});
