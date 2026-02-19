import { describe, it, expect, beforeAll, vi } from "vitest";
import { Hono } from "hono";

import { JWTService, LocalJWTSigner, InMemoryTokenRevocationStore } from "../auth/jwt.js";
import { requireAgentAuth, requirePasskeyAuth } from "../auth/middleware.js";
import { PolicyEngine } from "../policy/engine.js";
import type { SpendingTracker, PriceOracle, AssetClassifier } from "../policy/engine.js";
import { LocalProvider } from "../providers/local.js";
import { ChainRegistry } from "../chains/registry.js";
import type { AppContext } from "../api/context.js";

const ADMIN_KEY = "test-admin-key";

function buildTestApp() {
  const signer = new LocalJWTSigner();
  const revocationStore = new InMemoryTokenRevocationStore();
  const jwtService = new JWTService(signer, revocationStore);

  const signingProvider = new LocalProvider();

  const chainRegistry = new ChainRegistry();

  const stubSpending: SpendingTracker = {
    getDailySpendUsd: async () => 0,
    getWeeklySpendUsd: async () => 0,
    getHourlyTransactionCount: async () => 0,
    getDailyTransactionCount: async () => 0,
    getMemecoinDailySpendUsd: async () => 0,
  };

  const stubOracle: PriceOracle = {
    convertToUsd: async (value: string) => Number(value) || 0,
  };

  const stubClassifier: AssetClassifier = {
    isBridgeContract: async () => false,
    isMemecoin: async () => false,
  };

  const policyEngine = new PolicyEngine(stubSpending, stubOracle, revocationStore, stubClassifier);

  const ctx: AppContext = { jwtService, policyEngine, signingProvider, chainRegistry };

  return { ctx, jwtService, signingProvider, revocationStore };
}

describe("Integration: HTTP Flow (no DB)", () => {
  let jwtService: JWTService;
  let signingProvider: LocalProvider;
  let app: Hono;
  let agentToken: string;

  beforeAll(async () => {
    const built = buildTestApp();
    jwtService = built.jwtService;
    signingProvider = built.signingProvider as LocalProvider;

    await signingProvider.initialize({ environment: "sandbox" });
    await signingProvider.createWallet("EVM", "agent-integration");

    process.env["AGENTPAY_ADMIN_KEY"] = ADMIN_KEY;

    agentToken = await jwtService.issueToken({
      agentId: "agent-integration",
      walletId: "wallet-int",
      chains: ["eip155:1", "eip155:8453"],
      policyId: "pol-int",
      preset: "normal",
    });

    app = new Hono();

    app.get("/health", (c) => c.json({ status: "ok" }));

    const agentAuth = requireAgentAuth(jwtService);
    const adminAuth = requirePasskeyAuth();

    app.get("/api/agent-test", agentAuth, (c) => {
      const payload = c.get("agentToken");
      return c.json({ agentId: payload.sub, chains: payload.ap.chains });
    });

    app.get("/api/admin-test", adminAuth, (c) => {
      const userId = c.get("passkeyUserId");
      return c.json({ userId });
    });

    app.post("/api/policy-eval", agentAuth, async (c) => {
      const payload = c.get("agentToken");
      const body = await c.req.json();
      const { createPolicyFromPreset } = await import("../policy/presets.js");
      const policy = createPolicyFromPreset(payload.sub, "normal", "test");
      policy.contracts.mode = "blocklist_only";

      const result = await built.ctx.policyEngine.evaluate(policy, body, payload.jti);
      return c.json(result);
    });

    app.post("/api/sign-test", agentAuth, async (c) => {
      const payload = c.get("agentToken");
      const body = await c.req.json();

      const signResult = await signingProvider.signTransaction({
        chainId: body.chainId,
        to: body.to,
        value: body.value,
      });

      return c.json({
        agentId: payload.sub,
        hash: signResult.hash,
        signedTransaction: signResult.signedTransaction,
      });
    });
  });

  describe("Health", () => {
    it("returns 200", async () => {
      const res = await app.request("/health");
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("ok");
    });
  });

  describe("Agent Auth Middleware", () => {
    it("401 without token", async () => {
      const res = await app.request("/api/agent-test");
      expect(res.status).toBe(401);
    });

    it("401 with bad token", async () => {
      const res = await app.request("/api/agent-test", {
        headers: { Authorization: "Bearer garbage" },
      });
      expect(res.status).toBe(401);
    });

    it("200 with valid agent token", async () => {
      const res = await app.request("/api/agent-test", {
        headers: { Authorization: `Bearer ${agentToken}` },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.agentId).toBe("agent-integration");
      expect(json.chains).toEqual(["eip155:1", "eip155:8453"]);
    });
  });

  describe("Admin Auth Middleware", () => {
    it("401 without admin key", async () => {
      const res = await app.request("/api/admin-test");
      expect(res.status).toBe(401);
    });

    it("401 with wrong admin key", async () => {
      const res = await app.request("/api/admin-test", {
        headers: { "X-Admin-Key": "wrong-key" },
      });
      expect(res.status).toBe(401);
    });

    it("200 with correct admin key", async () => {
      const res = await app.request("/api/admin-test", {
        headers: { "X-Admin-Key": ADMIN_KEY },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.userId).toBe("admin");
    });
  });

  describe("Policy Evaluation via HTTP", () => {
    it("approves a small valid transaction", async () => {
      const res = await app.request("/api/policy-eval", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${agentToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chainId: "eip155:1",
          to: "0x0000000000000000000000000000000000000001",
          value: "10",
          urgency: "medium",
          reason: "test",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.allowed).toBe(true);
      expect(json.requiresHumanApproval).toBe(false);
      expect(json.evaluatedRules.length).toBeGreaterThanOrEqual(11);
    });

    it("rejects transaction exceeding max value", async () => {
      const res = await app.request("/api/policy-eval", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${agentToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chainId: "eip155:1",
          to: "0x0000000000000000000000000000000000000001",
          value: "500",
          urgency: "medium",
          reason: "exceeds max tx value",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.allowed).toBe(false);
      const maxRule = json.evaluatedRules.find((r: { rule: string }) => r.rule === "max_transaction_value");
      expect(maxRule?.passed).toBe(false);
    });
  });

  describe("Sign via HTTP", () => {
    it("signs a transaction and returns hash", async () => {
      const res = await app.request("/api/sign-test", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${agentToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chainId: "eip155:1",
          to: "0x0000000000000000000000000000000000000001",
          value: "1000000000000000000",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.agentId).toBe("agent-integration");
      expect(json.hash).toMatch(/^0x/);
      expect(json.signedTransaction).toMatch(/^0x/);
    });
  });

  describe("Token Revocation via HTTP", () => {
    it("rejects requests after token is revoked", async () => {
      const tempToken = await jwtService.issueToken({
        agentId: "agent-temp",
        walletId: "w-temp",
        chains: ["eip155:1"],
        policyId: "pol-temp",
        preset: "safe",
      });

      const validRes = await app.request("/api/agent-test", {
        headers: { Authorization: `Bearer ${tempToken}` },
      });
      expect(validRes.status).toBe(200);

      const validated = await jwtService.validateToken(tempToken);
      await jwtService.revokeToken(validated.payload!.jti);

      const revokedRes = await app.request("/api/agent-test", {
        headers: { Authorization: `Bearer ${tempToken}` },
      });
      expect(revokedRes.status).toBe(401);
      const json = await revokedRes.json();
      expect(json.error).toBe("Token revoked");
    });
  });
});
