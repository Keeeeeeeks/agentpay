import { z } from "zod";

import {
  agentPayConfigSchema,
  allowlistRequestSchema,
  balanceResponseSchema,
  canTransactRequestSchema,
  canTransactResponseSchema,
  chainBalanceSchema,
  policyInfoSchema,
  policyRemainingSchema,
  refreshTokenResponseSchema,
  signTransactionRequestSchema,
  signTransactionResponseSchema,
  transactionStatusSchema,
  type AgentPayConfig,
  type AllowlistRequest,
  type BalanceResponse,
  type CanTransactRequest,
  type CanTransactResponse,
  type ChainBalance,
  type PolicyInfo,
  type PolicyRemaining,
  type SignTransactionRequest,
  type SignTransactionResponse,
  type TransactionStatus,
} from "./types.js";

export class AgentPayError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "AgentPayError";
  }
}

interface RequestOptions<T> {
  method: "GET" | "POST";
  path: string;
  schema: z.ZodType<T>;
  query?: Record<string, string | undefined>;
  body?: unknown;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class AgentPayClient {
  private readonly baseUrl: string;
  private accessToken: string;
  private refreshToken?: string;
  private readonly timeout: number;
  private refreshInFlight?: Promise<void>;

  constructor(config: AgentPayConfig) {
    const parsedConfig = agentPayConfigSchema.parse(config);
    this.baseUrl = this.normalizeBaseUrl(parsedConfig.baseUrl);
    this.accessToken = parsedConfig.token;
    this.refreshToken = parsedConfig.refreshToken;
    this.timeout = parsedConfig.timeout ?? DEFAULT_TIMEOUT_MS;
  }

  async getWallet(): Promise<BalanceResponse> {
    return this.request({
      method: "GET",
      path: "/api/balances",
      schema: balanceResponseSchema,
    });
  }

  async getBalances(): Promise<BalanceResponse> {
    return this.request({
      method: "GET",
      path: "/api/balances",
      schema: balanceResponseSchema,
    });
  }

  async getBalance(chainId: string): Promise<ChainBalance> {
    return this.request({
      method: "GET",
      path: `/api/balances/${encodeURIComponent(chainId)}`,
      schema: chainBalanceSchema,
    });
  }

  async signTransaction(request: SignTransactionRequest): Promise<SignTransactionResponse> {
    const payload = signTransactionRequestSchema.parse(request);

    return this.request({
      method: "POST",
      path: "/api/transactions/sign",
      schema: signTransactionResponseSchema,
      body: payload,
    });
  }

  async getTransactionStatus(hash: string): Promise<TransactionStatus> {
    if (!hash.trim()) {
      throw new AgentPayError("Transaction hash is required", 400);
    }

    return this.request({
      method: "GET",
      path: `/api/transactions/status/${encodeURIComponent(hash)}`,
      schema: transactionStatusSchema,
    });
  }

  async getPolicy(): Promise<PolicyInfo> {
    return this.request({
      method: "GET",
      path: "/api/policy/me",
      schema: policyInfoSchema,
    });
  }

  async getPolicyRemaining(): Promise<PolicyRemaining> {
    return this.request({
      method: "GET",
      path: "/api/policy/me/remaining",
      schema: policyRemainingSchema,
    });
  }

  async canTransact(request: CanTransactRequest): Promise<CanTransactResponse> {
    const params = canTransactRequestSchema.parse(request);

    return this.request({
      method: "GET",
      path: "/api/policy/me/can-transact",
      schema: canTransactResponseSchema,
      query: {
        chainId: params.chainId,
        to: params.to,
        value: params.value,
        data: params.data,
      },
    });
  }

  async requestAllowlist(request: AllowlistRequest): Promise<{ success: boolean }> {
    const payload = allowlistRequestSchema.parse(request);

    return this.request({
      method: "POST",
      path: "/api/allowlist/request",
      schema: z.object({ success: z.boolean() }),
      body: payload,
    });
  }

  private async request<T>(options: RequestOptions<T>): Promise<T> {
    const url = this.buildUrl(options.path, options.query);
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: options.method,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });

      const rawBody = await this.parseResponseBody(response);

      if (!response.ok) {
        if (response.status === 401 && this.refreshToken) {
          await this.refreshAccessToken();
          return this.requestWithoutAutoRefresh(options);
        }

        throw new AgentPayError(
          this.extractErrorMessage(rawBody) || `Request failed with status ${response.status}`,
          response.status,
          rawBody,
        );
      }

      return options.schema.parse(rawBody);
    } catch (error) {
      if (error instanceof AgentPayError) {
        throw error;
      }

      if (error instanceof z.ZodError) {
        throw new AgentPayError("Response validation failed", 500, error.flatten());
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new AgentPayError(`Request timed out after ${this.timeout}ms`, 408);
      }

      if (error instanceof Error) {
        throw new AgentPayError(error.message, 500);
      }

      throw new AgentPayError("Unknown request error", 500, error);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private async requestWithoutAutoRefresh<T>(options: RequestOptions<T>): Promise<T> {
    const url = this.buildUrl(options.path, options.query);
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: options.method,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });

      const rawBody = await this.parseResponseBody(response);
      if (!response.ok) {
        throw new AgentPayError(
          this.extractErrorMessage(rawBody) || `Request failed with status ${response.status}`,
          response.status,
          rawBody,
        );
      }

      return options.schema.parse(rawBody);
    } catch (error) {
      if (error instanceof AgentPayError) {
        throw error;
      }

      if (error instanceof z.ZodError) {
        throw new AgentPayError("Response validation failed", 500, error.flatten());
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new AgentPayError(`Request timed out after ${this.timeout}ms`, 408);
      }

      if (error instanceof Error) {
        throw new AgentPayError(error.message, 500);
      }

      throw new AgentPayError("Unknown request error", 500, error);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new AgentPayError("No refresh token configured", 401);
    }

    if (!this.refreshInFlight) {
      this.refreshInFlight = this.performTokenRefresh().finally(() => {
        this.refreshInFlight = undefined;
      });
    }

    await this.refreshInFlight;
  }

  private async performTokenRefresh(): Promise<void> {
    const refreshToken = this.refreshToken;
    if (!refreshToken) {
      throw new AgentPayError("No refresh token configured", 401);
    }

    const url = this.buildUrl("/api/tokens/refresh");
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken }),
        signal: controller.signal,
      });

      const rawBody = await this.parseResponseBody(response);
      if (!response.ok) {
        throw new AgentPayError(
          this.extractErrorMessage(rawBody) || `Request failed with status ${response.status}`,
          response.status,
          rawBody,
        );
      }

      const refreshed = refreshTokenResponseSchema.parse(rawBody);
      this.accessToken = refreshed.accessToken;
      this.refreshToken = refreshed.refreshToken;
    } catch (error) {
      if (error instanceof AgentPayError) {
        throw error;
      }

      if (error instanceof z.ZodError) {
        throw new AgentPayError("Response validation failed", 500, error.flatten());
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new AgentPayError(`Request timed out after ${this.timeout}ms`, 408);
      }

      if (error instanceof Error) {
        throw new AgentPayError(error.message, 500);
      }

      throw new AgentPayError("Unknown request error", 500, error);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private buildUrl(path: string, query?: Record<string, string | undefined>): string {
    const url = new URL(path, `${this.baseUrl}/`);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, value);
        }
      }
    }

    return url.toString();
  }

  private normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.replace(/\/+$/, "");
  }

  private async parseResponseBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      return response.json() as Promise<unknown>;
    }

    const text = await response.text();
    return text ? text : undefined;
  }

  private extractErrorMessage(body: unknown): string | undefined {
    if (typeof body === "string" && body.trim()) {
      return body;
    }

    if (typeof body !== "object" || body === null) {
      return undefined;
    }

    const message = (body as { error?: unknown; message?: unknown }).error
      ?? (body as { error?: unknown; message?: unknown }).message;

    return typeof message === "string" && message.trim() ? message : undefined;
  }
}
