export const STEP_SCHEMA_VERSION = 1;

export const STEP_BLOCK_TYPES = [
  "section",
  "short_text",
  "long_text",
  "checklist",
  "file_upload",
  "prompt",
  "date",
  "due_date",
  "select",
  "status",
  "responsible",
  "link",
  "comment",
  "number",
  "currency",
  "percentage",
  "progress",
  "approval",
  "table",
  "priority",
  "condition",
  "action_button",
  "calculated",
] as const;

export type StepBlockType = (typeof STEP_BLOCK_TYPES)[number];
export type StepOwnerType = "project" | "client" | "template";
export type StepStructureState = "draft" | "published" | "archived";
export type IssueSeverity = "error" | "warning";

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "in"
  | "not_in"
  | "contains"
  | "greater_than"
  | "greater_or_equal"
  | "less_than"
  | "less_or_equal"
  | "is_empty"
  | "is_not_empty";

export type ConditionClause = {
  blockKey: string;
  operator: ConditionOperator;
  value?: unknown;
};

export type ConditionGroup = {
  mode: "all" | "any";
  clauses: ConditionClause[];
};

export type ChecklistItemDefinition = {
  id: string;
  label: string;
  order: number;
  required: boolean;
  requiresFile: boolean;
  acceptedFileTypes: string[];
  responsibleId?: string | null;
  dueDays?: number | null;
  impactsProgress?: boolean;
};

export type SelectOption = {
  id: string;
  label: string;
  value: string;
  color?: string;
};

export type TableColumn = {
  id: string;
  label: string;
  type: "text" | "number" | "currency" | "date" | "status";
  required?: boolean;
};

export type StepBlockConfig = {
  mode?: "display" | "input";
  content?: string;
  placeholder?: string;
  helpText?: string;
  errorMessage?: string;
  maxLength?: number | null;
  rows?: number;
  richText?: boolean;
  items?: ChecklistItemDefinition[];
  completionMode?: "all_required" | "all" | "partial";
  acceptedFileTypes?: string[];
  maxFiles?: number;
  maxFileSizeMb?: number;
  requireDescription?: boolean;
  keepVersions?: boolean;
  promptId?: string | null;
  toolId?: string | null;
  toolNameSnapshot?: string;
  contentSnapshot?: string;
  expectedOutput?: string;
  executionMode?: "manual" | "automatic";
  saveResultToBlockKey?: string | null;
  allowPast?: boolean;
  allowFuture?: boolean;
  minDate?: string | null;
  maxDate?: string | null;
  alertDaysBefore?: number;
  allowExtension?: boolean;
  options?: SelectOption[];
  multiple?: boolean;
  defaultValue?: unknown;
  currency?: string;
  minimum?: number | null;
  maximum?: number | null;
  decimals?: number;
  progressSource?: "manual" | "checklist" | "step";
  approverUserId?: string | null;
  requireRejectionReason?: boolean;
  columns?: TableColumn[];
  minimumRows?: number;
  action?: "complete_step" | "open_url" | "copy_text" | "set_status";
  actionValue?: string;
  confirmationMessage?: string;
  condition?: ConditionGroup | null;
  calculation?: {
    operation: "sum" | "average" | "count";
    sourceBlockKeys: string[];
  };
  [key: string]: unknown;
};

export type StepBlock = {
  id: string;
  type: StepBlockType;
  order: number;
  title: string;
  description?: string;
  required: boolean;
  visible: boolean;
  editableInExecution: boolean;
  collapsedByDefault: boolean;
  config: StepBlockConfig;
};

export type CompletionRuleType =
  | "required_blocks_completed"
  | "all_required_checklist_items_checked"
  | "required_files_uploaded"
  | "required_prompts_completed"
  | "required_approvals_granted"
  | "required_fields_filled"
  | "no_blocking_status"
  | "custom_condition_met";

export type CompletionRule = {
  id: string;
  type: CompletionRuleType;
  enabled: boolean;
  message?: string;
  config?: Record<string, unknown>;
};

export type StepDocument = {
  schemaVersion: number;
  ownerType: StepOwnerType;
  projectId?: string;
  clientId?: string;
  templateId?: string;
  stepId: string;
  structureId: string;
  title: string;
  status: string;
  state: StepStructureState;
  versionNumber: number;
  revision: number;
  blocks: StepBlock[];
  completionRules: CompletionRule[];
};

export type StepValueRecord = {
  blockKey: string;
  value: unknown;
  completionState?: string | null;
  updatedAt?: string | null;
};

export type StepFileRecord = {
  id: string;
  blockKey: string;
  itemKey?: string | null;
  name: string;
  contentType?: string | null;
  sizeBytes: number;
  versionNumber: number;
  description?: string | null;
  approvalStatus?: string | null;
  url: string;
  createdAt: string;
};

export type ValidationIssue = {
  severity: IssueSeverity;
  code: string;
  message: string;
  blockId?: string;
  itemId?: string;
};

export type CompletionReason = {
  code: string;
  message: string;
  blockId?: string;
  itemId?: string;
};

export type CompletionResult = {
  canComplete: boolean;
  progress: number;
  blockingReasons: CompletionReason[];
};

const blockTypeSet = new Set<string>(STEP_BLOCK_TYPES);
const allowedActions = new Set(["complete_step", "open_url", "copy_text", "set_status"]);

export function createId(prefix = "item") {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function createDefaultRule(type: CompletionRuleType): CompletionRule {
  return { id: createId("rule"), type, enabled: true };
}

export function createBlock(type: StepBlockType, order: number): StepBlock {
  const base: StepBlock = {
    id: createId("block"),
    type,
    order,
    title: blockTypeLabel(type),
    description: "",
    required: false,
    visible: true,
    editableInExecution: true,
    collapsedByDefault: false,
    config: {},
  };

  if (type === "section") {
    return { ...base, editableInExecution: false, config: { content: "" } };
  }

  if (type === "long_text") {
    return { ...base, config: { mode: "input", rows: 5, maxLength: null } };
  }

  if (type === "short_text") {
    return { ...base, config: { placeholder: "", maxLength: 180 } };
  }

  if (type === "checklist") {
    return { ...base, config: { completionMode: "all_required", items: [] } };
  }

  if (type === "file_upload") {
    return {
      ...base,
      config: {
        acceptedFileTypes: ["pdf", "jpg", "jpeg", "png", "docx", "xlsx"],
        maxFiles: 5,
        maxFileSizeMb: 25,
        keepVersions: true,
      },
    };
  }

  if (type === "prompt") {
    return {
      ...base,
      config: {
        promptId: null,
        toolId: null,
        toolNameSnapshot: "",
        contentSnapshot: "",
        expectedOutput: "",
        executionMode: "manual",
      },
    };
  }

  if (["select", "status", "priority"].includes(type)) {
    return { ...base, config: { options: [], multiple: false } };
  }

  if (type === "due_date") {
    return { ...base, config: { alertDaysBefore: 3, allowExtension: true } };
  }

  if (["number", "currency", "percentage"].includes(type)) {
    return {
      ...base,
      config: {
        minimum: type === "percentage" ? 0 : null,
        maximum: type === "percentage" ? 100 : null,
        decimals: 2,
        currency: type === "currency" ? "BRL" : undefined,
      },
    };
  }

  if (type === "progress") {
    return { ...base, editableInExecution: false, config: { progressSource: "step" } };
  }

  if (type === "approval") {
    return { ...base, config: { approverUserId: null, requireRejectionReason: true } };
  }

  if (type === "table") {
    return { ...base, config: { columns: [], minimumRows: 0 } };
  }

  if (type === "condition") {
    return { ...base, editableInExecution: false, config: { condition: { mode: "all", clauses: [] } } };
  }

  if (type === "action_button") {
    return { ...base, editableInExecution: false, config: { action: "complete_step", confirmationMessage: "" } };
  }

  if (type === "calculated") {
    return { ...base, editableInExecution: false, config: { calculation: { operation: "sum", sourceBlockKeys: [] } } };
  }

  return base;
}

export function blockTypeLabel(type: StepBlockType) {
  const labels: Record<StepBlockType, string> = {
    section: "Secao",
    short_text: "Texto curto",
    long_text: "Texto longo",
    checklist: "Checklist",
    file_upload: "Arquivos",
    prompt: "Prompt de IA",
    date: "Data",
    due_date: "Prazo",
    select: "Selecao",
    status: "Status",
    responsible: "Responsavel",
    link: "Link",
    comment: "Comentarios",
    number: "Numero",
    currency: "Valor",
    percentage: "Percentual",
    progress: "Progresso",
    approval: "Aprovacao",
    table: "Tabela",
    priority: "Prioridade",
    condition: "Condicao",
    action_button: "Botao de acao",
    calculated: "Campo calculado",
  };

  return labels[type];
}

export function normalizeDocument(document: StepDocument): StepDocument {
  const blocks = [...document.blocks]
    .sort((left, right) => left.order - right.order)
    .map((block, index) => ({ ...block, order: index + 1 }));

  return {
    ...document,
    schemaVersion: STEP_SCHEMA_VERSION,
    blocks,
    completionRules: document.completionRules ?? [],
  };
}

export function cloneDocument(document: StepDocument): StepDocument {
  return JSON.parse(JSON.stringify(document)) as StepDocument;
}

export function validateStepDocument(document: StepDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!document.title.trim()) {
    issues.push({ severity: "error", code: "step_title_missing", message: "Informe o titulo da etapa." });
  }

  if (document.schemaVersion !== STEP_SCHEMA_VERSION) {
    issues.push({
      severity: "error",
      code: "schema_version_invalid",
      message: `Versao de estrutura nao suportada: ${document.schemaVersion}.`,
    });
  }

  const ids = new Set<string>();
  const orders = new Set<number>();

  for (const block of document.blocks) {
    if (!blockTypeSet.has(block.type)) {
      issues.push({ severity: "error", code: "block_type_invalid", message: "Tipo de bloco desconhecido.", blockId: block.id });
    }

    if (!block.title.trim()) {
      issues.push({ severity: "error", code: "block_title_missing", message: "Todo bloco precisa de titulo.", blockId: block.id });
    }

    if (ids.has(block.id)) {
      issues.push({ severity: "error", code: "block_id_duplicate", message: "Ha blocos com o mesmo ID.", blockId: block.id });
    }

    if (orders.has(block.order)) {
      issues.push({ severity: "error", code: "block_order_duplicate", message: "Ha blocos na mesma ordem.", blockId: block.id });
    }

    ids.add(block.id);
    orders.add(block.order);

    if (block.type === "prompt" && block.required && !String(block.config.contentSnapshot ?? "").trim() && !block.config.promptId) {
      issues.push({
        severity: "error",
        code: "prompt_content_missing",
        message: "Prompt obrigatorio precisa de conteudo ou vinculo com a biblioteca.",
        blockId: block.id,
      });
    }

    if (block.type === "checklist") {
      const items = block.config.items ?? [];
      const itemIds = new Set<string>();

      for (const item of items) {
        if (!item.label.trim()) {
          issues.push({ severity: "error", code: "checklist_label_missing", message: "Item de checklist sem nome.", blockId: block.id, itemId: item.id });
        }

        if (itemIds.has(item.id)) {
          issues.push({ severity: "error", code: "checklist_id_duplicate", message: "Item de checklist duplicado.", blockId: block.id, itemId: item.id });
        }

        itemIds.add(item.id);
      }

      if (items.length === 0) {
        issues.push({ severity: "warning", code: "checklist_empty", message: "Checklist sem itens.", blockId: block.id });
      }
    }

    if (block.type === "file_upload" && block.required && (block.config.acceptedFileTypes ?? []).length === 0) {
      issues.push({ severity: "error", code: "file_types_missing", message: "Defina ao menos um tipo de arquivo aceito.", blockId: block.id });
    }

    if (block.type === "approval" && block.required && !block.config.approverUserId) {
      issues.push({ severity: "error", code: "approver_missing", message: "Aprovacao obrigatoria precisa de aprovador.", blockId: block.id });
    }

    if (block.type === "action_button" && !allowedActions.has(String(block.config.action ?? ""))) {
      issues.push({ severity: "error", code: "action_invalid", message: "Botao sem acao permitida.", blockId: block.id });
    }

    const condition = block.config.condition;

    if (condition) {
      for (const clause of condition.clauses) {
        if (!document.blocks.some((candidate) => candidate.id === clause.blockKey)) {
          issues.push({ severity: "error", code: "condition_reference_missing", message: "Condicao referencia um bloco inexistente.", blockId: block.id });
        }
      }
    }

    if (block.required && !block.visible && !condition) {
      issues.push({ severity: "error", code: "required_hidden", message: "Bloco obrigatorio nao pode ficar sempre oculto.", blockId: block.id });
    }
  }

  if (!document.blocks.some(isProgressBlock)) {
    issues.push({ severity: "warning", code: "no_progress_blocks", message: "Nenhum bloco entra no calculo de progresso." });
  }

  return issues;
}

export function evaluateCondition(condition: ConditionGroup | null | undefined, values: Record<string, unknown>) {
  if (!condition || condition.clauses.length === 0) {
    return true;
  }

  const results = condition.clauses.map((clause) => evaluateClause(clause, values[clause.blockKey]));
  return condition.mode === "any" ? results.some(Boolean) : results.every(Boolean);
}

export function isBlockVisible(block: StepBlock, values: Record<string, unknown>) {
  return block.visible && evaluateCondition(block.config.condition, values);
}

export function calculateCompletion(
  document: StepDocument,
  valueRecords: StepValueRecord[],
  files: StepFileRecord[],
): CompletionResult {
  const values = Object.fromEntries(valueRecords.map((record) => [record.blockKey, record.value]));
  const visibleBlocks = document.blocks.filter((block) => isBlockVisible(block, values));
  const reasons: CompletionReason[] = [];
  let total = 0;
  let completed = 0;

  for (const block of visibleBlocks) {
    if (!isProgressBlock(block)) {
      continue;
    }

    if (block.type === "checklist") {
      const items = block.config.items ?? [];
      const state = asObject(values[block.id]);
      const itemState = asObject(state.items);

      for (const item of items.filter((entry) => entry.required || entry.impactsProgress !== false)) {
        total += 1;
        const checked = Boolean(itemState[item.id]);
        const hasFile = !item.requiresFile || files.some((file) => file.blockKey === block.id && file.itemKey === item.id);

        if (checked && hasFile) {
          completed += 1;
        } else if (item.required) {
          reasons.push({
            code: item.requiresFile && !hasFile ? "required_file_missing" : "checklist_item_missing",
            blockId: block.id,
            itemId: item.id,
            message: item.requiresFile && !hasFile
              ? `Anexe a evidencia de ${item.label}.`
              : `Conclua o item ${item.label}.`,
          });
        }
      }

      continue;
    }

    total += 1;
    const value = values[block.id];
    const done = isBlockComplete(block, value, files);

    if (done) {
      completed += 1;
    } else if (block.required) {
      reasons.push({
        code: reasonCodeForBlock(block),
        blockId: block.id,
        message: block.config.errorMessage?.toString() || `Preencha ${block.title}.`,
      });
    }
  }

  for (const rule of document.completionRules.filter((candidate) => candidate.enabled)) {
    if (rule.type === "custom_condition_met") {
      const condition = rule.config?.condition as ConditionGroup | undefined;

      if (!evaluateCondition(condition, values)) {
        reasons.push({ code: "custom_condition_failed", message: rule.message || "Uma condicao obrigatoria nao foi atendida." });
      }
    }

    if (rule.type === "no_blocking_status" && document.status === "bloqueado") {
      reasons.push({ code: "step_blocked", message: rule.message || "A etapa esta bloqueada." });
    }
  }

  const uniqueReasons = Array.from(new Map(reasons.map((reason) => [`${reason.code}:${reason.blockId ?? ""}:${reason.itemId ?? ""}`, reason])).values());
  const progress = total === 0 ? 0 : Math.round((completed / total) * 100);

  return {
    canComplete: uniqueReasons.length === 0,
    progress,
    blockingReasons: uniqueReasons,
  };
}

function evaluateClause(clause: ConditionClause, actual: unknown) {
  const expected = clause.value;

  switch (clause.operator) {
    case "equals":
      return actual === expected;
    case "not_equals":
      return actual !== expected;
    case "in":
      return Array.isArray(expected) && expected.includes(actual);
    case "not_in":
      return Array.isArray(expected) && !expected.includes(actual);
    case "contains":
      return Array.isArray(actual) ? actual.includes(expected) : String(actual ?? "").includes(String(expected ?? ""));
    case "greater_than":
      return Number(actual) > Number(expected);
    case "greater_or_equal":
      return Number(actual) >= Number(expected);
    case "less_than":
      return Number(actual) < Number(expected);
    case "less_or_equal":
      return Number(actual) <= Number(expected);
    case "is_empty":
      return isEmpty(actual);
    case "is_not_empty":
      return !isEmpty(actual);
    default:
      return false;
  }
}

function isProgressBlock(block: StepBlock) {
  if (!block.required && ["section", "condition", "action_button", "calculated", "progress"].includes(block.type)) {
    return false;
  }

  return !["section", "condition", "action_button", "calculated", "progress"].includes(block.type);
}

function isBlockComplete(block: StepBlock, value: unknown, files: StepFileRecord[]) {
  if (block.type === "file_upload") {
    return files.some((file) => file.blockKey === block.id);
  }

  if (block.type === "prompt") {
    return Boolean(asObject(value).completed);
  }

  if (block.type === "approval") {
    return asObject(value).status === "aprovado";
  }

  if (block.type === "comment") {
    return Array.isArray(value) ? value.length > 0 : !isEmpty(value);
  }

  if (block.type === "table") {
    const rows = Array.isArray(value) ? value : [];
    return rows.length >= Number(block.config.minimumRows ?? (block.required ? 1 : 0));
  }

  return !isEmpty(value);
}

function reasonCodeForBlock(block: StepBlock) {
  if (block.type === "file_upload") return "required_file_missing";
  if (block.type === "prompt") return "required_prompt_missing";
  if (block.type === "approval") return "required_approval_missing";
  return "required_field_missing";
}

function isEmpty(value: unknown) {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}
