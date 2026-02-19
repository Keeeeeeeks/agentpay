import { describe, it, expect, beforeEach } from "vitest";

import { PolicyEngine } from "../policy/engine.js";
import type { SpendingTracker, PriceOracle, TokenRevoker, AssetClassifier } from "../policy/engine.js";
import type { AgentPolicy } from "../policy/types.js";
import type { TransactionRequest } from "../api/types.js";
import { createPolicyFromPreset } from "../policy/presets.js";

function makeStubSpendingTracker(overrides?: Partial<SpendingTracker>): SpendingTracker {
  return {
    getDailySpendUsd: async () => 0,
    getWeeklySpendUsd: async () => 0,
    getHourlyTransactionCount: async () => 0,
    getDailyTransactionCount: async () => 0,
    getMemecoinDailySpendUsd: async () => 0,
    ...overrides,
  };
}

function makeStubPriceOracle(usdPerUnit = 1): PriceOracle {
  return { convertToUsd: async (value: string) => Number(value) * usdPerUnit };
}

function makeStubTokenRevoker(revokedJtis: string[] = []): TokenRevoker {
  return { isRevoked: async (jti: string) => revokedJtis.includes(jti) };
}

function makeStubAssetClassifier(overrides?: Partial<AssetClassifier>): AssetClassifier {
  return {
    isBridgeContract: async () => false,
    isMemecoin: async () => false,
    ...overrides,
  };
}

function makePolicy(overrides?: Partial<AgentPolicy>): AgentPolicy {
  const base = createPolicyFromPreset("agent-1", "normal", "test-user");
  return { ...base, ...overrides };
}

function makeTx(overrides?: Partial<TransactionRequest>): TransactionRequest {
  return {
    chainId: "eip155:1",
    to: "0x1234567890abcdef1234567890abcdef12345678",
    value: "10",
    urgency: "medium",
    reason: "test transaction",
    ...overrides,
  };
}

describe("PolicyEngine", () => {
  let engine: PolicyEngine;
  let spendingTracker: SpendingTracker;
  let priceOracle: PriceOracle;
  let tokenRevoker: TokenRevoker;
  let assetClassifier: AssetClassifier;

  beforeEach(() => {
    spendingTracker = makeStubSpendingTracker();
    priceOracle = makeStubPriceOracle();
    tokenRevoker = makeStubTokenRevoker();
    assetClassifier = makeStubAssetClassifier();
    engine = new PolicyEngine(spendingTracker, priceOracle, tokenRevoker, assetClassifier);
  });

  describe("Step 1: Token revocation", () => {
    it("rejects when token is revoked", async () => {
      tokenRevoker = makeStubTokenRevoker(["revoked-jti"]);
      engine = new PolicyEngine(spendingTracker, priceOracle, tokenRevoker, assetClassifier);

      const result = await engine.evaluate(makePolicy(), makeTx(), "revoked-jti");

      expect(result.allowed).toBe(false);
      expect(result.evaluatedRules[0]?.rule).toBe("token_revocation");
      expect(result.evaluatedRules[0]?.passed).toBe(false);
    });

    it("passes when token is not revoked", async () => {
      const result = await engine.evaluate(makePolicy(), makeTx(), "valid-jti");

      expect(result.evaluatedRules[0]?.rule).toBe("token_revocation");
      expect(result.evaluatedRules[0]?.passed).toBe(true);
    });
  });

  describe("Step 2: Chain allowed", () => {
    it("rejects when chain is not in allowed list", async () => {
      const policy = makePolicy({ chains: { allowed: ["eip155:8453"] } });
      const result = await engine.evaluate(policy, makeTx({ chainId: "eip155:1" }), "jti");

      expect(result.allowed).toBe(false);
      const rule = result.evaluatedRules.find((r) => r.rule === "chain_allowed");
      expect(rule?.passed).toBe(false);
    });

    it("passes when chain is allowed", async () => {
      const policy = makePolicy({ chains: { allowed: ["eip155:1", "eip155:8453"] } });
      const result = await engine.evaluate(policy, makeTx({ chainId: "eip155:1" }), "jti");

      const rule = result.evaluatedRules.find((r) => r.rule === "chain_allowed");
      expect(rule?.passed).toBe(true);
    });
  });

  describe("Step 3: Blocklist", () => {
    it("rejects when to address is blocklisted", async () => {
      const policy = makePolicy();
      policy.contracts.blocklist = ["0x1234567890abcdef1234567890abcdef12345678"];

      const result = await engine.evaluate(
        policy,
        makeTx({ to: "0x1234567890abcdef1234567890abcdef12345678" }),
        "jti",
      );

      expect(result.allowed).toBe(false);
      const rule = result.evaluatedRules.find((r) => r.rule === "contract_blocklist");
      expect(rule?.passed).toBe(false);
    });

    it("is case-insensitive for blocklist matching", async () => {
      const policy = makePolicy();
      policy.contracts.blocklist = ["0xABCDEF1234567890ABCDEF1234567890ABCDEF12"];

      const result = await engine.evaluate(
        policy,
        makeTx({ to: "0xabcdef1234567890abcdef1234567890abcdef12" }),
        "jti",
      );

      expect(result.allowed).toBe(false);
    });
  });

  describe("Step 4: Contract mode", () => {
    it("rejects in allowlist mode when contract is not allowlisted", async () => {
      const policy = makePolicy();
      policy.contracts.mode = "allowlist";
      policy.contracts.allowlist = [];

      const result = await engine.evaluate(policy, makeTx(), "jti");

      expect(result.allowed).toBe(false);
      const rule = result.evaluatedRules.find((r) => r.rule === "contract_mode");
      expect(rule?.passed).toBe(false);
    });

    it("passes in allowlist mode when contract is allowlisted", async () => {
      const policy = makePolicy();
      policy.contracts.mode = "allowlist";
      policy.contracts.allowlist = [
        {
          address: "0x1234567890abcdef1234567890abcdef12345678",
          chainId: "eip155:1",
          name: "Test DEX",
          type: "dex",
        },
      ];

      const result = await engine.evaluate(policy, makeTx(), "jti");

      const rule = result.evaluatedRules.find((r) => r.rule === "contract_mode");
      expect(rule?.passed).toBe(true);
    });

    it("passes in blocklist_only mode for any non-blocklisted address", async () => {
      const policy = makePolicy();
      policy.contracts.mode = "blocklist_only";

      const result = await engine.evaluate(policy, makeTx(), "jti");

      const rule = result.evaluatedRules.find((r) => r.rule === "contract_mode");
      expect(rule?.passed).toBe(true);
    });

    it("passes in verified mode for any non-blocklisted address", async () => {
      const policy = makePolicy();
      policy.contracts.mode = "verified";

      const result = await engine.evaluate(policy, makeTx(), "jti");

      const rule = result.evaluatedRules.find((r) => r.rule === "contract_mode");
      expect(rule?.passed).toBe(true);
    });
  });

  describe("Step 5: Function allowlist", () => {
    it("passes when no function restrictions configured", async () => {
      const policy = makePolicy();
      policy.contracts.mode = "blocklist_only";

      const result = await engine.evaluate(
        policy,
        makeTx({ data: "0xa9059cbb0000000000000000000000000000000000000000000000000000000000000001" }),
        "jti",
      );

      const rule = result.evaluatedRules.find((r) => r.rule === "function_allowlist");
      expect(rule?.passed).toBe(true);
    });

    it("rejects when function selector is not in allowlist", async () => {
      const policy = makePolicy();
      policy.contracts.mode = "allowlist";
      policy.contracts.allowlist = [
        {
          address: "0x1234567890abcdef1234567890abcdef12345678",
          chainId: "eip155:1",
          name: "Test Token",
          type: "token",
          allowedFunctions: [{ selector: "0xa9059cbb", name: "transfer" }],
        },
      ];

      const result = await engine.evaluate(
        policy,
        makeTx({ data: "0x23b872dd0000000000000000000000000000000000000000000000000000000000000001" }),
        "jti",
      );

      const rule = result.evaluatedRules.find((r) => r.rule === "function_allowlist");
      expect(rule?.passed).toBe(false);
    });
  });

  describe("Step 6: Token approval mode", () => {
    const approveSelector = "0x095ea7b3";
    const spender = "0000000000000000000000001234567890abcdef1234567890abcdef12345678";
    const amount100 = "0000000000000000000000000000000000000000000000000000000000000064";

    it("passes for non-approval transactions", async () => {
      const policy = makePolicy();
      policy.contracts.mode = "blocklist_only";

      const result = await engine.evaluate(
        policy,
        makeTx({ data: "0xa9059cbb" + spender + amount100 }),
        "jti",
      );

      const rule = result.evaluatedRules.find((r) => r.rule === "token_approval_mode");
      expect(rule?.passed).toBe(true);
    });

    it("passes for approval with uncapped mode", async () => {
      const policy = makePolicy();
      policy.contracts.mode = "blocklist_only";
      policy.contracts.tokenApprovalMode = "uncapped";

      const result = await engine.evaluate(
        policy,
        makeTx({ data: approveSelector + spender + amount100 }),
        "jti",
      );

      const rule = result.evaluatedRules.find((r) => r.rule === "token_approval_mode");
      expect(rule?.passed).toBe(true);
    });
  });

  describe("Step 7: Bridge mode", () => {
    it("passes for non-bridge transactions", async () => {
      const policy = makePolicy();
      policy.contracts.mode = "blocklist_only";

      const result = await engine.evaluate(policy, makeTx(), "jti");

      const rule = result.evaluatedRules.find((r) => r.rule === "bridge_mode");
      expect(rule?.passed).toBe(true);
    });

    it("rejects bridge transaction when bridging is disabled", async () => {
      assetClassifier = makeStubAssetClassifier({ isBridgeContract: async () => true });
      engine = new PolicyEngine(spendingTracker, priceOracle, tokenRevoker, assetClassifier);

      const policy = makePolicy();
      policy.contracts.mode = "blocklist_only";
      policy.bridging.mode = "no";

      const result = await engine.evaluate(policy, makeTx(), "jti");

      const rule = result.evaluatedRules.find((r) => r.rule === "bridge_mode");
      expect(rule?.passed).toBe(false);
    });

    it("passes bridge transaction when bridging is fully enabled", async () => {
      assetClassifier = makeStubAssetClassifier({ isBridgeContract: async () => true });
      engine = new PolicyEngine(spendingTracker, priceOracle, tokenRevoker, assetClassifier);

      const policy = makePolicy();
      policy.contracts.mode = "blocklist_only";
      policy.bridging.mode = "yes";

      const result = await engine.evaluate(policy, makeTx(), "jti");

      const rule = result.evaluatedRules.find((r) => r.rule === "bridge_mode");
      expect(rule?.passed).toBe(true);
    });

    it("in stables_canonical mode, rejects non-canonical bridge", async () => {
      assetClassifier = makeStubAssetClassifier({ isBridgeContract: async () => true });
      engine = new PolicyEngine(spendingTracker, priceOracle, tokenRevoker, assetClassifier);

      const policy = makePolicy();
      policy.contracts.mode = "blocklist_only";
      policy.bridging.mode = "stables_canonical";
      policy.bridging.allowedBridges = ["0xcanonical"];

      const result = await engine.evaluate(
        policy,
        makeTx({ to: "0xsomeOtherBridge" }),
        "jti",
      );

      const rule = result.evaluatedRules.find((r) => r.rule === "bridge_mode");
      expect(rule?.passed).toBe(false);
    });
  });

  describe("Step 8: Max transaction value", () => {
    it("rejects when value exceeds max", async () => {
      priceOracle = makeStubPriceOracle(1);
      engine = new PolicyEngine(spendingTracker, priceOracle, tokenRevoker, assetClassifier);

      const policy = makePolicy();
      policy.contracts.mode = "blocklist_only";
      policy.spending.maxTransactionValueUsd = 100;

      const result = await engine.evaluate(policy, makeTx({ value: "200" }), "jti");

      const rule = result.evaluatedRules.find((r) => r.rule === "max_transaction_value");
      expect(rule?.passed).toBe(false);
    });

    it("passes when value is within max", async () => {
      priceOracle = makeStubPriceOracle(1);
      engine = new PolicyEngine(spendingTracker, priceOracle, tokenRevoker, assetClassifier);

      const policy = makePolicy();
      policy.contracts.mode = "blocklist_only";
      policy.spending.maxTransactionValueUsd = 100;

      const result = await engine.evaluate(policy, makeTx({ value: "50" }), "jti");

      const rule = result.evaluatedRules.find((r) => r.rule === "max_transaction_value");
      expect(rule?.passed).toBe(true);
    });

    it("uses per-chain override when available", async () => {
      priceOracle = makeStubPriceOracle(1);
      engine = new PolicyEngine(spendingTracker, priceOracle, tokenRevoker, assetClassifier);

      const policy = makePolicy();
      policy.contracts.mode = "blocklist_only";
      policy.spending.maxTransactionValueUsd = 1000;
      policy.chains.perChainOverrides = { "eip155:1": { maxTransactionValueUsd: 50 } };

      const result = await engine.evaluate(policy, makeTx({ value: "75" }), "jti");

      const rule = result.evaluatedRules.find((r) => r.rule === "max_transaction_value");
      expect(rule?.passed).toBe(false);
    });
  });

  describe("Step 9: Daily limit", () => {
    it("rejects when daily limit would be exceeded", async () => {
      spendingTracker = makeStubSpendingTracker({ getDailySpendUsd: async () => 2400 });
      priceOracle = makeStubPriceOracle(1);
      engine = new PolicyEngine(spendingTracker, priceOracle, tokenRevoker, assetClassifier);

      const policy = makePolicy();
      policy.contracts.mode = "blocklist_only";
      policy.spending.dailyLimitUsd = 2500;

      const result = await engine.evaluate(policy, makeTx({ value: "200" }), "jti");

      const rule = result.evaluatedRules.find((r) => r.rule === "daily_limit");
      expect(rule?.passed).toBe(false);
    });

    it("passes when within daily limit", async () => {
      spendingTracker = makeStubSpendingTracker({ getDailySpendUsd: async () => 100 });
      priceOracle = makeStubPriceOracle(1);
      engine = new PolicyEngine(spendingTracker, priceOracle, tokenRevoker, assetClassifier);

      const policy = makePolicy();
      policy.contracts.mode = "blocklist_only";
      policy.spending.dailyLimitUsd = 2500;

      const result = await engine.evaluate(policy, makeTx({ value: "200" }), "jti");

      const rule = result.evaluatedRules.find((r) => r.rule === "daily_limit");
      expect(rule?.passed).toBe(true);
    });
  });

  describe("Step 10: Weekly limit", () => {
    it("rejects when weekly limit would be exceeded", async () => {
      spendingTracker = makeStubSpendingTracker({ getWeeklySpendUsd: async () => 9900 });
      priceOracle = makeStubPriceOracle(1);
      engine = new PolicyEngine(spendingTracker, priceOracle, tokenRevoker, assetClassifier);

      const policy = makePolicy();
      policy.contracts.mode = "blocklist_only";
      policy.spending.weeklyLimitUsd = 10000;

      const result = await engine.evaluate(policy, makeTx({ value: "200" }), "jti");

      const rule = result.evaluatedRules.find((r) => r.rule === "weekly_limit");
      expect(rule?.passed).toBe(false);
    });
  });

  describe("Step 11: Rate limits", () => {
    it("rejects when hourly rate limit reached", async () => {
      spendingTracker = makeStubSpendingTracker({ getHourlyTransactionCount: async () => 20 });
      engine = new PolicyEngine(spendingTracker, priceOracle, tokenRevoker, assetClassifier);

      const policy = makePolicy();
      policy.contracts.mode = "blocklist_only";
      policy.rateLimits.maxTxPerHour = 20;

      const result = await engine.evaluate(policy, makeTx(), "jti");

      const rule = result.evaluatedRules.find((r) => r.rule === "rate_limits");
      expect(rule?.passed).toBe(false);
    });

    it("rejects when daily rate limit reached", async () => {
      spendingTracker = makeStubSpendingTracker({ getDailyTransactionCount: async () => 100 });
      engine = new PolicyEngine(spendingTracker, priceOracle, tokenRevoker, assetClassifier);

      const policy = makePolicy();
      policy.contracts.mode = "blocklist_only";
      policy.rateLimits.maxTxPerDay = 100;

      const result = await engine.evaluate(policy, makeTx(), "jti");

      const rule = result.evaluatedRules.find((r) => r.rule === "rate_limits");
      expect(rule?.passed).toBe(false);
    });

    it("passes when within rate limits", async () => {
      const policy = makePolicy();
      policy.contracts.mode = "blocklist_only";

      const result = await engine.evaluate(policy, makeTx(), "jti");

      const rule = result.evaluatedRules.find((r) => r.rule === "rate_limits");
      expect(rule?.passed).toBe(true);
    });
  });

  describe("Step 12: Memecoin mode", () => {
    it("passes for non-memecoin transactions", async () => {
      const policy = makePolicy();
      policy.contracts.mode = "blocklist_only";

      const result = await engine.evaluate(policy, makeTx(), "jti");

      const rule = result.evaluatedRules.find((r) => r.rule === "memecoin_mode");
      expect(rule?.passed).toBe(true);
    });

    it("rejects memecoin tx when mode is 'no'", async () => {
      assetClassifier = makeStubAssetClassifier({ isMemecoin: async () => true });
      engine = new PolicyEngine(spendingTracker, priceOracle, tokenRevoker, assetClassifier);

      const policy = makePolicy();
      policy.contracts.mode = "blocklist_only";
      policy.memecoins.mode = "no";

      const result = await engine.evaluate(policy, makeTx(), "jti");

      const rule = result.evaluatedRules.find((r) => r.rule === "memecoin_mode");
      expect(rule?.passed).toBe(false);
    });

    it("passes memecoin tx when mode is 'yes'", async () => {
      assetClassifier = makeStubAssetClassifier({ isMemecoin: async () => true });
      engine = new PolicyEngine(spendingTracker, priceOracle, tokenRevoker, assetClassifier);

      const policy = makePolicy();
      policy.contracts.mode = "blocklist_only";
      policy.memecoins.mode = "yes";

      const result = await engine.evaluate(policy, makeTx(), "jti");

      const rule = result.evaluatedRules.find((r) => r.rule === "memecoin_mode");
      expect(rule?.passed).toBe(true);
    });

    it("rejects memecoin tx when capped and per-tx limit exceeded", async () => {
      assetClassifier = makeStubAssetClassifier({ isMemecoin: async () => true });
      priceOracle = makeStubPriceOracle(1);
      engine = new PolicyEngine(spendingTracker, priceOracle, tokenRevoker, assetClassifier);

      const policy = makePolicy();
      policy.contracts.mode = "blocklist_only";
      policy.memecoins.mode = "capped";
      policy.memecoins.perTxLimitUsd = 25;

      const result = await engine.evaluate(policy, makeTx({ value: "50" }), "jti");

      const rule = result.evaluatedRules.find((r) => r.rule === "memecoin_mode");
      expect(rule?.passed).toBe(false);
    });

    it("rejects memecoin tx when capped and daily limit exceeded", async () => {
      assetClassifier = makeStubAssetClassifier({ isMemecoin: async () => true });
      priceOracle = makeStubPriceOracle(1);
      spendingTracker = makeStubSpendingTracker({ getMemecoinDailySpendUsd: async () => 190 });
      engine = new PolicyEngine(spendingTracker, priceOracle, tokenRevoker, assetClassifier);

      const policy = makePolicy();
      policy.contracts.mode = "blocklist_only";
      policy.memecoins.mode = "capped";
      policy.memecoins.perTxLimitUsd = 100;
      policy.memecoins.dailyLimitUsd = 200;

      const result = await engine.evaluate(policy, makeTx({ value: "20" }), "jti");

      const rule = result.evaluatedRules.find((r) => r.rule === "memecoin_mode");
      expect(rule?.passed).toBe(false);
    });
  });

  describe("Autonomous threshold", () => {
    it("requires human approval when value exceeds threshold", async () => {
      priceOracle = makeStubPriceOracle(1);
      engine = new PolicyEngine(spendingTracker, priceOracle, tokenRevoker, assetClassifier);

      const policy = makePolicy();
      policy.contracts.mode = "blocklist_only";
      policy.approval.autonomousThresholdUsd = 100;

      const result = await engine.evaluate(policy, makeTx({ value: "200" }), "jti");

      expect(result.allowed).toBe(true);
      expect(result.requiresHumanApproval).toBe(true);
    });

    it("does not require human approval when value is within threshold", async () => {
      priceOracle = makeStubPriceOracle(1);
      engine = new PolicyEngine(spendingTracker, priceOracle, tokenRevoker, assetClassifier);

      const policy = makePolicy();
      policy.contracts.mode = "blocklist_only";
      policy.approval.autonomousThresholdUsd = 300;

      const result = await engine.evaluate(policy, makeTx({ value: "200" }), "jti");

      expect(result.allowed).toBe(true);
      expect(result.requiresHumanApproval).toBe(false);
    });
  });

  describe("Full pipeline happy path", () => {
    it("approves a valid transaction through all 11 checks", async () => {
      const policy = makePolicy();
      policy.contracts.mode = "blocklist_only";

      const result = await engine.evaluate(policy, makeTx({ value: "10" }), "jti");

      expect(result.allowed).toBe(true);
      expect(result.requiresHumanApproval).toBe(false);
      expect(result.evaluatedRules.length).toBeGreaterThanOrEqual(11);
      expect(result.evaluatedRules.every((r) => r.passed)).toBe(true);
    });
  });
});

describe("Presets", () => {
  it("SAFE_PRESET has conservative limits", () => {
    const policy = createPolicyFromPreset("test", "safe", "admin");
    expect(policy.spending.maxTransactionValueUsd).toBe(25);
    expect(policy.spending.dailyLimitUsd).toBe(100);
    expect(policy.contracts.mode).toBe("allowlist");
    expect(policy.bridging.mode).toBe("no");
    expect(policy.memecoins.mode).toBe("no");
  });

  it("NORMAL_PRESET has moderate limits", () => {
    const policy = createPolicyFromPreset("test", "normal", "admin");
    expect(policy.spending.maxTransactionValueUsd).toBe(250);
    expect(policy.spending.dailyLimitUsd).toBe(2500);
    expect(policy.contracts.mode).toBe("verified");
    expect(policy.bridging.mode).toBe("stables_canonical");
    expect(policy.memecoins.mode).toBe("capped");
  });

  it("DEGEN_PRESET has permissive limits", () => {
    const policy = createPolicyFromPreset("test", "degen", "admin");
    expect(policy.spending.maxTransactionValueUsd).toBe(10000);
    expect(policy.spending.dailyLimitUsd).toBe(50000);
    expect(policy.contracts.mode).toBe("blocklist_only");
    expect(policy.bridging.mode).toBe("yes");
    expect(policy.memecoins.mode).toBe("yes");
  });

  it("createPolicyFromPreset produces independent copies", () => {
    const p1 = createPolicyFromPreset("a1", "safe", "admin");
    const p2 = createPolicyFromPreset("a2", "safe", "admin");

    p1.spending.dailyLimitUsd = 999;
    expect(p2.spending.dailyLimitUsd).toBe(100);

    p1.chains.allowed.push("solana-mainnet");
    expect(p2.chains.allowed).not.toContain("solana-mainnet");
  });
});
