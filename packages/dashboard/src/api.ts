const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');


async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Admin-Key": localStorage.getItem("agentpay_admin_key") ?? "",
    ...((options.headers as Record<string, string>) ?? {}),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem("agentpay_admin_key");
      window.location.href = API_BASE + "/login";
      throw new Error("Session expired");
    }
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export function setAdminKey(key: string) {
  localStorage.setItem("agentpay_admin_key", key);
  window.location.reload();
}

export function getAdminKey(): string {
  return localStorage.getItem("agentpay_admin_key") ?? "";
}

export interface Agent {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  createdBy: string;
  disabledAt: string | null;
  disabledBy: string | null;
}

export interface AgentDetail extends Agent {
  wallets: Array<{
    id: string;
    agentId: string;
    provider: string;
    providerWalletId: string;
    createdAt: string;
  }>;
  currentPolicy: {
    id: string;
    version: number;
    preset: string;
    data: Record<string, unknown>;
    createdAt: string;
    createdBy: string;
    changeSummary: string | null;
  } | null;
}

export interface TokenInfo {
  jti: string;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  useCount: number;
  active: boolean;
}

export interface AuditLog {
  id: string;
  agentId: string;
  tokenJti: string | null;
  timestamp: string;
  action: string;
  request: Record<string, unknown>;
  policyEvaluation: Record<string, unknown> | null;
  approval: Record<string, unknown> | null;
  signing: Record<string, unknown> | null;
  blockchain: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  decoded?: {
    summary: string;
    reason: string | null;
    protocol: string | null;
    amount: string | null;
    riskLevel: "info" | "warning" | "critical";
  };
}

export interface AuditStreamMessage {
  type: "audit_log";
  log: AuditLog;
}

function parseSSEChunk(buffer: string): { events: string[]; remainder: string } {
  const parts = buffer.split("\n\n");
  const remainder = parts.pop() ?? "";
  return { events: parts, remainder };
}

function extractDataBlock(eventBlock: string): string | null {
  const lines = eventBlock.split("\n");
  const dataLines = lines.filter((line) => line.startsWith("data:"));
  if (dataLines.length === 0) {
    return null;
  }
  return dataLines.map((line) => line.slice(5).trim()).join("\n");
}

export async function connectAuditStream(
  agentId: string,
  onMessage: (msg: AuditStreamMessage) => void,
): Promise<() => void> {
  const controller = new AbortController();
  const adminKey = getAdminKey();

  const response = await fetch(`${API_BASE}/api/audit/${agentId}/stream`, {
    method: "GET",
    headers: {
      "X-Admin-Key": adminKey,
    },
    signal: controller.signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`Failed to connect stream: HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  void (async () => {
    let buffer = "";

    try {
      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const { events, remainder } = parseSSEChunk(buffer);
        buffer = remainder;

        for (const eventBlock of events) {
          const data = extractDataBlock(eventBlock);
          if (!data) {
            continue;
          }
          const parsed = JSON.parse(data) as { type?: string; log?: AuditLog };
          if (parsed.type === "audit_log" && parsed.log) {
            onMessage({ type: "audit_log", log: parsed.log });
          }
        }
      }
    } catch {
      return;
    } finally {
      reader.releaseLock();
    }
  })();

  return () => {
    controller.abort();
  };
}

export interface Approval {
  id: string;
  auditLogId: string;
  agentId: string;
  expiresAt: string;
  status: string;
  approvedBy: string | null;
  approvedAt: string | null;
}

export const api = {
  health: () => request<{ status: string; provider: string }>("/health"),

  agents: {
    list: () => request<{ agents: Agent[] }>("/api/agents"),
    get: (id: string) => request<AgentDetail>(`/api/agents/${id}`),
    create: (name: string, preset: string) =>
      request<{ id: string; name: string; address: string; policyId: string; preset: string }>(
        "/api/agents",
        { method: "POST", body: JSON.stringify({ name, preset }) },
      ),
    disable: (id: string) =>
      request<Agent>(`/api/agents/${id}/disable`, { method: "PATCH" }),
  },

  tokens: {
    list: (agentId: string) =>
      request<{ tokens: TokenInfo[] }>(`/api/agents/${agentId}/tokens`),
    issue: (agentId: string, chains: string[], expiresInSeconds?: number) =>
      request<{ token: string; jti: string; expiresAt: string; chains: string[] }>(
        `/api/agents/${agentId}/tokens`,
        { method: "POST", body: JSON.stringify({ chains, expiresInSeconds }) },
      ),
    revoke: (agentId: string, jti: string) =>
      request<{ revoked: boolean }>(`/api/agents/${agentId}/tokens/${jti}`, { method: "DELETE" }),
  },

  policies: {
    get: (agentId: string) => request<Record<string, unknown>>(`/api/agents/${agentId}/policy`),
    update: (agentId: string, preset: string, changeSummary?: string) =>
      request<Record<string, unknown>>(`/api/agents/${agentId}/policy`, {
        method: "PUT",
        body: JSON.stringify({ preset, changeSummary }),
      }),
    remaining: (agentId: string) =>
      request<{
        dailyLimitUsd: number;
        dailySpentUsd: number;
        dailyRemainingUsd: number;
        weeklyLimitUsd: number;
        weeklySpentUsd: number;
        weeklyRemainingUsd: number;
        txThisHour: number;
        maxTxPerHour: number;
        txToday: number;
        maxTxPerDay: number;
      }>(`/api/agents/${agentId}/policy/remaining`),
    history: (agentId: string) =>
      request<{ history: Array<{ version: number; preset: string; createdAt: string; createdBy: string; changeSummary: string | null }> }>(
        `/api/agents/${agentId}/policy/history`,
      ),
    presets: () => request<Record<string, Record<string, unknown>>>("/api/policies/presets"),
    updateFull: (agentId: string, preset: string, overrides: Record<string, unknown>, changeSummary?: string) =>
      request<Record<string, unknown>>(`/api/agents/${agentId}/policy`, {
        method: "PUT",
        body: JSON.stringify({ preset, overrides, changeSummary }),
      }),
  },

  approvals: {
    list: () => request<{ approvals: Approval[] }>("/api/approvals"),
    get: (id: string) => request<{ approval: Approval; auditLog: AuditLog }>(`/api/approvals/${id}`),
    approve: (id: string) => request<{ status: string }>(`/api/approvals/${id}/approve`, { method: "POST" }),
    reject: (id: string, reason?: string) =>
      request<{ status: string }>(`/api/approvals/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
  },

  audit: {
    list: (agentId: string, limit = 50, offset = 0) =>
      request<{ logs: AuditLog[]; limit: number; offset: number }>(
        `/api/audit/${agentId}?limit=${limit}&offset=${offset}`,
      ),
  },

  allowlists: {
    list: (agentId: string) =>
      request<{ entries: Array<{ id: string; agentId: string; address: string; chainId: string; name: string; type: string; allowedFunctions: string[]; addedBy: string; createdAt: string }> }>(
        `/api/agents/${agentId}/allowlists`,
      ),
    listRequests: (agentId: string) =>
      request<{ requests: Array<{ id: string; agentId: string; address: string; chainId: string; reason: string; requestedFunctions: string[]; status: string; createdAt: string }> }>(
        `/api/agents/${agentId}/allowlist-requests`,
      ),
    approveRequest: (agentId: string, requestId: string) =>
      request<{ status: string }>(`/api/agents/${agentId}/allowlist-requests/${requestId}/approve`, { method: "POST" }),
    rejectRequest: (agentId: string, requestId: string) =>
      request<{ status: string }>(`/api/agents/${agentId}/allowlist-requests/${requestId}/reject`, { method: "POST" }),
  },
};
