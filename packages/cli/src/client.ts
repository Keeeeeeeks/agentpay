export class CliError extends Error {
  public readonly status: number;
  public readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(extractMessage(status, body));
    this.name = "CliError";
    this.status = status;
    this.body = body;
  }
}

export class ApiClient {
  constructor(
    private readonly endpoint: string,
    private readonly adminKey: string,
  ) {}

  async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  async del<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    const headers: Record<string, string> = {
      "X-Admin-Key": this.adminKey,
    };

    if (method === "POST" || method === "PUT" || method === "PATCH") {
      headers["Content-Type"] = "application/json";
    }

    try {
      const response = await fetch(toUrl(this.endpoint, path), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await response.text();
      const parsed = parseResponseBody(text);

      if (!response.ok) {
        throw new CliError(response.status, parsed);
      }

      return (parsed ?? ({} as unknown)) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function toUrl(endpoint: string, path: string): string {
  const base = endpoint.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

function parseResponseBody(text: string): unknown {
  if (text.trim().length === 0) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractMessage(status: number, body: unknown): string {
  if (typeof body === "string" && body.trim().length > 0) {
    return body;
  }
  if (typeof body === "object" && body !== null) {
    const record = body as Record<string, unknown>;
    const candidates = [record.message, record.error, record.detail];
    for (const item of candidates) {
      if (typeof item === "string" && item.trim().length > 0) {
        return item;
      }
    }
  }
  return `Request failed with status ${status}`;
}
