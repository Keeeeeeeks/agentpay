import { nanoid } from "nanoid";
import { SignJWT, generateKeyPair, jwtVerify } from "jose";
import { createHash } from "node:crypto";
import type { webcrypto } from "node:crypto";

import type { TokenRevoker } from "../policy/engine.js";
import type {
  AgentTokenPayload,
  RefreshTokenResult,
  TokenPairResult,
  TokenIssueRequest,
  TokenValidationResult,
} from "./types.js";

type CryptoKey = webcrypto.CryptoKey;

export interface JWTSigner {
  sign(payload: Record<string, unknown>): Promise<string>;
  verify(token: string): Promise<Record<string, unknown>>;
  getPublicKey(): Promise<CryptoKey | Uint8Array>;
}

export interface TokenRevocationStore extends TokenRevoker {
  revoke(jti: string): Promise<void>;
}

export interface RefreshTokenStore {
  store(params: {
    agentId: string;
    tokenHash: string;
    accessJti: string;
    expiresAt: Date;
    familyId: string;
  }): Promise<void>;

  findByHash(tokenHash: string): Promise<{
    id: string;
    agentId: string;
    accessJti: string;
    expiresAt: Date;
    usedAt: Date | null;
    revokedAt: Date | null;
    familyId: string;
  } | null>;

  markUsed(id: string): Promise<void>;
  revokeFamily(familyId: string): Promise<void>;
}

export class RefreshTokenReuseError extends Error {
  public constructor() {
    super("Refresh token reuse detected — all tokens in family revoked");
    this.name = "RefreshTokenReuseError";
  }
}

type InMemoryRefreshToken = {
  id: string;
  agentId: string;
  tokenHash: string;
  accessJti: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  familyId: string;
};

export class InMemoryRefreshTokenStore implements RefreshTokenStore {
  private readonly tokens = new Map<string, InMemoryRefreshToken>();

  public async store(params: {
    agentId: string;
    tokenHash: string;
    accessJti: string;
    expiresAt: Date;
    familyId: string;
  }): Promise<void> {
    const id = nanoid();
    this.tokens.set(params.tokenHash, {
      id,
      agentId: params.agentId,
      tokenHash: params.tokenHash,
      accessJti: params.accessJti,
      expiresAt: new Date(params.expiresAt),
      usedAt: null,
      revokedAt: null,
      familyId: params.familyId,
    });
  }

  public async findByHash(tokenHash: string): Promise<{
    id: string;
    agentId: string;
    accessJti: string;
    expiresAt: Date;
    usedAt: Date | null;
    revokedAt: Date | null;
    familyId: string;
  } | null> {
    const token = this.tokens.get(tokenHash);
    if (!token) {
      return null;
    }

    return {
      id: token.id,
      agentId: token.agentId,
      accessJti: token.accessJti,
      expiresAt: new Date(token.expiresAt),
      usedAt: token.usedAt ? new Date(token.usedAt) : null,
      revokedAt: token.revokedAt ? new Date(token.revokedAt) : null,
      familyId: token.familyId,
    };
  }

  public async markUsed(id: string): Promise<void> {
    for (const token of this.tokens.values()) {
      if (token.id === id) {
        token.usedAt = new Date();
        return;
      }
    }
  }

  public async revokeFamily(familyId: string): Promise<void> {
    const now = new Date();
    for (const token of this.tokens.values()) {
      if (token.familyId === familyId) {
        token.revokedAt = now;
      }
    }
  }
}

export class LocalJWTSigner implements JWTSigner {
  private privateKey?: CryptoKey;
  private publicKey?: CryptoKey;

  public async sign(payload: Record<string, unknown>): Promise<string> {
    await this.ensureKeyPair();

    return new SignJWT(payload)
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .sign(this.privateKey as CryptoKey);
  }

  public async verify(token: string): Promise<Record<string, unknown>> {
    await this.ensureKeyPair();

    const { payload } = await jwtVerify(token, this.publicKey as CryptoKey, {
      algorithms: ["RS256"],
    });

    return payload as Record<string, unknown>;
  }

  public async getPublicKey(): Promise<CryptoKey | Uint8Array> {
    await this.ensureKeyPair();
    return this.publicKey as CryptoKey;
  }

  private async ensureKeyPair(): Promise<void> {
    if (this.privateKey && this.publicKey) {
      return;
    }

    const { privateKey, publicKey } = await generateKeyPair("RS256");
    this.privateKey = privateKey;
    this.publicKey = publicKey;
  }
}

export class InMemoryTokenRevocationStore implements TokenRevocationStore {
  private readonly revoked = new Set<string>();

  public async revoke(jti: string): Promise<void> {
    this.revoked.add(jti);
  }

  public async isRevoked(jti: string): Promise<boolean> {
    return this.revoked.has(jti);
  }
}

export class JWTService {
  private readonly tokenIssueRequests = new Map<string, TokenIssueRequest>();

  public constructor(
    private readonly signer: JWTSigner,
    private readonly revocationStore: TokenRevocationStore,
    private readonly refreshTokenStore: RefreshTokenStore = new InMemoryRefreshTokenStore(),
  ) {}

  public async issueToken(request: TokenIssueRequest): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const ttl = request.expiresInSeconds ?? 86400;
    const payload: AgentTokenPayload = {
      sub: request.agentId,
      iss: "agentpay",
      iat: now,
      exp: now + ttl,
      jti: nanoid(),
      ap: {
        wallet_id: request.walletId,
        chains: request.chains,
        policy_id: request.policyId,
        preset: request.preset,
      },
    };

    return this.signer.sign(payloadToRecord(payload));
  }

  public async validateToken(token: string): Promise<TokenValidationResult> {
    try {
      const payload = await this.signer.verify(token);
      if (!isAgentTokenPayload(payload)) {
        return {
          valid: false,
          error: "Invalid token payload shape",
        };
      }

      const now = Math.floor(Date.now() / 1000);
      if (payload.exp <= now) {
        return {
          valid: false,
          error: "Token expired",
        };
      }

      if (payload.iss !== "agentpay") {
        return {
          valid: false,
          error: "Invalid issuer",
        };
      }

      const revoked = await this.revocationStore.isRevoked(payload.jti);
      if (revoked) {
        return {
          valid: false,
          error: "Token revoked",
        };
      }

      return {
        valid: true,
        payload,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Token validation failed",
      };
    }
  }

  public async revokeToken(jti: string): Promise<void> {
    await this.revocationStore.revoke(jti);
  }

  public async issueRefreshToken(params: {
    agentId: string;
    accessJti: string;
    familyId?: string;
  }): Promise<RefreshTokenResult> {
    const refreshToken = nanoid(48);
    const tokenHash = hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const familyId = params.familyId ?? nanoid();

    await this.refreshTokenStore.store({
      agentId: params.agentId,
      tokenHash,
      accessJti: params.accessJti,
      expiresAt,
      familyId,
    });

    return {
      refreshToken,
      expiresAt,
      familyId,
    };
  }

  public async issueTokenPair(request: TokenIssueRequest): Promise<TokenPairResult> {
    const accessToken = await this.issueToken(request);
    const validated = await this.validateToken(accessToken);

    if (!validated.valid || !validated.payload) {
      throw new Error("Failed to validate issued access token");
    }

    this.tokenIssueRequests.set(validated.payload.jti, request);

    const refresh = await this.issueRefreshToken({
      agentId: request.agentId,
      accessJti: validated.payload.jti,
    });

    return {
      accessToken,
      refreshToken: refresh.refreshToken,
      accessExpiresAt: validated.payload.exp,
      refreshExpiresAt: refresh.expiresAt,
    };
  }

  public async refreshAccessToken(refreshToken: string): Promise<TokenPairResult> {
    const tokenHash = hashRefreshToken(refreshToken);
    const existing = await this.refreshTokenStore.findByHash(tokenHash);

    if (!existing) {
      throw new Error("Invalid refresh token");
    }

    if (existing.revokedAt) {
      throw new Error("Refresh token revoked");
    }

    if (existing.usedAt) {
      await this.refreshTokenStore.revokeFamily(existing.familyId);
      throw new RefreshTokenReuseError();
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new Error("Refresh token expired");
    }

    const issueRequest = this.tokenIssueRequests.get(existing.accessJti);
    if (!issueRequest) {
      throw new Error("Refresh token context missing");
    }

    await this.refreshTokenStore.markUsed(existing.id);

    const accessToken = await this.issueToken(issueRequest);
    const validated = await this.validateToken(accessToken);

    if (!validated.valid || !validated.payload) {
      throw new Error("Failed to validate refreshed access token");
    }

    this.tokenIssueRequests.set(validated.payload.jti, issueRequest);

    const nextRefresh = await this.issueRefreshToken({
      agentId: existing.agentId,
      accessJti: validated.payload.jti,
      familyId: existing.familyId,
    });

    return {
      accessToken,
      refreshToken: nextRefresh.refreshToken,
      accessExpiresAt: validated.payload.exp,
      refreshExpiresAt: nextRefresh.expiresAt,
    };
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function payloadToRecord(payload: AgentTokenPayload): Record<string, unknown> {
  return {
    sub: payload.sub,
    iss: payload.iss,
    iat: payload.iat,
    exp: payload.exp,
    jti: payload.jti,
    ap: {
      wallet_id: payload.ap.wallet_id,
      chains: payload.ap.chains,
      policy_id: payload.ap.policy_id,
      preset: payload.ap.preset,
      parent_token_id: payload.ap.parent_token_id,
      delegation_depth: payload.ap.delegation_depth,
    },
  };
}

function isAgentTokenPayload(payload: unknown): payload is AgentTokenPayload {
  if (!isObject(payload)) {
    return false;
  }

  if (
    typeof payload.sub !== "string" ||
    payload.iss !== "agentpay" ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number" ||
    typeof payload.jti !== "string"
  ) {
    return false;
  }

  if (!isObject(payload.ap)) {
    return false;
  }

  if (
    typeof payload.ap.wallet_id !== "string" ||
    !Array.isArray(payload.ap.chains) ||
    payload.ap.chains.some((chain) => typeof chain !== "string") ||
    typeof payload.ap.policy_id !== "string" ||
    (payload.ap.preset !== "safe" &&
      payload.ap.preset !== "normal" &&
      payload.ap.preset !== "degen" &&
      payload.ap.preset !== "custom")
  ) {
    return false;
  }

  if (
    payload.ap.parent_token_id !== undefined &&
    typeof payload.ap.parent_token_id !== "string"
  ) {
    return false;
  }

  if (
    payload.ap.delegation_depth !== undefined &&
    typeof payload.ap.delegation_depth !== "number"
  ) {
    return false;
  }

  return true;
}
