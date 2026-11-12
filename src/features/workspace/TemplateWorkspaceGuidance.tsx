import { useEffect, useState } from "react";
import { Save } from "lucide-react";

export function TemplateWorkspaceGuidance({ baseUrl, templateId }: { baseUrl: string; templateId: string }) {
  const [guidance, setGuidance] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`${baseUrl}/api/journey-templates/${encodeURIComponent(templateId)}/workspace-guidance`)
      .then(async (response) => {
        const body = await response.json() as { data?: { guidance: string }; error?: string };
        if (!response.ok || !body.data) throw new Error(body.error || "Falha ao carregar orientação.");
        if (active) { setGuidance(body.data.guidance); setMessage(""); }
      }).catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Falha ao carregar."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [baseUrl, templateId]);

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`${baseUrl}/api/journey-templates/${encodeURIComponent(templateId)}/workspace-guidance`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ guidance }),
      });
      const body = await response.json() as { data?: { guidance: string }; error?: string };
      if (!response.ok || !body.data) throw new Error(body.error || "Falha ao salvar orientação.");
      setGuidance(body.data.guidance);
      setMessage("Orientação salva.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao salvar."); }
    finally { setSaving(false); }
  }

  return <section className="template-workspace-guidance"><h3>Etapa 0: Local de trabalho</h3><p>Obrigatoria em todos os projetos. Personalize apenas a orientação, sem cadastrar caminhos do projeto no template.</p><label>Orientação do template<textarea rows={3} maxLength={4000} value={guidance} disabled={loading} onChange={(event) => setGuidance(event.target.value)} /></label><div className="inline-actions"><button className="secondary-button" type="button" disabled={loading || saving} onClick={() => void save()}><Save size={16} /> {saving ? "Salvando..." : "Salvar orientação"}</button>{message && <span role="status">{message}</span>}</div></section>;
}
