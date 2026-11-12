import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, FileText, FolderKanban, Route, Search, X } from "lucide-react";

type Named = { id: string; name?: string | null; title?: string | null; company?: string | null; status?: string | null };

type ResultKind = "project" | "client" | "template" | "prompt";
type Result = { kind: ResultKind; id: string; title: string; detail: string };

const kindMeta: Record<ResultKind, { label: string; icon: typeof Search }> = {
  project: { label: "Projeto", icon: FolderKanban },
  client: { label: "Cliente", icon: Building2 },
  template: { label: "Template", icon: Route },
  prompt: { label: "Prompt", icon: FileText },
};

export function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function searchEverything(query: string, sources: { projects: Named[]; clients: Named[]; templates: Named[]; prompts: Named[] }, limit = 24): Result[] {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const matches = (text: string) => {
    const haystack = normalizeSearch(text);
    return terms.every((term) => haystack.includes(term));
  };
  const results: Result[] = [];
  for (const project of sources.projects) {
    const title = project.name ?? "";
    const detail = [project.company, project.status === "concluido" ? "Concluído" : "Em andamento"].filter(Boolean).join(" · ");
    if (matches(`${title} ${project.company ?? ""}`)) results.push({ kind: "project", id: project.id, title, detail });
  }
  for (const client of sources.clients) {
    const title = client.name ?? "";
    if (matches(`${title} ${client.company ?? ""}`)) results.push({ kind: "client", id: client.id, title, detail: client.company ?? "" });
  }
  for (const template of sources.templates) {
    if (template.status === "arquivado") continue;
    const title = template.name ?? "";
    if (matches(title)) results.push({ kind: "template", id: template.id, title, detail: "" });
  }
  for (const prompt of sources.prompts) {
    if (prompt.status === "arquivado") continue;
    const title = prompt.title ?? "";
    if (matches(title)) results.push({ kind: "prompt", id: prompt.id, title, detail: "" });
  }
  return results.slice(0, limit);
}

export function GlobalSearch({ projects, clients, templates, prompts, onClose, onOpenProject, onOpenClient, onOpenTemplate, onOpenPrompt }: {
  projects: Named[];
  clients: Named[];
  templates: Named[];
  prompts: Named[];
  onClose: () => void;
  onOpenProject: (id: string) => void;
  onOpenClient: (id: string) => void;
  onOpenTemplate: (id: string) => void;
  onOpenPrompt: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchEverything(query, { projects, clients, templates, prompts }), [query, projects, clients, templates, prompts]);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => setCursor(0), [query]);

  const open = (result: Result) => {
    if (result.kind === "project") onOpenProject(result.id);
    else if (result.kind === "client") onOpenClient(result.id);
    else if (result.kind === "template") onOpenTemplate(result.id);
    else onOpenPrompt(result.id);
  };

  return (
    <div className="rj-search-overlay" role="dialog" aria-modal="true" aria-label="Busca global" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="rj-search-panel">
        <div className="rj-search-input">
          <Search size={18} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Buscar projetos, clientes, templates e prompts…"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
              if (event.key === "ArrowDown") { event.preventDefault(); setCursor((value) => Math.min(value + 1, results.length - 1)); }
              if (event.key === "ArrowUp") { event.preventDefault(); setCursor((value) => Math.max(value - 1, 0)); }
              if (event.key === "Enter" && results[cursor]) open(results[cursor]);
            }}
          />
          <button className="rj-icon-button" type="button" onClick={onClose} aria-label="Fechar busca"><X size={16} /></button>
        </div>
        <ul className="rj-search-results">
          {query.trim() && results.length === 0 && <li className="rj-search-empty">Nada encontrado para “{query}”.</li>}
          {!query.trim() && <li className="rj-search-empty">Digite para buscar. Use ↑ ↓ e Enter para abrir.</li>}
          {results.map((result, index) => {
            const Icon = kindMeta[result.kind].icon;
            return (
              <li key={`${result.kind}-${result.id}`}>
                <button type="button" className={index === cursor ? "is-active" : ""} onMouseEnter={() => setCursor(index)} onClick={() => open(result)}>
                  <Icon size={16} />
                  <span><strong>{result.title}</strong>{result.detail && <small>{result.detail}</small>}</span>
                  <em>{kindMeta[result.kind].label}</em>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
