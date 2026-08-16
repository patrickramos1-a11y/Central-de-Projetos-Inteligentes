export function toggleCollapsedBlockIds(current: Iterable<string>, blockId: string) {
  const next = new Set(current);
  if (next.has(blockId)) next.delete(blockId);
  else next.add(blockId);
  return next;
}

export function collapseAllBlockIds(blockIds: Iterable<string>) {
  return new Set(blockIds);
}

export function sanitizeCollapsedBlockIds(savedIds: Iterable<string>, validBlockIds: Iterable<string>) {
  const valid = new Set(validBlockIds);
  return new Set([...savedIds].filter((blockId) => valid.has(blockId)));
}
