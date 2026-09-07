import { describe, expect, test } from "bun:test";
import { promptToneHue } from "./promptTone";

describe("promptToneHue", () => {
  test("mantem a mesma tonalidade para o mesmo prompt", () => {
    expect(promptToneHue("prompt-version-1")).toBe(promptToneHue("prompt-version-1"));
  });

  test("gera uma tonalidade valida e distinta para prompts proximos", () => {
    expect(promptToneHue("prompt-version-1")).toBeGreaterThanOrEqual(0);
    expect(promptToneHue("prompt-version-1")).toBeLessThan(360);
    expect(promptToneHue("prompt-version-1")).not.toBe(promptToneHue("prompt-version-2"));
  });
});
