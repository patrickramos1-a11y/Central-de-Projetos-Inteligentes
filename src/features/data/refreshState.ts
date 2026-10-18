export type TableResult<T extends object> = {
  tableName: keyof T;
  data: T[keyof T] | null;
  error: unknown;
};

export function mergeSuccessfulTables<T extends object>(current: T, results: Array<TableResult<T>>): T {
  const next = { ...current };
  for (const result of results) {
    if (!result.error && result.data !== null) {
      (next as Record<keyof T, T[keyof T]>)[result.tableName] = result.data;
    }
  }
  return next;
}

export function replaceProjectRows<T extends { project_id: string }>(current: T[], projectId: string, rows: T[]): T[] {
  return [...current.filter((row) => row.project_id !== projectId), ...rows];
}

export function shouldApplyRefresh(startVersion: number, currentVersion: number, requestId: number, latestRequestId: number) {
  return startVersion === currentVersion && requestId === latestRequestId;
}
