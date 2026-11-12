import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, CalendarRange, CheckCircle2, ClipboardCopy, FolderOpen, Loader2, PlusCircle, RefreshCw, Users } from "lucide-react";
import { PageHeader } from "../shell/AppSidebar";
import { addDays, formatWeeklySummary, teamDay, type DeliveryPerson, type DeliveryProject, type DeliveryReport, type DeliveryWeek } from "../../../shared/deliveries";
import { copyText } from "../../components/ui/clipboard";

type OpenProject = { id: string; name: string; company: string | null; responsible: string | null; responsible_user_id?: string | null; status: string; updated_at: string };

const shortDate = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const weekLabel = (week: DeliveryWeek) => `${shortDate(week.start)} – ${shortDate(week.end)}`;
const dateTime = (iso: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const weekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function sameName(a: string | null | undefined, b: string | null | undefined) {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase() && Boolean((a ?? "").trim());
}

function relative(iso: string | null) {
  if (!iso) return "Sem registro";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "Hoje";
  if (days === 1) return "Ontem";
  return `Há ${days} dias`;
}

function Delta({ current, previous }: { current: number; previous: number | undefined }) {
  if (previous === undefined || current === previous) return <span className="rj-delta is-flat">= semana anterior</span>;
  const up = current > previous;
  return <span className={`rj-delta ${up ? "is-up" : "is-down"}`}>{up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(current - previous)} vs anterior</span>;
}

function ProjectList({ title, icon, items, empty, onOpen, showBy }: { title: string; icon: React.ReactNode; items: DeliveryProject[]; empty: string; onOpen: (id: string) => void; showBy?: boolean }) {
  return (
    <section className="rj-card rj-delivery-list">
      <header>{icon}<h3>{title}</h3><span>{items.length}</span></header>
      {items.length === 0 ? <p className="rj-muted">{empty}</p> : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => onOpen(item.id)}>
                <span className="rj-delivery-name"><strong>{item.name}</strong><small>{item.company ?? "Sem cliente"}</small></span>
                <span className="rj-delivery-meta">
                  <small>{showBy ? (item.by || item.responsible || "—") : (item.responsible || "—")}</small>
                  <small>{item.estimated ? <em title="Concluído antes do registro automático de data; dia estimado pela última atividade.">data estimada</em> : dateTime(item.at)}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WeekChart({ weeks, selected, onSelect }: { weeks: DeliveryWeek[]; selected: string; onSelect: (start: string) => void }) {
  const max = Math.max(1, ...weeks.map((week) => Math.max(week.created.length, week.completed.length)));
  return (
    <div className="rj-week-chart" role="list" aria-label="Jornadas por semana">
      {weeks.map((week) => (
        <button key={week.start} type="button" role="listitem" className={`rj-week-col ${week.start === selected ? "is-selected" : ""}`} onClick={() => onSelect(week.start)} title={`${weekLabel(week)}: ${week.created.length} criada(s), ${week.completed.length} concluída(s)`}>
          <span className="rj-week-bars">
            <span className="rj-bar is-created" style={{ height: `${(week.created.length / max) * 100}%` }}><b>{week.created.length || ""}</b></span>
            <span className="rj-bar is-completed" style={{ height: `${(week.completed.length / max) * 100}%` }}><b>{week.completed.length || ""}</b></span>
          </span>
          <small>{shortDate(week.start)}</small>
        </button>
      ))}
    </div>
  );
}

function TeamTable({ people, week, previous }: { people: DeliveryPerson[]; week: DeliveryWeek; previous?: DeliveryWeek }) {
  const today = teamDay(Date.now());
  const days = Array.from({ length: 14 }, (_, index) => addDays(today, index - 13));
  const rows = people.filter((person) => person.weeks[week.start] || (previous && person.weeks[previous.start]) || Object.keys(person.days).length);
  const maxDay = Math.max(1, ...rows.flatMap((person) => Object.values(person.days)));
  if (!rows.length) return <p className="rj-muted">Sem atividade registrada no período.</p>;
  return (
    <div className="rj-team-table" role="table">
      <div className="rj-team-row is-head" role="row">
        <span role="columnheader">Pessoa</span>
        <span role="columnheader" title="Projetos concluídos na semana">Entregas</span>
        <span role="columnheader" title="Jornadas novas sob sua responsabilidade">Novas</span>
        <span role="columnheader" title="Projetos em que registrou algo na semana">Projetos mov.</span>
        <span role="columnheader" title="Blocos preenchidos, arquivos e links registrados">Registros</span>
        <span role="columnheader">Últimos 14 dias</span>
        <span role="columnheader">Última atividade</span>
      </div>
      {rows.map((person) => {
        const stats = person.weeks[week.start] ?? { created: 0, completed: 0, activities: 0, references: 0, projects: 0 };
        const before = previous ? person.weeks[previous.start] : undefined;
        const records = stats.activities + stats.references;
        const beforeRecords = before ? before.activities + before.references : 0;
        return (
          <div className="rj-team-row" role="row" key={person.name}>
            <span className="rj-team-person" role="cell"><span className="rj-avatar is-small">{person.name.slice(0, 1).toUpperCase()}</span>{person.name}</span>
            <span role="cell" data-label="Entregas"><strong>{stats.completed}</strong></span>
            <span role="cell" data-label="Novas"><strong>{stats.created}</strong></span>
            <span role="cell" data-label="Projetos mov."><strong>{stats.projects}</strong></span>
            <span role="cell" data-label="Registros"><strong>{records}</strong>{previous && <Delta current={records} previous={beforeRecords} />}</span>
            <span className="rj-heat" role="cell" aria-label="Atividade nos últimos 14 dias">
              {days.map((day) => {
                const value = person.days[day] ?? 0;
                const level = value === 0 ? 0 : Math.min(4, Math.ceil((value / maxDay) * 4));
                return <i key={day} className={`l${level}`} title={`${shortDate(day)} (${weekdays[(new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7]}): ${value} registro(s)`} />;
              })}
            </span>
            <span role="cell" data-label="Última atividade" className="rj-muted">{relative(person.lastActivity)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function DeliveriesView({ baseUrl, currentUserName, currentUserId, openProjects, onOpenProject }: {
  baseUrl: string;
  currentUserName: string;
  currentUserId: string;
  openProjects: OpenProject[];
  onOpenProject: (id: string) => void;
}) {
  const [weeksCount, setWeeksCount] = useState(12);
  const [report, setReport] = useState<DeliveryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [tab, setTab] = useState<"team" | "mine">(() => {
    try { return localStorage.getItem("rj_deliveries_tab") === "mine" ? "mine" : "team"; } catch { return "team"; }
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${baseUrl}/api/deliveries?weeks=${weeksCount}`, { cache: "no-store" });
      const body = await response.json() as { data?: DeliveryReport; error?: string };
      if (!response.ok || !body.data) throw new Error(body.error || "Não foi possível carregar as entregas.");
      setReport(body.data);
      setSelected((current) => body.data!.weeks.some((week) => week.start === current) ? current : body.data!.weeks[body.data!.weeks.length - 1].start);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar as entregas.");
    } finally {
      setLoading(false);
    }
  }, [baseUrl, weeksCount]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { try { localStorage.setItem("rj_deliveries_tab", tab); } catch { /* preference only */ } }, [tab]);

  const index = report ? report.weeks.findIndex((week) => week.start === selected) : -1;
  const week = report && index >= 0 ? report.weeks[index] : null;
  const previous = report && index > 0 ? report.weeks[index - 1] : undefined;

  const mine = useMemo(() => {
    if (!report || !week) return null;
    const me = report.people.find((person) => sameName(person.name, currentUserName));
    const stats = me?.weeks[week.start] ?? { created: 0, completed: 0, activities: 0, references: 0, projects: 0 };
    const completed = week.completed.filter((item) => sameName(item.by, currentUserName) || (!item.by && sameName(item.responsible, currentUserName)));
    const created = week.created.filter((item) => sameName(item.responsible, currentUserName));
    const open = openProjects
      .filter((project) => project.status !== "concluido" && project.status !== "arquivado" && (project.responsible_user_id === currentUserId || sameName(project.responsible, currentUserName)))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return { me, stats, completed, created, open };
  }, [report, week, openProjects, currentUserName, currentUserId]);

  async function copySummary() {
    if (!report || !week) return;
    await copyText(formatWeeklySummary(report, week.start), `Resumo da semana ${weekLabel(week)}`);
  }

  return (
    <div className="rj-deliveries">
      <PageHeader
        title="Entregas"
        subtitle="Jornadas criadas e concluídas por semana (segunda a domingo) e o ritmo da equipe."
        actions={<>
          <label className="rj-select-inline"><CalendarRange size={15} /><select value={weeksCount} onChange={(event) => setWeeksCount(Number(event.target.value))} aria-label="Período">
            <option value={8}>Últimas 8 semanas</option><option value={12}>Últimas 12 semanas</option><option value={26}>Últimas 26 semanas</option>
          </select></label>
          <button className="secondary-button" type="button" onClick={() => void load()} disabled={loading}>{loading ? <Loader2 className="spin" size={15} /> : <RefreshCw size={15} />} Atualizar</button>
          <button className="primary-button" type="button" onClick={() => void copySummary()} disabled={!week}><ClipboardCopy size={15} /> Copiar resumo da semana</button>
        </>}
      >
        <div className="rj-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "team"} className={tab === "team" ? "is-active" : ""} onClick={() => setTab("team")}><Users size={15} /> Equipe</button>
          <button type="button" role="tab" aria-selected={tab === "mine"} className={tab === "mine" ? "is-active" : ""} onClick={() => setTab("mine")}><CheckCircle2 size={15} /> Minha semana</button>
        </div>
      </PageHeader>

      {error && <div className="rj-card rj-error"><span>{error}</span><button className="secondary-button" type="button" onClick={() => void load()}>Tentar novamente</button></div>}
      {!report && loading && <div className="rj-card rj-muted"><Loader2 className="spin" size={16} /> Carregando entregas…</div>}

      {report && week && (
        <>
          <section className="rj-card rj-week-panel">
            <header className="rj-week-panel-head">
              <div><h2>Semana {weekLabel(week)}</h2><p className="rj-muted">Clique numa semana do gráfico para ver os detalhes.</p></div>
              <div className="rj-legend"><span><i className="is-created" />Criadas</span><span><i className="is-completed" />Concluídas</span></div>
            </header>
            <WeekChart weeks={report.weeks} selected={week.start} onSelect={setSelected} />
          </section>

          {tab === "team" ? (
            <>
              <div className="rj-kpis">
                <div className="rj-kpi"><span>Entregues</span><strong>{week.completed.length}</strong><Delta current={week.completed.length} previous={previous?.completed.length} /></div>
                <div className="rj-kpi"><span>Novas jornadas</span><strong>{week.created.length}</strong><Delta current={week.created.length} previous={previous?.created.length} /></div>
                <div className="rj-kpi"><span>Em andamento no fim</span><strong>{week.openAtEnd}</strong><Delta current={week.openAtEnd} previous={previous?.openAtEnd} /></div>
                <div className="rj-kpi"><span>Pessoas ativas</span><strong>{week.activePeople}</strong><Delta current={week.activePeople} previous={previous?.activePeople} /></div>
              </div>
              <div className="rj-delivery-grid">
                <ProjectList title="Entregues na semana" icon={<CheckCircle2 size={17} />} items={week.completed} empty="Nenhum projeto concluído nesta semana." onOpen={onOpenProject} showBy />
                <ProjectList title="Novas jornadas" icon={<PlusCircle size={17} />} items={week.created} empty="Nenhuma jornada criada nesta semana." onOpen={onOpenProject} />
              </div>
              <section className="rj-card">
                <header className="rj-section-head"><Users size={17} /><h3>Engajamento da equipe</h3><span className="rj-muted">Semana {weekLabel(week)}</span></header>
                <TeamTable people={report.people} week={week} previous={previous} />
              </section>
            </>
          ) : mine && (
            <>
              <div className="rj-kpis">
                <div className="rj-kpi"><span>Minhas entregas</span><strong>{mine.completed.length}</strong></div>
                <div className="rj-kpi"><span>Minhas novas jornadas</span><strong>{mine.created.length}</strong></div>
                <div className="rj-kpi"><span>Projetos movimentados</span><strong>{mine.stats.projects}</strong></div>
                <div className="rj-kpi"><span>Registros</span><strong>{mine.stats.activities + mine.stats.references}</strong><span className="rj-delta is-flat">Última atividade: {relative(mine.me?.lastActivity ?? null)}</span></div>
              </div>
              <div className="rj-delivery-grid">
                <ProjectList title="Entreguei nesta semana" icon={<CheckCircle2 size={17} />} items={mine.completed} empty="Nenhuma entrega sua nesta semana." onOpen={onOpenProject} showBy />
                <section className="rj-card rj-delivery-list">
                  <header><FolderOpen size={17} /><h3>Meus projetos em andamento</h3><span>{mine.open.length}</span></header>
                  {mine.open.length === 0 ? <p className="rj-muted">Nenhum projeto em andamento sob sua responsabilidade.</p> : (
                    <ul>
                      {mine.open.map((project) => (
                        <li key={project.id}>
                          <button type="button" onClick={() => onOpenProject(project.id)}>
                            <span className="rj-delivery-name"><strong>{project.name}</strong><small>{project.company ?? "Sem cliente"}</small></span>
                            <span className="rj-delivery-meta"><small>Atualizado</small><small>{relative(project.updated_at)}</small></span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
