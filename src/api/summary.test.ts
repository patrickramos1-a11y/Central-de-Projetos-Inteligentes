import { expect, test } from "bun:test";
import { createSummaryApi } from "./summary";

test("sends summary prompt composition to the domain endpoint", async () => {
  const originalFetch = globalThis.fetch;
  let request: Request | undefined;
  globalThis.fetch = async (input, init) => {
    request = new Request(input, init);
    return new Response(JSON.stringify({ data: { summary: { id: "summary-1" }, items: [], prompts: [{ id: "prompt-1" }] } }), { status: 201 });
  };

  try {
    const result = await createSummaryApi("https://example.test/").savePrompt("summary-1", {
      promptId: "prompt-1",
      itemIds: ["item-1"],
      finalPrompt: "Desenvolva o topico.",
      createdBy: "Patrick",
    });
    expect(result.prompts[0]).toEqual({ id: "prompt-1" });
    expect(request?.url).toBe("https://example.test/api/summaries/summary-1/prompts");
    expect(await request?.json()).toMatchObject({ promptId: "prompt-1", itemIds: ["item-1"], createdBy: "Patrick" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reads only the selected summary state for revalidation", async () => {
  const originalFetch = globalThis.fetch;
  let request: Request | undefined;
  globalThis.fetch = async (input, init) => {
    request = new Request(input, init);
    return Response.json({ data: { summary: { id: "summary-2" }, items: [], prompts: [] } });
  };
  try {
    const state = await createSummaryApi("https://example.test").getState("summary-2");
    expect(request?.url).toBe("https://example.test/api/summaries/summary-2/state");
    expect(state.summary.id).toBe("summary-2");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
