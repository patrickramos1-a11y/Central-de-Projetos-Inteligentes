export type SummaryBindingCandidate = {
  id: string;
  status?: string | null;
  version_number?: number | null;
};

/** A block binding has precedence over the project-wide active version. */
export function resolveBoundSummary<T extends SummaryBindingCandidate>(summaries: T[], summaryId?: string | null): T | null {
  const boundId = String(summaryId ?? "").trim();
  if (boundId) return summaries.find((summary) => summary.id === boundId) ?? null;

  return [...summaries]
    .filter((summary) => summary.status === "active" || summary.status === "ativo")
    .sort((left, right) => Number(right.version_number ?? 0) - Number(left.version_number ?? 0))[0]
    ?? null;
}
