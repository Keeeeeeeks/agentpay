import { nanoid } from "nanoid";
import { SignJWT, generateKeyPair, jwtVerify } from "jose";
import type { webcrypto } from "node:crypto";

import type { TokenRevoker } from "../policy/engine.js";
import type {
  AgentTokenPayload,
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
  public constructor(
    private readonly signer: JWTSigner,
    private readonly revocationStore: TokenRevocationStore,
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
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
