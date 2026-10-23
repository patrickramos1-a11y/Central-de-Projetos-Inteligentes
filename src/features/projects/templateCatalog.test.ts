import { expect, test } from "bun:test";
import { availableProjectTemplates, templateAfterTypeChange, templateTypeName } from "./templateCatalog";

const templates = [
  { id: "ria", name: "RIA", project_type_id: "type-ria", status: "ativo", context: "projeto" },
  { id: "pca", name: "PCA", project_type_id: "type-pca", status: "ativo", context: "projeto" },
  { id: "general", name: "Base", project_type_id: null, status: "ativo", context: "geral" },
  { id: "inactive", name: "Antigo", project_type_id: "type-ria", status: "inativo", context: "projeto" },
  { id: "client", name: "Cliente", project_type_id: "type-ria", status: "ativo", context: "cliente" },
];

test("project creation suggests matching and general templates without hiding the full catalog", () => {
  expect(availableProjectTemplates(templates, "type-ria").map((item) => item.id)).toEqual(["ria", "general"]);
  expect(availableProjectTemplates(templates, "").map((item) => item.id)).toEqual(["ria", "pca", "general"]);
});

test("changing project type clears only an incompatible template", () => {
  expect(templateAfterTypeChange("ria", "type-pca", templates)).toBe("");
  expect(templateAfterTypeChange("general", "type-pca", templates)).toBe("general");
  expect(templateAfterTypeChange("ria", "type-ria", templates)).toBe("ria");
});

test("templates without a type remain explicitly visible", () => {
  expect(templateTypeName(templates[2], [])).toBe("Sem tipo definido");
  expect(templateTypeName(templates[0], [{ id: "type-ria", name: "RIA" }])).toBe("RIA");
});
