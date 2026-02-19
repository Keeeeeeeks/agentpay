const ADMIN_KEY = localStorage.getItem("agentpay_admin_key") ?? "";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Admin-Key": ADMIN_KEY,
    ...((options.headers as Record<string, string>) ?? {}),
  };

  const res = await fetch(path, { ...options, headers });

  if (!res.ok) {
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
};
