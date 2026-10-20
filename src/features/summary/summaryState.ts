export type SummaryState<TSummary extends { id: string }, TItem extends { summary_id: string }, TPrompt extends { summary_id: string | null }> = {
  summary: TSummary;
  items: TItem[];
  prompts: TPrompt[];
};

export function replaceSummaryState<
  TSummary extends { id: string },
  TItem extends { summary_id: string },
  TPrompt extends { summary_id: string | null },
>(current: { summaries: TSummary[]; items: TItem[]; prompts: TPrompt[] }, state: SummaryState<TSummary, TItem, TPrompt>) {
  const id = state.summary.id;
  return {
    summaries: [...current.summaries.filter((row) => row.id !== id), state.summary],
    items: [...current.items.filter((row) => row.summary_id !== id), ...state.items],
    prompts: [...current.prompts.filter((row) => row.summary_id !== id), ...state.prompts],
  };
}

export function shouldApplySummaryState(requestEpoch: number, currentEpoch: number, projectId: string, currentProjectId: string | null) {
  return requestEpoch === currentEpoch && projectId === currentProjectId;
}
