type ProjectTypeRef = { id: string; name: string };
type TemplateRef = { id: string; name: string; project_type_id: string | null; project_modality_id?: string | null; status: string; context: string };

export function templateTypeName(template: Pick<TemplateRef, "project_type_id">, types: ProjectTypeRef[]) {
  if (!template.project_type_id) return "Sem tipo definido";
  return types.find((type) => type.id === template.project_type_id)?.name ?? "Tipo indisponivel";
}

export function availableProjectTemplates<T extends TemplateRef>(templates: T[], projectTypeId: string, projectModalityId = "") {
  return templates.filter((template) =>
    template.status === "ativo"
    && (template.context === "projeto" || template.context === "geral")
    && (!projectTypeId || !template.project_type_id || template.project_type_id === projectTypeId)
    && (!projectModalityId || !template.project_modality_id || template.project_modality_id === projectModalityId),
  );
}

export function templateAfterTypeChange(templateId: string, projectTypeId: string, projectModalityId: string, templates: TemplateRef[]) {
  return availableProjectTemplates(templates, projectTypeId, projectModalityId).some((template) => template.id === templateId) ? templateId : "";
}
