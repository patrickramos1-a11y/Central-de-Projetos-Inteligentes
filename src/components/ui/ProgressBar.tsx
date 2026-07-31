export function ProgressBar({ value, label, detail }: { value: number; label?: string; detail?: string }) {
  const safeValue = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div className="ui-progress" aria-label={label ?? "Progresso"}>
      {(label || detail) && <div className="ui-progress-header"><span>{label}</span><span>{detail ?? `${safeValue}%`}</span></div>}
      <div className="ui-progress-track" aria-hidden="true"><span style={{ width: `${safeValue}%` }} /></div>
    </div>
  );
}
