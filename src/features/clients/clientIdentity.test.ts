import { describe, expect, test } from "bun:test";
import { validateClientLogo } from "./clientIdentity";

describe("client logo", () => {
  test("accepts supported images up to 3 MB", () => {
    expect(validateClientLogo({ type: "image/png", size: 3_000_000 })).toBeNull();
    expect(validateClientLogo({ type: "image/webp", size: 120_000 })).toBeNull();
  });

  test("rejects other files and oversized images", () => {
    expect(validateClientLogo({ type: "image/svg+xml", size: 100 })).toContain("PNG");
    expect(validateClientLogo({ type: "image/jpeg", size: 3_000_001 })).toContain("3 MB");
  });
});
