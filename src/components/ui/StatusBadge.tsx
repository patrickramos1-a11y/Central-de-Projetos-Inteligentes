import type { ReactNode } from "react";

export type StatusTone = "pending" | "active" | "complete" | "warning" | "danger";

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <span className={`ui-status-badge ${tone}`}>{children}</span>;
}
