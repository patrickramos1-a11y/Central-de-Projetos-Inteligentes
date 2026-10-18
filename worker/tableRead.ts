export type TableReadQuery = {
  sql: string;
  bindings: Array<string | number>;
};

export function buildTableReadQuery(tableName: string, columns: string[], url: URL): TableReadQuery | null {
  const selected = url.searchParams.get("select");
  const selectedColumns = selected && selected !== "*" ? selected.split(",").map((column) => column.trim()) : ["*"];
  const filterColumn = url.searchParams.get("filter");
  const filterValue = url.searchParams.get("value");
  const order = url.searchParams.get("order") || "created_at";
  const limitText = url.searchParams.get("limit");
  const offsetText = url.searchParams.get("offset");

  if (!selectedColumns.length || selectedColumns.some((column) => column !== "*" && !columns.includes(column))) return null;
  if (selectedColumns.includes("*") && selectedColumns.length > 1) return null;
  if ((filterColumn && (!columns.includes(filterColumn) || filterValue === null)) || (!filterColumn && filterValue !== null)) return null;
  if (limitText !== null && (!/^\d+$/.test(limitText) || Number(limitText) < 1 || Number(limitText) > 1000)) return null;
  if (offsetText !== null && (!/^\d+$/.test(offsetText) || limitText === null)) return null;

  const projection = selectedColumns.join(", ");
  const orderColumn = columns.includes(order) ? order : "created_at";
  const direction = url.searchParams.get("ascending") === "false" ? "DESC" : "ASC";
  const bindings: Array<string | number> = [];
  let sql = `select ${projection} from ${tableName}`;
  if (filterColumn) {
    sql += ` where ${filterColumn} = ?`;
    bindings.push(filterValue!);
  }
  sql += ` order by ${orderColumn} ${direction}`;
  if (limitText !== null) {
    if (orderColumn !== "id") sql += `, id ${direction}`;
    sql += " limit ? offset ?";
    bindings.push(Number(limitText), Number(offsetText ?? 0));
  }
  return { sql, bindings };
}
