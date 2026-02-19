import { describe, it, expect, beforeEach } from "vitest";

import {
  JWTService,
  LocalJWTSigner,
  InMemoryTokenRevocationStore,
} from "../auth/jwt.js";
import type { TokenIssueRequest } from "../auth/types.js";

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
  let service: JWTService;

  beforeEach(() => {
    signer = new LocalJWTSigner();
    revocationStore = new InMemoryTokenRevocationStore();
    service = new JWTService(signer, revocationStore);
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
});
