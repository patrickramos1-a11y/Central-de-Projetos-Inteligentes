export type SummaryPromptInput = {
  itemIds: string[];
  finalPrompt: string;
  basePromptId?: string | null;
  basePromptSnapshot?: string | null;
  aiToolId?: string | null;
  createdBy?: string | null;
  notes?: string | null;
};

type ApiEnvelope<T> = { data?: T; error?: string };

async function read<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as ApiEnvelope<T>;
  if (!response.ok || !body.data) throw new Error(body.error ?? "A operacao do sumario nao foi concluida.");
  return body.data;
}

/** Domain API for immutable summary versions and generated prompt history. */
export function createSummaryApi(baseUrl: string) {
  const base = baseUrl.replace(/\/$/, "");
  return {
    async consolidate(summaryId: string, createdBy?: string | null) {
      const response = await fetch(`${base}/api/summaries/${encodeURIComponent(summaryId)}/consolidate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ createdBy: createdBy ?? null }),
      });
      return read<Record<string, unknown>>(response);
    },

    async savePrompt(summaryId: string, input: SummaryPromptInput) {
      const response = await fetch(`${base}/api/summaries/${encodeURIComponent(summaryId)}/prompts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      return read<Record<string, unknown>>(response);
    },
  };
}
