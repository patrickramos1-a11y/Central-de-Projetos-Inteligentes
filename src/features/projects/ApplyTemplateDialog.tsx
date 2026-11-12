import { useEffect, useMemo, useState } from "react";
import { Check, Layers3, Loader2, Route, Search, X } from "lucide-react";

type TemplateOption = { id: string; name: string; description: string | null; status: string; project_type_id: string | null; project_modality_id?: string | null };
type TemplateStep = { id: string; journey_template_id: string; name: string; description: string | null; step_order: number; status: string };
export type TemplateApplySelection = { stageId: string; templateStepId: string; name: string; description: string | null };

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Applies a whole template (or part of it) to a project that already exists,
 * e.g. a survey project that started only with the Local de trabalho.
 */
export function ApplyTemplateDialog({ baseUrl, projectName, currentTemplateId, existingStepNames, templates, onClose, onApply }: {
  baseUrl: string;
  projectName: string;
  currentTemplateId: string | null;
  existingStepNames: string[];
  templates: TemplateOption[];
  onClose: () => void;
  onApply: (templateId: string, selections: TemplateApplySelection[]) => Promise<boolean>;
}) {
  const active = useMemo(() => templates.filter((template) => template.status !== "arquivado" && template.status !== "inativo").sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [templates]);
  const [query, setQuery] = useState("");
  const [templateId, setTemplateId] = useState(currentTemplateId && active.some((item) => item.id === currentTemplateId) ? currentTemplateId : "");
  const [steps, setSteps] = useState<TemplateStep[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const existing = useMemo(() => new Set(existingStepNames.map((name) => normalize(name.trim()))), [existingStepNames]);

  useEffect(() => {
    if (!templateId) { setSteps([]); setSelected([]); return; }
    const controller = new AbortController();
    setLoading(true); setError("");
    const params = new URLSearchParams({ filter: "journey_template_id", value: templateId, order: "step_order", ascending: "true", limit: "200" });
    void fetch(`${baseUrl.replace(/\/$/, "")}/api/tables/journey_steps?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { data?: TemplateStep[]; error?: string };
        if (!response.ok || !body.data) throw new Error(body.error || "Não foi possível carregar as etapas do template.");
        const list = body.data.filter((step) => step.status !== "arquivado").sort((a, b) => a.step_order - b.step_order);
        setSteps(list);
        // Pre-select everything that is not already in the project.
        setSelected(list.filter((step) => !existing.has(normalize(step.name.trim()))).map((step) => step.id));
      })
      .catch((failure) => { if (!(failure instanceof DOMException && failure.name === "AbortError")) setError(failure instanceof Error ? failure.message : "Falha ao carregar o template."); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [baseUrl, templateId, existing]);

  const visible = active.filter((template) => normalize(`${template.name} ${template.description ?? ""}`).includes(normalize(query)));
  const chosen = active.find((template) => template.id === templateId) ?? null;

  async function apply() {
    const selections = steps.filter((step) => selected.includes(step.id)).map((step) => ({ stageId: "", templateStepId: step.id, name: step.name, description: step.description }));
    if (!chosen || !selections.length) return;
    setBusy(true); setError("");
    const ok = await onApply(chosen.id, selections);
    setBusy(false);
    if (!ok) setError("Nem todas as etapas foram aplicadas. As etapas criadas foram mantidas.");
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="rj-dialog rj-apply-template" role="dialog" aria-modal="true" aria-label="Aplicar template ao projeto" onMouseDown={(event) => event.stopPropagation()}>
        <header className="rj-dialog-head">
          <div><span className="eyebrow">{projectName}</span><h2>Aplicar template</h2><p>Escolha um template e as etapas que entram na jornada. O Local de trabalho e as etapas atuais são mantidos.</p></div>
          <button className="rj-icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </header>
        <div className="rj-apply-body">
          <div className="rj-apply-col">
            <label className="rj-search-box"><Search size={16} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar template" /></label>
            <ul className="rj-choice-list">
              {visible.map((template) => (
                <li key={template.id}>
                  <button type="button" className={template.id === templateId ? "is-active" : ""} onClick={() => setTemplateId(template.id)}>
                    <Route size={16} />
                    <span><strong>{template.name}</strong>{template.description && <small>{template.description}</small>}</span>
                    {template.id === templateId && <Check size={16} />}
                  </button>
                </li>
              ))}
              {!visible.length && <li className="rj-muted">Nenhum template encontrado.</li>}
            </ul>
          </div>
          <div className="rj-apply-col">
            {!chosen && <p className="rj-muted">Selecione um template para ver as etapas.</p>}
            {chosen && (
              <>
                <div className="rj-apply-steps-head">
                  <strong>Etapas de {chosen.name}</strong>
                  {steps.length > 0 && <button className="rj-link-button" type="button" onClick={() => setSelected(selected.length === steps.length ? [] : steps.map((step) => step.id))}>{selected.length === steps.length ? "Desmarcar todas" : "Marcar todas"}</button>}
                </div>
                {loading && <p className="rj-muted"><Loader2 className="spin" size={15} /> Carregando etapas…</p>}
                {!loading && !steps.length && <p className="rj-muted">Este template ainda não tem etapas.</p>}
                <ol className="rj-step-checks">
                  {steps.map((step) => {
                    const already = existing.has(normalize(step.name.trim()));
                    return (
                      <li key={step.id}>
                        <label>
                          <input type="checkbox" checked={selected.includes(step.id)} disabled={busy} onChange={(event) => setSelected((current) => event.target.checked ? [...current, step.id] : current.filter((id) => id !== step.id))} />
                          <span><strong>{step.name}</strong>{already ? <small className="is-warning">Já existe uma etapa com este nome no projeto</small> : step.description && <small>{step.description}</small>}</span>
                        </label>
                      </li>
                    );
                  })}
                </ol>
              </>
            )}
          </div>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer className="rj-dialog-foot">
          <button className="secondary-button" type="button" onClick={onClose}>Cancelar</button>
          <button className="primary-button" type="button" disabled={busy || !chosen || !selected.length} onClick={() => void apply()}>{busy ? <Loader2 className="spin" size={16} /> : <Layers3 size={16} />} Aplicar {selected.length ? `${selected.length} etapa(s)` : "template"}</button>
        </footer>
      </section>
    </div>
  );
}
