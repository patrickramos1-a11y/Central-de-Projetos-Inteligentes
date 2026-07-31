import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return <div className="app-shell">{children}</div>;
}

export function JourneyContextBar({ children }: { children: ReactNode }) {
  return <section className="journey-hero journey-context-bar">{children}</section>;
}

export function StepRail({ children }: { children: ReactNode }) {
  return <aside className="step-rail collapsible-rail">{children}</aside>;
}

export function CommandBar({ mode, children }: { mode: "execute" | "edit"; children: ReactNode }) {
  return <div className={`journey-command-bar mode-${mode}`}>{children}</div>;
}

export function WorkCanvas({ children }: { children: ReactNode }) {
  return <div className="block-canvas">{children}</div>;
}

export function ModeSwitch({ mode, onChange }: { mode: "execute" | "edit"; onChange: (mode: "execute" | "edit") => void }) {
  return (
    <div className="journey-mode-switch" role="group" aria-label="Modo da jornada">
      <button className={mode === "execute" ? "active" : ""} type="button" onClick={() => onChange("execute")}>Executar</button>
      <button className={mode === "edit" ? "active" : ""} type="button" onClick={() => onChange("edit")}>Editar estrutura</button>
    </div>
  );
}
