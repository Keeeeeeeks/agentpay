import { describe, it, expect, beforeEach } from "vitest";
import { createHash } from "node:crypto";

import {
  JWTService,
  LocalJWTSigner,
  InMemoryTokenRevocationStore,
  type RefreshTokenStore,
} from "../auth/jwt.js";
import type { TokenIssueRequest } from "../auth/types.js";

type StoredRefreshToken = {
  id: string;
  agentId: string;
  accessJti: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  familyId: string;
};

class TestRefreshTokenStore implements RefreshTokenStore {
  private readonly tokensByHash = new Map<string, StoredRefreshToken>();
  private idCounter = 0;

  async store(params: {
    agentId: string;
    tokenHash: string;
    accessJti: string;
    expiresAt: Date;
    familyId: string;
  }): Promise<void> {
    this.idCounter += 1;
    this.tokensByHash.set(params.tokenHash, {
      id: `refresh-${this.idCounter}`,
      agentId: params.agentId,
      accessJti: params.accessJti,
      expiresAt: new Date(params.expiresAt),
      usedAt: null,
      revokedAt: null,
      familyId: params.familyId,
    });
  }

  async findByHash(tokenHash: string): Promise<StoredRefreshToken | null> {
    const token = this.tokensByHash.get(tokenHash);
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

  async markUsed(id: string): Promise<void> {
    for (const token of this.tokensByHash.values()) {
      if (token.id === id) {
        token.usedAt = new Date();
        return;
      }
    }
  }

  async revokeFamily(familyId: string): Promise<void> {
    for (const token of this.tokensByHash.values()) {
      if (token.familyId === familyId) {
        token.revokedAt = new Date();
      }
    }
  }

  async setExpiresAt(refreshToken: string, expiresAt: Date): Promise<void> {
    const token = this.tokensByHash.get(hashRefreshToken(refreshToken));
    if (token) {
      token.expiresAt = expiresAt;
    }
  }

  async revokeByToken(refreshToken: string): Promise<void> {
    const token = this.tokensByHash.get(hashRefreshToken(refreshToken));
    if (token) {
      token.revokedAt = new Date();
    }
  }
}

function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function makeIssueRequest(overrides?: Partial<TokenIssueRequest>): TokenIssueRequest {
  return {
    agentId: "agent-test-1",
    walletId: "wallet-test-1",
    chains: ["eip155:1", "eip155:8453"],
    policyId: "policy-test-1",
    preset: "normal",
    ...overrides,
  };
}

describe("JWTService", () => {
  let signer: LocalJWTSigner;
  let revocationStore: InMemoryTokenRevocationStore;
  let refreshTokenStore: TestRefreshTokenStore;
  let service: JWTService;

  beforeEach(() => {
    signer = new LocalJWTSigner();
    revocationStore = new InMemoryTokenRevocationStore();
    refreshTokenStore = new TestRefreshTokenStore();
    service = new JWTService(signer, revocationStore, refreshTokenStore);
  });

  describe("issueToken", () => {
    it("returns a JWT string", async () => {
      const token = await service.issueToken(makeIssueRequest());
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3);
    });

    it("includes correct agent payload", async () => {
      const token = await service.issueToken(makeIssueRequest({
        agentId: "agent-42",
        walletId: "wallet-42",
        chains: ["eip155:1"],
        policyId: "pol-42",
        preset: "safe",
      }));

      const result = await service.validateToken(token);
      expect(result.valid).toBe(true);
      expect(result.payload?.sub).toBe("agent-42");
      expect(result.payload?.ap.wallet_id).toBe("wallet-42");
      expect(result.payload?.ap.chains).toEqual(["eip155:1"]);
      expect(result.payload?.ap.policy_id).toBe("pol-42");
      expect(result.payload?.ap.preset).toBe("safe");
    });

    it("sets issuer to 'agentpay'", async () => {
      const token = await service.issueToken(makeIssueRequest());
      const result = await service.validateToken(token);
      expect(result.payload?.iss).toBe("agentpay");
    });

    it("generates unique jti for each token", async () => {
      const token1 = await service.issueToken(makeIssueRequest());
      const token2 = await service.issueToken(makeIssueRequest());

      const r1 = await service.validateToken(token1);
      const r2 = await service.validateToken(token2);

      expect(r1.payload?.jti).not.toBe(r2.payload?.jti);
    });

    it("respects custom TTL", async () => {
      const token = await service.issueToken(makeIssueRequest({ expiresInSeconds: 3600 }));
      const result = await service.validateToken(token);

      expect(result.valid).toBe(true);
      const expectedExpiry = Math.floor(Date.now() / 1000) + 3600;
      expect(result.payload?.exp).toBeGreaterThanOrEqual(expectedExpiry - 5);
      expect(result.payload?.exp).toBeLessThanOrEqual(expectedExpiry + 5);
    });

    it("defaults to 24h TTL", async () => {
      const token = await service.issueToken(makeIssueRequest());
      const result = await service.validateToken(token);

      const expectedExpiry = Math.floor(Date.now() / 1000) + 86400;
      expect(result.payload?.exp).toBeGreaterThanOrEqual(expectedExpiry - 5);
      expect(result.payload?.exp).toBeLessThanOrEqual(expectedExpiry + 5);
    });
  });

  describe("validateToken", () => {
    it("validates a freshly issued token", async () => {
      const token = await service.issueToken(makeIssueRequest());
      const result = await service.validateToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it("rejects a garbage token", async () => {
      const result = await service.validateToken("not.a.jwt");
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("rejects a token signed with different key", async () => {
      const otherSigner = new LocalJWTSigner();
      const otherStore = new InMemoryTokenRevocationStore();
      const otherService = new JWTService(otherSigner, otherStore);

      const token = await otherService.issueToken(makeIssueRequest());
      const result = await service.validateToken(token);

      expect(result.valid).toBe(false);
    });
  });

  describe("revokeToken", () => {
    it("revokes a token by jti", async () => {
      const token = await service.issueToken(makeIssueRequest());
      const validated = await service.validateToken(token);
      expect(validated.valid).toBe(true);

      const jti = validated.payload!.jti;
      await service.revokeToken(jti);

      const afterRevoke = await service.validateToken(token);
      expect(afterRevoke.valid).toBe(false);
      expect(afterRevoke.error).toBe("Token revoked");
    });

    it("does not affect other tokens", async () => {
      const token1 = await service.issueToken(makeIssueRequest());
      const token2 = await service.issueToken(makeIssueRequest());

      const v1 = await service.validateToken(token1);
      await service.revokeToken(v1.payload!.jti);

      const result2 = await service.validateToken(token2);
      expect(result2.valid).toBe(true);
    });
  });

  describe("InMemoryTokenRevocationStore", () => {
    it("starts empty (no revocations)", async () => {
      const store = new InMemoryTokenRevocationStore();
      expect(await store.isRevoked("any-jti")).toBe(false);
    });

    it("marks jti as revoked after revoke()", async () => {
      const store = new InMemoryTokenRevocationStore();
      await store.revoke("jti-1");
      expect(await store.isRevoked("jti-1")).toBe(true);
      expect(await store.isRevoked("jti-2")).toBe(false);
    });
  });

  describe("refresh tokens", () => {
    it("issueTokenPair returns access and refresh tokens", async () => {
      const pair = await service.issueTokenPair(makeIssueRequest());

      expect(typeof pair.accessToken).toBe("string");
      expect(pair.accessToken.split(".")).toHaveLength(3);
      expect(typeof pair.refreshToken).toBe("string");
      expect(pair.refreshToken.length).toBeGreaterThan(20);
      expect(pair.accessExpiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
      expect(pair.refreshExpiresAt).toBeInstanceOf(Date);
    });

    it("refreshAccessToken returns a new valid token pair", async () => {
      const pair = await service.issueTokenPair(makeIssueRequest());
      const refreshed = await service.refreshAccessToken(pair.refreshToken);

      expect(refreshed.accessToken).not.toBe(pair.accessToken);
      expect(refreshed.refreshToken).not.toBe(pair.refreshToken);

      const validated = await service.validateToken(refreshed.accessToken);
      expect(validated.valid).toBe(true);
      expect(validated.payload?.sub).toBe("agent-test-1");
    });

    it("refreshAccessToken marks old refresh token as used", async () => {
      const pair = await service.issueTokenPair(makeIssueRequest());
      await service.refreshAccessToken(pair.refreshToken);

      const stored = await refreshTokenStore.findByHash(hashRefreshToken(pair.refreshToken));
      expect(stored?.usedAt).not.toBeNull();
    });

    it("refreshAccessToken rejects expired refresh tokens", async () => {
      const pair = await service.issueTokenPair(makeIssueRequest());
      await refreshTokenStore.setExpiresAt(pair.refreshToken, new Date(Date.now() - 1000));

      await expect(service.refreshAccessToken(pair.refreshToken)).rejects.toThrow(
        "Refresh token expired",
      );
    });

    it("refreshAccessToken detects replay and revokes family", async () => {
      const pair = await service.issueTokenPair(makeIssueRequest());
      const refreshed = await service.refreshAccessToken(pair.refreshToken);

      await expect(service.refreshAccessToken(pair.refreshToken)).rejects.toThrow(
        "Refresh token reuse detected — all tokens in family revoked",
      );

      await expect(service.refreshAccessToken(refreshed.refreshToken)).rejects.toThrow(
        "Refresh token revoked",
      );
    });

    it("refreshAccessToken rejects revoked refresh tokens", async () => {
      const pair = await service.issueTokenPair(makeIssueRequest());
      await refreshTokenStore.revokeByToken(pair.refreshToken);

      await expect(service.refreshAccessToken(pair.refreshToken)).rejects.toThrow(
        "Refresh token revoked",
      );
    });
  });
});
