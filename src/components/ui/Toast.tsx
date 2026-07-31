import { useEffect } from "react";

export type ToastTone = "success" | "info" | "warning" | "error";

export function Toast({ message, tone = "success", onDismiss, duration = 3600 }: { message: string; tone?: ToastTone; onDismiss: () => void; duration?: number }) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timer);
  }, [message, duration, onDismiss]);

  if (!message) return null;
  return <div className={`ui-toast ${tone === "success" ? "" : tone}`} role="status">{message}</div>;
}
