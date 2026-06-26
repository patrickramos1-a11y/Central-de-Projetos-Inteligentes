type ApiResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

type OrderOptions = {
  ascending?: boolean;
};

function apiBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/$/, "");
}

async function requestJson<T>(baseUrl: string, path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${apiBaseUrl(baseUrl)}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const payload = (await response.json().catch(() => ({}))) as { data?: T; error?: string };

    if (!response.ok) {
      return { data: null, error: { message: payload.error ?? "Erro na API Cloudflare." } };
    }

    return { data: (payload.data ?? null) as T, error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : "Erro de conexao com a API." } };
  }
}

class SelectBuilder<T> implements PromiseLike<ApiResult<T[]>> {
  private orderColumn = "";
  private ascending = true;

  constructor(
    private readonly baseUrl: string,
    private readonly tableName: string,
  ) {}

  order(column: string, options?: OrderOptions) {
    this.orderColumn = column;
    this.ascending = options?.ascending ?? true;
    return this.execute();
  }

  then<TResult1 = ApiResult<T[]>, TResult2 = never>(
    onfulfilled?: ((value: ApiResult<T[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private execute() {
    const params = new URLSearchParams();

    if (this.orderColumn) {
      params.set("order", this.orderColumn);
      params.set("ascending", String(this.ascending));
    }

    const query = params.toString();
    return requestJson<T[]>(this.baseUrl, `/api/tables/${this.tableName}${query ? `?${query}` : ""}`);
  }
}

class MutationBuilder<T> implements PromiseLike<ApiResult<T[]>> {
  constructor(
    private readonly baseUrl: string,
    private readonly tableName: string,
    private readonly method: "POST" | "PATCH" | "DELETE",
    private readonly payload?: unknown,
  ) {}

  select(_columns = "*") {
    return this;
  }

  async single(): Promise<ApiResult<T>> {
    const result = await this.execute();
    const rows = Array.isArray(result.data) ? result.data : [];
    return { data: (rows[0] ?? null) as T | null, error: result.error };
  }

  async eq(column: string, value: string): Promise<ApiResult<T[]>> {
    if (column !== "id") {
      return { data: null, error: { message: "A API Cloudflare aceita filtros de escrita apenas por id." } };
    }

    return requestJson<T[]>(this.baseUrl, `/api/tables/${this.tableName}/${encodeURIComponent(value)}`, {
      method: this.method,
      body: this.method === "DELETE" ? undefined : JSON.stringify(this.payload ?? {}),
    });
  }

  then<TResult1 = ApiResult<T[]>, TResult2 = never>(
    onfulfilled?: ((value: ApiResult<T[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private execute() {
    return requestJson<T[]>(this.baseUrl, `/api/tables/${this.tableName}`, {
      method: this.method,
      body: this.method === "DELETE" ? undefined : JSON.stringify(this.payload ?? {}),
    });
  }
}

class TableApi<T> {
  constructor(
    private readonly baseUrl: string,
    private readonly tableName: string,
  ) {}

  select(_columns = "*") {
    return new SelectBuilder<T>(this.baseUrl, this.tableName);
  }

  insert(payload: unknown) {
    return new MutationBuilder<T>(this.baseUrl, this.tableName, "POST", payload);
  }

  update(payload: unknown) {
    return new MutationBuilder<T>(this.baseUrl, this.tableName, "PATCH", payload);
  }

  delete() {
    return new MutationBuilder<T>(this.baseUrl, this.tableName, "DELETE");
  }
}

export function createCloudflareApi(baseUrl: string) {
  return {
    from<T = Record<string, unknown>>(tableName: string) {
      return new TableApi<T>(baseUrl, tableName);
    },
  };
}
