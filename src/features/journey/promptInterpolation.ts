export type JourneyPromptContext = {
  projectName: string | null | undefined;
  company: string | null | undefined;
  projectType: string | null | undefined;
  stepName: string | null | undefined;
  responsible: string | null | undefined;
  context: string | null | undefined;
  summary: string | null | undefined;
  date?: Date;
};

const missingValue = "[nao informado]";

function valueOrFallback(value: string | null | undefined) {
  return value?.trim() || missingValue;
}

export function interpolateJourneyPrompt(template: string, context: JourneyPromptContext) {
  const projectName = valueOrFallback(context.projectName);
  const values: Record<string, string> = {
    projeto: projectName,
    nome_projeto: projectName,
    empresa: valueOrFallback(context.company),
    tipo_projeto: valueOrFallback(context.projectType),
    etapa_atual: valueOrFallback(context.stepName),
    etapa: valueOrFallback(context.stepName),
    responsavel: valueOrFallback(context.responsible),
    data: (context.date ?? new Date()).toLocaleDateString("pt-BR"),
    contexto: valueOrFallback(context.context),
    sumario: valueOrFallback(context.summary),
    sumario_consolidado: valueOrFallback(context.summary),
  };

  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (token, name: string) => values[name.toLowerCase()] ?? token);
}

export const journeyPromptVariableSuggestions = [
  "{{projeto}}", "{{nome_projeto}}", "{{empresa}}", "{{tipo_projeto}}", "{{etapa_atual}}", "{{responsavel}}", "{{data}}", "{{contexto}}", "{{sumario}}",
];
