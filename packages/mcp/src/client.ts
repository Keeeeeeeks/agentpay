type HttpMethod = "GET" | "POST";

function getConfig(): { url: string; token: string } {
  const url = process.env.AGENTPAY_URL;
  const token = process.env.AGENTPAY_TOKEN;

  if (!url || !token) {
    throw new Error("AGENTPAY_URL and AGENTPAY_TOKEN must be set");
  }

  return { url: url.replace(/\/+$/, ""), token };
}

async function agentFetch(method: HttpMethod, path: string, body?: unknown): Promise<unknown> {
  const { url, token } = getConfig();
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    if (typeof data === "object" && data !== null && "error" in data && typeof data.error === "string") {
      throw new Error(data.error);
    }

    throw new Error(typeof data === "string" && data.trim() ? data : `HTTP ${response.status}`);
  }

  return data;
}

export async function getBalances(): Promise<unknown> {
  return agentFetch("GET", "/api/balances");
}

export async function getBalance(chainId: string): Promise<unknown> {
  return agentFetch("GET", `/api/balances/${encodeURIComponent(chainId)}`);
}

export async function signTransaction(payload: {
  chainId: string;
  to: string;
  value: string;
  data?: string;
  reason: string;
}): Promise<unknown> {
  return agentFetch("POST", "/api/transactions/sign", payload);
}

export async function getTransactionStatus(hash: string): Promise<unknown> {
  return agentFetch("GET", `/api/transactions/status/${encodeURIComponent(hash)}`);
}

export async function getPolicy(): Promise<unknown> {
  return agentFetch("GET", "/api/policy/me");
}

export async function getRemainingBudget(): Promise<unknown> {
  return agentFetch("GET", "/api/policy/me/remaining");
}

export async function canTransact(params: {
  chainId: string;
  to: string;
  value: string;
  data?: string;
}): Promise<unknown> {
  const search = new URLSearchParams({
    chainId: params.chainId,
    to: params.to,
    value: params.value,
  });

  if (params.data !== undefined) {
    search.set("data", params.data);
  }

  return agentFetch("GET", `/api/policy/me/can-transact?${search.toString()}`);
}

export async function requestAllowlist(payload: {
  contractAddress: string;
  chainId: string;
  reason: string;
  functions?: string[];
}): Promise<unknown> {
  return agentFetch("POST", "/api/allowlist/request", payload);
}

export async function getWallet(): Promise<unknown> {
  return agentFetch("GET", "/api/wallets/me");
}

export { agentFetch, getConfig };
