export type SummaryParseInput = {
  rawText: string;
};

export type ParsedSummaryItem = {
  id: string;
  topicNumber: string;
  title: string;
  level: number;
  parentTopicNumber: string | null;
  originalText: string;
  sortOrder: number;
  selected: boolean;
  confidence: number;
  warning?: string;
};

export type SummaryParseWarning = {
  lineNumber: number;
  text: string;
  message: string;
};

export type SummaryParseResult = {
  items: ParsedSummaryItem[];
  warnings: SummaryParseWarning[];
  consolidatedPreview: string;
};

const numberedTopicPattern = /^\s*(\d+(?:\.\d+)*)(?:\s*[.)]\s+|\s*[-–—]\s*|\s+)(.+?)\s*$/;

export function parseProjectSummary(input: SummaryParseInput): SummaryParseResult {
  const warnings: SummaryParseWarning[] = [];
  const items: ParsedSummaryItem[] = [];
  const lines = input.rawText.split(/\r?\n/);

  lines.forEach((line, index) => {
    const originalText = line.trim();

    if (!originalText) {
      return;
    }

    const match = originalText.match(numberedTopicPattern);

    if (!match) {
      warnings.push({
        lineNumber: index + 1,
        text: originalText,
        message: "Linha ignorada: nao segue a numeracao do MVP.",
      });
      return;
    }

    const topicNumber = match[1];
    const title = cleanTopicTitle(match[2]);
    const parts = topicNumber.split(".");
    const parentTopicNumber = parts.length > 1 ? parts.slice(0, -1).join(".") : null;

    items.push({
      id: `parsed-${index + 1}`,
      topicNumber,
      title,
      level: parts.length,
      parentTopicNumber,
      originalText,
      sortOrder: items.length + 1,
      selected: true,
      confidence: title ? 0.95 : 0.72,
      warning: title ? undefined : "Titulo vazio apos limpeza.",
    });
  });

  return {
    items,
    warnings,
    consolidatedPreview: buildConsolidatedSummaryText(items),
  };
}

export function buildConsolidatedSummaryText(items: Array<Pick<ParsedSummaryItem, "topicNumber" | "title" | "level" | "selected" | "sortOrder">>) {
  return [...items]
    .filter((item) => item.selected)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((item) => `${"  ".repeat(Math.max(0, item.level - 1))}${item.topicNumber} ${item.title}`.trimEnd())
    .join("\n");
}

function cleanTopicTitle(value: string) {
  return value
    .replace(/\.{2,}\s*\d+\s*$/, "")
    .replace(/\s+\d+\s*$/, "")
    .trim();
}
