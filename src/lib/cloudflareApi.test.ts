import { afterEach, describe, expect, test } from "bun:test";
import { createCloudflareApi } from "./cloudflareApi";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe("Cloudflare table reads", () => {
  test("sends projections, equality filters and page bounds", async () => {
    let requestedUrl = "";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return Response.json({ data: [{ id: "one" }] });
    }) as typeof fetch;

    const result = await createCloudflareApi("https://example.test/")
      .from<{ id: string }>("project_summary_items")
      .select("id,project_id")
      .eq("project_id", "project with spaces")
      .order("created_at", { ascending: false })
      .range(500, 999);

    const url = new URL(requestedUrl);
    expect(url.pathname).toBe("/api/tables/project_summary_items");
    expect(url.searchParams.get("select")).toBe("id,project_id");
    expect(url.searchParams.get("filter")).toBe("project_id");
    expect(url.searchParams.get("value")).toBe("project with spaces");
    expect(url.searchParams.get("limit")).toBe("500");
    expect(url.searchParams.get("offset")).toBe("500");
    expect(url.searchParams.get("ascending")).toBe("false");
    expect(result.data).toEqual([{ id: "one" }]);
  });

  test("preserves an API error instead of returning an empty list", async () => {
    globalThis.fetch = (async () => Response.json({ error: "D1 indisponivel" }, { status: 503 })) as typeof fetch;
    const result = await createCloudflareApi("https://example.test").from("projects").select("id,name");
    expect(result.data).toBeNull();
    expect(result.error?.message).toBe("D1 indisponivel");
  });
});
