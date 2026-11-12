import { describe, expect, test } from "bun:test";
import { displayDirectoryPath } from "./workspaceModel";

describe("displayDirectoryPath", () => {
  test("starts at R. AC / R. AV", () => {
    expect(displayDirectoryPath("D:\\RAMOS ENGENHARIA\\R. AC\\APEU POLPAS\\3 - PROJETOS\\RCA")).toBe("R. AC\\APEU POLPAS\\3 - PROJETOS\\RCA");
    expect(displayDirectoryPath("\\\\192.168.25.5\\ramos engenharia\\R. AC\\100% AMAZONIA\\3 PROJETOS\\PAE")).toBe("R. AC\\100% AMAZONIA\\3 PROJETOS\\PAE");
    expect(displayDirectoryPath("Z:\\R.AV\\2026\\DISMELO")).toBe("R.AV\\2026\\DISMELO");
    expect(displayDirectoryPath("Z:\\JR. AV\\2026\\DISMELO")).toBe("Z:\\JR. AV\\2026\\DISMELO");
    expect(displayDirectoryPath("https://drive.google.com/x")).toBe("https://drive.google.com/x");
  });
});
