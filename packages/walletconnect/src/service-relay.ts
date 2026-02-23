import type { SigningRelay } from "./relay.js";

export interface ServiceRelayConfig {
  baseUrl: string;
  agentToken: string;
}

interface WalletsMeResponse {
  addresses: Array<{
    chainId: string;
    address: string;
  }>;
}

interface SignTransactionResponse {
  status: "approved" | "pending_human" | "rejected";
  transactionHash?: string;
  signedTransaction?: string;
  rejectionReason?: string;
}

interface ChainsResponse {
  chains: Array<{
    chainId: string;
    type: string;
  }>;
}

interface AgentPayErrorResponse {
  error?: string;
  message?: string;
}

export class AgentPayServiceRelay implements SigningRelay {
  private readonly baseUrl: string;

  public constructor(private readonly config: ServiceRelayConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
  }

  public async getAddress(chainId: string): Promise<string> {
    const wallet = await this.request<WalletsMeResponse>("GET", "/api/wallets/me");
    const entry = wallet.addresses.find((item) => item.chainId === chainId);

    if (!entry) {
      throw new Error(`No address found for chain ${chainId}`);
    }

    return entry.address;
  }

  public async signTransaction(params: {
    chainId: string;
    to: string;
    value: string;
    data?: string;
  }): Promise<{ hash: string; signedTransaction: string }> {
    const response = await this.request<SignTransactionResponse>("POST", "/api/transactions/sign", {
      chainId: params.chainId,
      to: params.to,
      value: params.value,
      data: params.data,
      urgency: "medium",
      reason: "WalletConnect relay request",
    });

    if (response.status !== "approved") {
      throw new Error(
        response.rejectionReason ?? `Transaction was not approved (status: ${response.status})`,
      );
    }

    if (!response.transactionHash) {
      throw new Error("Approved transaction response missing transaction hash");
    }

    return {
      hash: response.transactionHash,
      signedTransaction: response.signedTransaction ?? response.transactionHash,
    };
  }

  public async signMessage(message: string, chainId: string): Promise<string> {
    const response = await this.request<SignTransactionResponse>("POST", "/api/transactions/sign", {
      chainId,
      to: "0x0000000000000000000000000000000000000000",
      value: "0",
      data: message,
      urgency: "medium",
      reason: "WalletConnect personal_sign request",
    });

    if (response.status !== "approved") {
      throw new Error(
        response.rejectionReason ?? `Message signing was not approved (status: ${response.status})`,
      );
    }

    if (!response.transactionHash) {
      throw new Error("Approved signing response missing signature/hash");
    }

    return response.signedTransaction ?? response.transactionHash;
  }

  public async signTypedData(data: string, chainId: string): Promise<string> {
    const response = await this.request<SignTransactionResponse>("POST", "/api/transactions/sign", {
      chainId,
      to: "0x0000000000000000000000000000000000000000",
      value: "0",
      data,
      urgency: "medium",
      reason: "WalletConnect typed-data signing request",
    });

    if (response.status !== "approved") {
      throw new Error(
        response.rejectionReason ?? `Typed-data signing was not approved (status: ${response.status})`,
      );
    }

    if (!response.transactionHash) {
      throw new Error("Approved typed-data response missing signature/hash");
    }

    return response.signedTransaction ?? response.transactionHash;
  }

  public getSupportedChains(): string[] {
    return ["eip155:1", "eip155:8453", "eip155:42161", "eip155:10", "eip155:137"];
  }

  private async request<TResponse>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<TResponse> {
    const response = await fetch(new URL(path, `${this.baseUrl}/`), {
      method,
      headers: {
        Authorization: `Bearer ${this.config.agentToken}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const raw = await this.parseResponseBody(response);

    if (!response.ok) {
      const parsed = this.parseError(raw);
      throw new Error(parsed ?? `AgentPay request failed with status ${response.status}`);
    }

    return raw as TResponse;
  }

  private async parseResponseBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      return response.json() as Promise<unknown>;
    }

    const text = await response.text();
    return text.length > 0 ? text : undefined;
  }

  private parseError(body: unknown): string | undefined {
    if (typeof body === "string" && body.trim().length > 0) {
      return body;
    }

    if (typeof body !== "object" || body === null) {
      return undefined;
    }

    const candidate = body as AgentPayErrorResponse;
    if (typeof candidate.error === "string" && candidate.error.trim().length > 0) {
      return candidate.error;
    }

    if (typeof candidate.message === "string" && candidate.message.trim().length > 0) {
      return candidate.message;
    }

    return undefined;
  }
}
