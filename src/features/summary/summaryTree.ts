export type SummaryTreeInput = {
  id: string;
  parentId: string | null;
  topicNumber: string;
  title: string;
  level: number;
  sortOrder: number;
  selected: boolean;
};

export type RenumberedSummaryTopic = SummaryTreeInput & {
  parentId: string | null;
  topicNumber: string;
  level: number;
};

/**
 * Produces a dense hierarchy after selected items are consolidated. A selected
 * child whose parent was removed is promoted to its nearest selected ancestor,
 * keeping the consolidated summary valid and sequential.
 */
export function renumberSelectedSummaryTopics(items: SummaryTreeInput[]): RenumberedSummaryTopic[] {
  const ordered = [...items].sort((left, right) => left.sortOrder - right.sortOrder);
  const byId = new Map(ordered.map((item) => [item.id, item]));
  const selected = ordered.filter((item) => item.selected);
  const selectedIds = new Set(selected.map((item) => item.id));
  const numberById = new Map<string, string>();
  const childCounters = new Map<string, number>();

  return selected.map((item) => {
    let parentId = item.parentId;
    while (parentId && !selectedIds.has(parentId)) {
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    const parentKey = parentId ?? "root";
    const position = (childCounters.get(parentKey) ?? 0) + 1;
    childCounters.set(parentKey, position);
    const parentNumber = parentId ? numberById.get(parentId) : null;
    const topicNumber = parentNumber ? `${parentNumber}.${position}` : String(position);
    numberById.set(item.id, topicNumber);
    return { ...item, parentId, topicNumber, level: topicNumber.split(".").length };
  });
}

export function buildDenseConsolidatedText(items: SummaryTreeInput[]) {
  return renumberSelectedSummaryTopics(items)
    .map((item) => `${"  ".repeat(Math.max(0, item.level - 1))}${item.topicNumber} ${item.title}`.trimEnd())
    .join("\n");
}
