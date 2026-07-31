import { expect, test } from "bun:test";
import { createSummaryApi } from "./summary";

test("sends summary prompt composition to the domain endpoint", async () => {
  const originalFetch = globalThis.fetch;
  let request: Request | undefined;
  globalThis.fetch = async (input, init) => {
    request = new Request(input, init);
    return new Response(JSON.stringify({ data: { id: "prompt-1" } }), { status: 201 });
  };

  try {
    const result = await createSummaryApi("https://example.test/").savePrompt("summary-1", {
      itemIds: ["item-1"],
      finalPrompt: "Desenvolva o topico.",
      createdBy: "Patrick",
    });
    expect(result).toEqual({ id: "prompt-1" });
    expect(request?.url).toBe("https://example.test/api/summaries/summary-1/prompts");
    expect(await request?.json()).toMatchObject({ itemIds: ["item-1"], createdBy: "Patrick" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
