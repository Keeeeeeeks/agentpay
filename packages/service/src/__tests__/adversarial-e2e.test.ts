import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Hono } from "hono";

import { JWTService, LocalJWTSigner, InMemoryTokenRevocationStore } from "../auth/jwt.js";
import { requireAgentAuth, requirePasskeyAuth } from "../auth/middleware.js";
import { PolicyEngine } from "../policy/engine.js";
import type { SpendingTracker, PriceOracle, AssetClassifier } from "../policy/engine.js";
import { createPolicyFromPreset } from "../policy/presets.js";
import type { AgentPolicy } from "../policy/types.js";
import { LocalProvider } from "../providers/local.js";
import { ChainRegistry } from "../chains/registry.js";
import type { AppContext } from "../api/context.js";

const ADMIN_KEY = "test-admin-key-adversarial";

class ConfigurableSpendingTracker implements SpendingTracker {
  dailySpend = 0;
  weeklySpend = 0;
  hourlyCount = 0;
  dailyCount = 0;
  memecoinDailySpend = 0;

  async getDailySpendUsd() { return this.dailySpend; }
  async getWeeklySpendUsd() { return this.weeklySpend; }
  async getHourlyTransactionCount() { return this.hourlyCount; }
  async getDailyTransactionCount() { return this.dailyCount; }
  async getMemecoinDailySpendUsd() { return this.memecoinDailySpend; }

  reset() {
    this.dailySpend = 0;
    this.weeklySpend = 0;
    this.hourlyCount = 0;
    this.dailyCount = 0;
    this.memecoinDailySpend = 0;
  }
}

function buildAdversarialApp(overrides?: {
  spendingTracker?: SpendingTracker;
  priceOracle?: PriceOracle;
  assetClassifier?: AssetClassifier;
}) {
  const signer = new LocalJWTSigner();
  const revocationStore = new InMemoryTokenRevocationStore();
  const jwtService = new JWTService(signer, revocationStore);
  const signingProvider = new LocalProvider();
  const chainRegistry = new ChainRegistry();

  const spendingTracker = overrides?.spendingTracker ?? new ConfigurableSpendingTracker();

  const priceOracle: PriceOracle = overrides?.priceOracle ?? {
    convertToUsd: async (value: string) => Number(value) || 0,
  };

  const assetClassifier: AssetClassifier = overrides?.assetClassifier ?? {
    isBridgeContract: async () => false,
    isMemecoin: async () => false,
  };

  const policyEngine = new PolicyEngine(spendingTracker, priceOracle, revocationStore, assetClassifier);

  const ctx: AppContext = { jwtService, policyEngine, signingProvider, chainRegistry };

  return { ctx, jwtService, signingProvider, revocationStore, spendingTracker, policyEngine };
}

type PolicyEvalBody = {
  chainId: string;
  to: string;
  value: string;
  data?: string;
  urgency: "low" | "medium" | "high";
  reason: string;
};

function buildTestHono(built: ReturnType<typeof buildAdversarialApp>, policyOverrides?: (p: AgentPolicy) => void) {
  const app = new Hono();
  const agentAuth = requireAgentAuth(built.jwtService);
  const adminAuth = requirePasskeyAuth();

  app.get("/api/agent-test", agentAuth, (c) => {
    const payload = c.get("agentToken");
    return c.json({ agentId: payload.sub, chains: payload.ap.chains });
  });

  app.get("/api/admin-test", adminAuth, (c) => {
    return c.json({ userId: c.get("passkeyUserId") });
  });

  app.post("/api/policy-eval", agentAuth, async (c) => {
    const payload = c.get("agentToken");
    const body = await c.req.json<PolicyEvalBody>();
    const policy = createPolicyFromPreset(payload.sub, "normal", "test");
    policy.contracts.mode = "blocklist_only";
    if (policyOverrides) policyOverrides(policy);
    const result = await built.ctx.policyEngine.evaluate(policy, body, payload.jti);
    return c.json(result);
  });

  app.post("/api/sign-test", agentAuth, async (c) => {
    const payload = c.get("agentToken");
    const body = await c.req.json<{ chainId: string; to: string; value: string }>();

    if (!payload.ap.chains.includes(body.chainId)) {
      return c.json({ error: `Chain ${body.chainId} not authorized` }, 403);
    }

    const signResult = await built.signingProvider.signTransaction({
      chainId: body.chainId,
      to: body.to,
      value: body.value,
    });

    return c.json({ agentId: payload.sub, hash: signResult.hash });
  });

  return app;
}

function jsonPost(url: string, body: unknown, headers: Record<string, string> = {}) {
  return {
    method: "POST" as const,
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  };
}

describe("Adversarial E2E: AgentPay", () => {
  let built: ReturnType<typeof buildAdversarialApp>;
  let app: Hono;
  let agentTokenA: string;
  let agentTokenB: string;

  beforeAll(async () => {
    process.env["AGENTPAY_ADMIN_KEY"] = ADMIN_KEY;

    built = buildAdversarialApp();
    await built.signingProvider.initialize({ environment: "sandbox" });
    await built.signingProvider.createWallet("EVM", "agent-A");

    app = buildTestHono(built);

    agentTokenA = await built.jwtService.issueToken({
      agentId: "agent-A",
      walletId: "wallet-A",
      chains: ["eip155:1", "eip155:8453"],
      policyId: "pol-A",
      preset: "normal",
    });

    agentTokenB = await built.jwtService.issueToken({
      agentId: "agent-B",
      walletId: "wallet-B",
      chains: ["eip155:42161"],
      policyId: "pol-B",
      preset: "safe",
    });
  });

  // ─── Category 1: Auth Attacks ──────────────────────────────────────

  describe("Auth Attacks", () => {
    it("rejects request with no Authorization header", async () => {
      const res = await app.request("/api/agent-test");
      expect(res.status).toBe(401);
    });

    it("rejects request with empty Bearer token", async () => {
      const res = await app.request("/api/agent-test", {
        headers: { Authorization: "Bearer " },
      });
      expect(res.status).toBe(401);
    });

    it("rejects request with Bearer only (no token)", async () => {
      const res = await app.request("/api/agent-test", {
        headers: { Authorization: "Bearer" },
      });
      expect(res.status).toBe(401);
    });

    it("rejects request with Basic auth scheme", async () => {
      const creds = Buffer.from("admin:password").toString("base64");
      const res = await app.request("/api/agent-test", {
        headers: { Authorization: `Basic ${creds}` },
      });
      expect(res.status).toBe(401);
    });

    it("rejects completely garbage JWT string", async () => {
      const res = await app.request("/api/agent-test", {
        headers: { Authorization: "Bearer not.a.jwt.at.all" },
      });
      expect(res.status).toBe(401);
    });

    it("rejects well-formed JWT signed with different key", async () => {
      const otherSigner = new LocalJWTSigner();
      const otherRevStore = new InMemoryTokenRevocationStore();
      const otherJwt = new JWTService(otherSigner, otherRevStore);

      const foreignToken = await otherJwt.issueToken({
        agentId: "agent-A",
        walletId: "wallet-A",
        chains: ["eip155:1"],
        policyId: "pol-A",
        preset: "normal",
      });

      const res = await app.request("/api/agent-test", {
        headers: { Authorization: `Bearer ${foreignToken}` },
      });
      expect(res.status).toBe(401);
    });

    it("rejects agent JWT on admin-only endpoint", async () => {
      const res = await app.request("/api/admin-test", {
        headers: { Authorization: `Bearer ${agentTokenA}` },
      });
      expect(res.status).toBe(401);
    });

    it("rejects admin key on agent-only endpoint", async () => {
      const res = await app.request("/api/agent-test", {
        headers: { "X-Admin-Key": ADMIN_KEY },
      });
      expect(res.status).toBe(401);
    });

    it("rejects admin endpoint with no X-Admin-Key", async () => {
      const res = await app.request("/api/admin-test");
      expect(res.status).toBe(401);
    });

    it("rejects admin endpoint with wrong X-Admin-Key", async () => {
      const res = await app.request("/api/admin-test", {
        headers: { "X-Admin-Key": "wrong-key" },
      });
      expect(res.status).toBe(401);
    });

    it("rejects admin endpoint with common weak keys", async () => {
      for (const key of ["admin", "password", "", "null", "undefined", "true"]) {
        const res = await app.request("/api/admin-test", {
          headers: { "X-Admin-Key": key },
        });
        expect(res.status).toBe(401);
      }
    });
  });

  // ─── Category 2: Token Lifecycle Attacks ───────────────────────────

  describe("Token Lifecycle Attacks", () => {
    it("rejects token after revocation", async () => {
      const token = await built.jwtService.issueToken({
        agentId: "agent-revoke-test",
        walletId: "w-r",
        chains: ["eip155:1"],
        policyId: "p-r",
        preset: "safe",
      });

      const validRes = await app.request("/api/agent-test", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(validRes.status).toBe(200);

      const validated = await built.jwtService.validateToken(token);
      await built.jwtService.revokeToken(validated.payload!.jti);

      const revokedRes = await app.request("/api/agent-test", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(revokedRes.status).toBe(401);
    });

    it("revoking token A does not affect token B", async () => {
      const tokenX = await built.jwtService.issueToken({
        agentId: "agent-X",
        walletId: "w-x",
        chains: ["eip155:1"],
        policyId: "p-x",
        preset: "safe",
      });

      const tokenY = await built.jwtService.issueToken({
        agentId: "agent-Y",
        walletId: "w-y",
        chains: ["eip155:1"],
        policyId: "p-y",
        preset: "safe",
      });

      const validatedX = await built.jwtService.validateToken(tokenX);
      await built.jwtService.revokeToken(validatedX.payload!.jti);

      const resX = await app.request("/api/agent-test", {
        headers: { Authorization: `Bearer ${tokenX}` },
      });
      expect(resX.status).toBe(401);

      const resY = await app.request("/api/agent-test", {
        headers: { Authorization: `Bearer ${tokenY}` },
      });
      expect(resY.status).toBe(200);
    });

    it("two tokens for same agent: revoking one leaves the other valid", async () => {
      const t1 = await built.jwtService.issueToken({
        agentId: "agent-dual",
        walletId: "w-d",
        chains: ["eip155:1"],
        policyId: "p-d",
        preset: "normal",
      });

      const t2 = await built.jwtService.issueToken({
        agentId: "agent-dual",
        walletId: "w-d",
        chains: ["eip155:1"],
        policyId: "p-d",
        preset: "normal",
      });

      const v1 = await built.jwtService.validateToken(t1);
      await built.jwtService.revokeToken(v1.payload!.jti);

      const res1 = await app.request("/api/agent-test", {
        headers: { Authorization: `Bearer ${t1}` },
      });
      expect(res1.status).toBe(401);

      const res2 = await app.request("/api/agent-test", {
        headers: { Authorization: `Bearer ${t2}` },
      });
      expect(res2.status).toBe(200);
    });

    it("rejects a tampered JWT payload", async () => {
      const parts = agentTokenA.split(".");
      const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString());
      payload.sub = "agent-HACKED";
      const tamperedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      const res = await app.request("/api/agent-test", {
        headers: { Authorization: `Bearer ${tamperedToken}` },
      });
      expect(res.status).toBe(401);
    });

    it("rejects a token with modified claims but same signature", async () => {
      const parts = agentTokenA.split(".");
      const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString());
      payload.ap.chains = ["eip155:1", "eip155:8453", "eip155:42161", "solana-mainnet"];
      const expandedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const forgedToken = `${parts[0]}.${expandedPayload}.${parts[2]}`;

      const res = await app.request("/api/agent-test", {
        headers: { Authorization: `Bearer ${forgedToken}` },
      });
      expect(res.status).toBe(401);
    });
  });

  // ─── Category 3: Policy Escalation ─────────────────────────────────

  describe("Policy Escalation", () => {
    it("rejects transaction exceeding maxTransactionValueUsd", async () => {
      const res = await app.request("/api/policy-eval", jsonPost("/api/policy-eval", {
        chainId: "eip155:1",
        to: "0x0000000000000000000000000000000000000001",
        value: "500",
        urgency: "medium",
        reason: "over max tx value",
      }, { Authorization: `Bearer ${agentTokenA}` }));

      const json = await res.json();
      expect(json.allowed).toBe(false);
    });

    it("rejects transaction on unauthorized chain", async () => {
      const narrowToken = await built.jwtService.issueToken({
        agentId: "agent-narrow",
        walletId: "w-n",
        chains: ["eip155:8453"],
        policyId: "p-n",
        preset: "safe",
      });

      const narrowApp = buildTestHono(built, (p) => {
        p.chains.allowed = ["eip155:8453"];
      });

      const res = await narrowApp.request("/api/policy-eval", jsonPost("/api/policy-eval", {
        chainId: "eip155:1",
        to: "0x0000000000000000000000000000000000000001",
        value: "1",
        urgency: "medium",
        reason: "unauthorized chain",
      }, { Authorization: `Bearer ${narrowToken}` }));

      const json = await res.json();
      expect(json.allowed).toBe(false);
      const rule = json.evaluatedRules.find((r: { rule: string }) => r.rule === "chain_allowed");
      expect(rule?.passed).toBe(false);
    });

    it("rejects transaction to blocklisted address", async () => {
      const blockedApp = buildTestHono(built, (p) => {
        p.contracts.blocklist = ["0xdead000000000000000000000000000000000000"];
      });

      const res = await blockedApp.request("/api/policy-eval", jsonPost("/api/policy-eval", {
        chainId: "eip155:1",
        to: "0xdead000000000000000000000000000000000000",
        value: "1",
        urgency: "medium",
        reason: "blocklisted",
      }, { Authorization: `Bearer ${agentTokenA}` }));

      const json = await res.json();
      expect(json.allowed).toBe(false);
      const rule = json.evaluatedRules.find((r: { rule: string }) => r.rule === "contract_blocklist");
      expect(rule?.passed).toBe(false);
    });

    it("rejects non-allowlisted contract in allowlist mode", async () => {
      const allowlistApp = buildTestHono(built, (p) => {
        p.contracts.mode = "allowlist";
        p.contracts.allowlist = [];
      });

      const res = await allowlistApp.request("/api/policy-eval", jsonPost("/api/policy-eval", {
        chainId: "eip155:1",
        to: "0x0000000000000000000000000000000000000099",
        value: "1",
        urgency: "medium",
        reason: "not in allowlist",
      }, { Authorization: `Bearer ${agentTokenA}` }));

      const json = await res.json();
      expect(json.allowed).toBe(false);
    });

    it("rejects bridge transaction when bridging is disabled", async () => {
      const bridgeBuilt = buildAdversarialApp({
        assetClassifier: { isBridgeContract: async () => true, isMemecoin: async () => false },
      });
      await bridgeBuilt.signingProvider.initialize({ environment: "sandbox" });

      const bridgeToken = await bridgeBuilt.jwtService.issueToken({
        agentId: "agent-bridge",
        walletId: "w-b",
        chains: ["eip155:1"],
        policyId: "p-b",
        preset: "safe",
      });

      const bridgeApp = buildTestHono(bridgeBuilt, (p) => {
        p.bridging.mode = "no";
      });

      const res = await bridgeApp.request("/api/policy-eval", jsonPost("/api/policy-eval", {
        chainId: "eip155:1",
        to: "0x0000000000000000000000000000000000000002",
        value: "1",
        urgency: "medium",
        reason: "bridge attempt",
      }, { Authorization: `Bearer ${bridgeToken}` }));

      const json = await res.json();
      expect(json.allowed).toBe(false);
      const rule = json.evaluatedRules.find((r: { rule: string }) => r.rule === "bridge_mode");
      expect(rule?.passed).toBe(false);
    });

    it("rejects memecoin transaction when memecoins disabled", async () => {
      const memeBuilt = buildAdversarialApp({
        assetClassifier: { isBridgeContract: async () => false, isMemecoin: async () => true },
      });
      await memeBuilt.signingProvider.initialize({ environment: "sandbox" });

      const memeToken = await memeBuilt.jwtService.issueToken({
        agentId: "agent-meme",
        walletId: "w-m",
        chains: ["eip155:1"],
        policyId: "p-m",
        preset: "safe",
      });

      const memeApp = buildTestHono(memeBuilt, (p) => {
        p.memecoins.mode = "no";
      });

      const res = await memeApp.request("/api/policy-eval", jsonPost("/api/policy-eval", {
        chainId: "eip155:1",
        to: "0x0000000000000000000000000000000000000003",
        value: "1",
        urgency: "medium",
        reason: "memecoin",
      }, { Authorization: `Bearer ${memeToken}` }));

      const json = await res.json();
      expect(json.allowed).toBe(false);
      const rule = json.evaluatedRules.find((r: { rule: string }) => r.rule === "memecoin_mode");
      expect(rule?.passed).toBe(false);
    });

    it("rejects memecoin exceeding capped per-tx limit", async () => {
      const memeBuilt = buildAdversarialApp({
        assetClassifier: { isBridgeContract: async () => false, isMemecoin: async () => true },
      });
      await memeBuilt.signingProvider.initialize({ environment: "sandbox" });

      const token = await memeBuilt.jwtService.issueToken({
        agentId: "agent-meme2",
        walletId: "w-m2",
        chains: ["eip155:1"],
        policyId: "p-m2",
        preset: "normal",
      });

      const mApp = buildTestHono(memeBuilt, (p) => {
        p.memecoins.mode = "capped";
        p.memecoins.perTxLimitUsd = 25;
      });

      const res = await mApp.request("/api/policy-eval", jsonPost("/api/policy-eval", {
        chainId: "eip155:1",
        to: "0x0000000000000000000000000000000000000004",
        value: "50",
        urgency: "medium",
        reason: "exceeds memecoin cap",
      }, { Authorization: `Bearer ${token}` }));

      const json = await res.json();
      expect(json.allowed).toBe(false);
    });

    it("requires human approval above autonomous threshold", async () => {
      const threshApp = buildTestHono(built, (p) => {
        p.approval.autonomousThresholdUsd = 100;
        p.spending.maxTransactionValueUsd = 500;
      });

      const res = await threshApp.request("/api/policy-eval", jsonPost("/api/policy-eval", {
        chainId: "eip155:1",
        to: "0x0000000000000000000000000000000000000001",
        value: "200",
        urgency: "medium",
        reason: "above threshold",
      }, { Authorization: `Bearer ${agentTokenA}` }));

      const json = await res.json();
      expect(json.allowed).toBe(true);
      expect(json.requiresHumanApproval).toBe(true);
    });

    it("auto-approves below autonomous threshold", async () => {
      const threshApp = buildTestHono(built, (p) => {
        p.approval.autonomousThresholdUsd = 100;
      });

      const res = await threshApp.request("/api/policy-eval", jsonPost("/api/policy-eval", {
        chainId: "eip155:1",
        to: "0x0000000000000000000000000000000000000001",
        value: "50",
        urgency: "medium",
        reason: "below threshold",
      }, { Authorization: `Bearer ${agentTokenA}` }));

      const json = await res.json();
      expect(json.allowed).toBe(true);
      expect(json.requiresHumanApproval).toBe(false);
    });
  });

  // ─── Category 4: Cross-Agent Isolation ─────────────────────────────

  describe("Cross-Agent Isolation", () => {
    it("agent A token returns agent A identity", async () => {
      const res = await app.request("/api/agent-test", {
        headers: { Authorization: `Bearer ${agentTokenA}` },
      });
      const json = await res.json();
      expect(json.agentId).toBe("agent-A");
    });

    it("agent B token returns agent B identity", async () => {
      const res = await app.request("/api/agent-test", {
        headers: { Authorization: `Bearer ${agentTokenB}` },
      });
      const json = await res.json();
      expect(json.agentId).toBe("agent-B");
    });

    it("agent B cannot transact on agent A chains", async () => {
      const res = await app.request("/api/sign-test", jsonPost("/api/sign-test", {
        chainId: "eip155:1",
        to: "0x0000000000000000000000000000000000000001",
        value: "1",
      }, { Authorization: `Bearer ${agentTokenB}` }));

      expect(res.status).toBe(403);
    });

    it("revoking agent A does not affect agent B", async () => {
      const tA = await built.jwtService.issueToken({
        agentId: "agent-iso-A",
        walletId: "w-ia",
        chains: ["eip155:1"],
        policyId: "p-ia",
        preset: "safe",
      });

      const tB = await built.jwtService.issueToken({
        agentId: "agent-iso-B",
        walletId: "w-ib",
        chains: ["eip155:1"],
        policyId: "p-ib",
        preset: "safe",
      });

      const vA = await built.jwtService.validateToken(tA);
      await built.jwtService.revokeToken(vA.payload!.jti);

      const resA = await app.request("/api/agent-test", {
        headers: { Authorization: `Bearer ${tA}` },
      });
      expect(resA.status).toBe(401);

      const resB = await app.request("/api/agent-test", {
        headers: { Authorization: `Bearer ${tB}` },
      });
      expect(resB.status).toBe(200);
    });

    it("each agent policy evaluates independently", async () => {
      const safeToken = await built.jwtService.issueToken({
        agentId: "agent-safe-iso",
        walletId: "w-si",
        chains: ["eip155:1"],
        policyId: "p-si",
        preset: "safe",
      });

      const safeApp = buildTestHono(built, (p) => {
        p.spending.maxTransactionValueUsd = 25;
      });

      const degenApp = buildTestHono(built, (p) => {
        p.spending.maxTransactionValueUsd = 10000;
      });

      const safeRes = await safeApp.request("/api/policy-eval", jsonPost("/api/policy-eval", {
        chainId: "eip155:1",
        to: "0x0000000000000000000000000000000000000001",
        value: "100",
        urgency: "medium",
        reason: "safe agent",
      }, { Authorization: `Bearer ${safeToken}` }));

      const safeJson = await safeRes.json();
      expect(safeJson.allowed).toBe(false);

      const degenRes = await degenApp.request("/api/policy-eval", jsonPost("/api/policy-eval", {
        chainId: "eip155:1",
        to: "0x0000000000000000000000000000000000000001",
        value: "100",
        urgency: "medium",
        reason: "degen agent",
      }, { Authorization: `Bearer ${agentTokenA}` }));

      const degenJson = await degenRes.json();
      expect(degenJson.allowed).toBe(true);
    });
  });

  // ─── Category 5: Input Validation ──────────────────────────────────

  describe("Input Validation", () => {
    it("rejects sign request missing chainId", async () => {
      const res = await app.request("/api/sign-test", jsonPost("/api/sign-test", {
        to: "0x0000000000000000000000000000000000000001",
        value: "1",
      }, { Authorization: `Bearer ${agentTokenA}` }));

      expect(res.status).toBe(403);
    });

    it("handles SQL injection in chainId gracefully", async () => {
      const res = await app.request("/api/policy-eval", jsonPost("/api/policy-eval", {
        chainId: "'; DROP TABLE agents; --",
        to: "0x0000000000000000000000000000000000000001",
        value: "1",
        urgency: "medium",
        reason: "sql injection",
      }, { Authorization: `Bearer ${agentTokenA}` }));

      const json = await res.json();
      expect(json.allowed).toBe(false);
    });

    it("handles script injection in reason field", async () => {
      const res = await app.request("/api/policy-eval", jsonPost("/api/policy-eval", {
        chainId: "eip155:1",
        to: "0x0000000000000000000000000000000000000001",
        value: "1",
        urgency: "medium",
        reason: "<script>alert('xss')</script>",
      }, { Authorization: `Bearer ${agentTokenA}` }));

      expect(res.status).toBe(200);
    });

    it("handles extremely long value strings", async () => {
      const res = await app.request("/api/policy-eval", jsonPost("/api/policy-eval", {
        chainId: "eip155:1",
        to: "0x0000000000000000000000000000000000000001",
        value: "9".repeat(100),
        urgency: "medium",
        reason: "huge value",
      }, { Authorization: `Bearer ${agentTokenA}` }));

      const json = await res.json();
      expect(json.allowed).toBe(false);
    });

    it("handles negative value", async () => {
      const res = await app.request("/api/policy-eval", jsonPost("/api/policy-eval", {
        chainId: "eip155:1",
        to: "0x0000000000000000000000000000000000000001",
        value: "-100",
        urgency: "medium",
        reason: "negative value",
      }, { Authorization: `Bearer ${agentTokenA}` }));

      expect(res.status).toBe(200);
    });

    it("handles zero value", async () => {
      const res = await app.request("/api/policy-eval", jsonPost("/api/policy-eval", {
        chainId: "eip155:1",
        to: "0x0000000000000000000000000000000000000001",
        value: "0",
        urgency: "medium",
        reason: "zero value",
      }, { Authorization: `Bearer ${agentTokenA}` }));

      const json = await res.json();
      expect(json.allowed).toBe(true);
    });

    it("handles special characters in all string fields", async () => {
      const res = await app.request("/api/policy-eval", jsonPost("/api/policy-eval", {
        chainId: "eip155:1",
        to: "0x0000000000000000000000000000000000000001",
        value: "1",
        urgency: "medium",
        reason: "test \n\t\r\0 null bytes & unicode \u{1F4A9} and emoji",
      }, { Authorization: `Bearer ${agentTokenA}` }));

      expect(res.status).toBe(200);
    });

    it("handles NaN-producing value", async () => {
      const res = await app.request("/api/policy-eval", jsonPost("/api/policy-eval", {
        chainId: "eip155:1",
        to: "0x0000000000000000000000000000000000000001",
        value: "not-a-number",
        urgency: "medium",
        reason: "NaN value",
      }, { Authorization: `Bearer ${agentTokenA}` }));

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.allowed).toBe(true);
    });

    it("handles very long to address", async () => {
      const res = await app.request("/api/policy-eval", jsonPost("/api/policy-eval", {
        chainId: "eip155:1",
        to: "0x" + "a".repeat(1000),
        value: "1",
        urgency: "medium",
        reason: "long address",
      }, { Authorization: `Bearer ${agentTokenA}` }));

      expect(res.status).toBe(200);
    });
  });

  // ─── Category 6: Rate Limit Evasion ────────────────────────────────

  describe("Rate Limit Evasion", () => {
    it("rejects when hourly rate limit reached", async () => {
      const tracker = new ConfigurableSpendingTracker();
      tracker.hourlyCount = 20;

      const rlBuilt = buildAdversarialApp({ spendingTracker: tracker });
      await rlBuilt.signingProvider.initialize({ environment: "sandbox" });

      const token = await rlBuilt.jwtService.issueToken({
        agentId: "agent-rl",
        walletId: "w-rl",
        chains: ["eip155:1"],
        policyId: "p-rl",
        preset: "normal",
      });

      const rlApp = buildTestHono(rlBuilt, (p) => {
        p.rateLimits.maxTxPerHour = 20;
      });

      const res = await rlApp.request("/api/policy-eval", jsonPost("/api/policy-eval", {
        chainId: "eip155:1",
        to: "0x0000000000000000000000000000000000000001",
        value: "1",
        urgency: "medium",
        reason: "rate limit test",
      }, { Authorization: `Bearer ${token}` }));

      const json = await res.json();
      expect(json.allowed).toBe(false);
      const rule = json.evaluatedRules.find((r: { rule: string }) => r.rule === "rate_limits");
      expect(rule?.passed).toBe(false);
    });

    it("rejects when daily rate limit reached", async () => {
      const tracker = new ConfigurableSpendingTracker();
      tracker.dailyCount = 100;

      const rlBuilt = buildAdversarialApp({ spendingTracker: tracker });
      await rlBuilt.signingProvider.initialize({ environment: "sandbox" });

      const token = await rlBuilt.jwtService.issueToken({
        agentId: "agent-rl2",
        walletId: "w-rl2",
        chains: ["eip155:1"],
        policyId: "p-rl2",
        preset: "normal",
      });

      const rlApp = buildTestHono(rlBuilt, (p) => {
        p.rateLimits.maxTxPerDay = 100;
      });

      const res = await rlApp.request("/api/policy-eval", jsonPost("/api/policy-eval", {
        chainId: "eip155:1",
        to: "0x0000000000000000000000000000000000000001",
        value: "1",
        urgency: "medium",
        reason: "daily limit",
      }, { Authorization: `Bearer ${token}` }));

      const json = await res.json();
      expect(json.allowed).toBe(false);
    });

    it("rejects when daily spending cap would be exceeded", async () => {
      const tracker = new ConfigurableSpendingTracker();
      tracker.dailySpend = 2400;

      const rlBuilt = buildAdversarialApp({ spendingTracker: tracker });
      await rlBuilt.signingProvider.initialize({ environment: "sandbox" });

      const token = await rlBuilt.jwtService.issueToken({
        agentId: "agent-spend",
        walletId: "w-sp",
        chains: ["eip155:1"],
        policyId: "p-sp",
        preset: "normal",
      });

      const spendApp = buildTestHono(rlBuilt, (p) => {
        p.spending.dailyLimitUsd = 2500;
      });

      const res = await spendApp.request("/api/policy-eval", jsonPost("/api/policy-eval", {
        chainId: "eip155:1",
        to: "0x0000000000000000000000000000000000000001",
        value: "200",
        urgency: "medium",
        reason: "exceeds daily cap",
      }, { Authorization: `Bearer ${token}` }));

      const json = await res.json();
      expect(json.allowed).toBe(false);
    });

    it("rejects when weekly spending cap would be exceeded", async () => {
      const tracker = new ConfigurableSpendingTracker();
      tracker.weeklySpend = 9900;

      const rlBuilt = buildAdversarialApp({ spendingTracker: tracker });
      await rlBuilt.signingProvider.initialize({ environment: "sandbox" });

      const token = await rlBuilt.jwtService.issueToken({
        agentId: "agent-weekly",
        walletId: "w-wk",
        chains: ["eip155:1"],
        policyId: "p-wk",
        preset: "normal",
      });

      const weekApp = buildTestHono(rlBuilt, (p) => {
        p.spending.weeklyLimitUsd = 10000;
      });

      const res = await weekApp.request("/api/policy-eval", jsonPost("/api/policy-eval", {
        chainId: "eip155:1",
        to: "0x0000000000000000000000000000000000000001",
        value: "200",
        urgency: "medium",
        reason: "exceeds weekly cap",
      }, { Authorization: `Bearer ${token}` }));

      const json = await res.json();
      expect(json.allowed).toBe(false);
    });
  });

  // ─── Category 7: Admin Impersonation ───────────────────────────────

  describe("Admin Impersonation", () => {
    it("agent JWT cannot access admin endpoints", async () => {
      const res = await app.request("/api/admin-test", {
        headers: { Authorization: `Bearer ${agentTokenA}` },
      });
      expect(res.status).toBe(401);
    });

    it("empty string admin key is rejected", async () => {
      const res = await app.request("/api/admin-test", {
        headers: { "X-Admin-Key": "" },
      });
      expect(res.status).toBe(401);
    });

    it("admin key in Authorization header is not accepted for admin routes", async () => {
      const res = await app.request("/api/admin-test", {
        headers: { Authorization: `Bearer ${ADMIN_KEY}` },
      });
      expect(res.status).toBe(401);
    });

    it("admin key value 'null' is rejected", async () => {
      const res = await app.request("/api/admin-test", {
        headers: { "X-Admin-Key": "null" },
      });
      expect(res.status).toBe(401);
    });
  });

  // ─── Category 8: Revocation Under Load ─────────────────────────────

  describe("Revocation Under Load", () => {
    it("token revocation is effective immediately", async () => {
      const token = await built.jwtService.issueToken({
        agentId: "agent-load",
        walletId: "w-load",
        chains: ["eip155:1"],
        policyId: "p-load",
        preset: "normal",
      });

      const res1 = await app.request("/api/agent-test", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res1.status).toBe(200);

      const validated = await built.jwtService.validateToken(token);
      await built.jwtService.revokeToken(validated.payload!.jti);

      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          app.request("/api/agent-test", {
            headers: { Authorization: `Bearer ${token}` },
          })
        ),
      );

      for (const r of results) {
        expect(r.status).toBe(401);
      }
    });

    it("multiple rapid token issues all produce unique JTIs", async () => {
      const tokens = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          built.jwtService.issueToken({
            agentId: `agent-rapid-${i}`,
            walletId: `w-r-${i}`,
            chains: ["eip155:1"],
            policyId: `p-r-${i}`,
            preset: "safe",
          }),
        ),
      );

      const jtis = new Set<string>();
      for (const t of tokens) {
        const v = await built.jwtService.validateToken(t);
        expect(v.valid).toBe(true);
        jtis.add(v.payload!.jti);
      }

      expect(jtis.size).toBe(20);
    });
  });
});
