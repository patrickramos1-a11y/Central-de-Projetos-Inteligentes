import { describe, expect, test } from "bun:test";
import { isMaterialsComplete, materialsPendingMessage, readSlots } from "../../../shared/materialsSlots";
import { titleFromTarget } from "./MaterialsBlock";

const config = { links: [], slots: [
  { id: "drive", label: "Projetos básicos", kind: "google-drive", required: true },
  { id: "photos", label: "Fotos da visita", kind: "google-photos", required: false },
] };

describe("materials slots", () => {
  test("legacy blocks complete with any link", () => {
    expect(isMaterialsComplete({ links: [] }, null)).toBe(false);
    expect(isMaterialsComplete({ links: [] }, { links: [{ id: "1", title: "x", url: "https://a.com" }] })).toBe(true);
    expect(isMaterialsComplete({ links: [{ id: "f", title: "Modelo", url: "https://a.com" }] }, null)).toBe(true);
  });

  test("required slots must be filled or not applicable", () => {
    expect(isMaterialsComplete(config, null)).toBe(false);
    expect(materialsPendingMessage(config, null, "Links")).toBe('Preencha o link "Projetos básicos" em Links.');
    expect(isMaterialsComplete(config, { links: [{ id: "2", title: "Extra", url: "https://a.com" }] })).toBe(false);
    expect(isMaterialsComplete(config, { links: [{ id: "3", slotId: "drive", title: "Projetos básicos", url: "https://drive.google.com/x" }] })).toBe(true);
    expect(isMaterialsComplete(config, { links: [], slotNotApplicable: { drive: true } })).toBe(true);
  });

  test("incomplete slots are hidden at runtime but kept in the editor", () => {
    const draft = { slots: [{ id: "a", label: "", kind: "any" }] };
    expect(readSlots(draft)).toHaveLength(0);
    expect(readSlots(draft, { includeIncomplete: true })).toHaveLength(1);
  });

  test("suggests titles from pasted targets", () => {
    expect(titleFromTarget("https://drive.google.com/drive/folders/abc")).toBe("Google Drive");
    expect(titleFromTarget("Z:\\JR\\CLIENTE\\PROJETOS BASICOS")).toBe("PROJETOS BASICOS");
  });
});
