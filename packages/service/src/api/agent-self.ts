import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";

import type { AgentAuthEnv } from "../auth/middleware.js";
import type { AgentPolicy } from "../policy/types.js";
import type { BalanceResponse, PolicyRemainingResponse } from "./types.js";
import { db, agentWallets, walletAddresses, agentPolicies, spendingTracking, contractAllowlistRequests } from "../db/index.js";
import { writeAuditLog } from "../audit/logger.js";
import type { AppContext } from "./context.js";

export function createAgentSelfRoutes(ctx: AppContext) {
  const app = new Hono<AgentAuthEnv>();

  app.get("/wallets/me", async (c) => {
    const agentToken = c.get("agentToken");

    const [wallet] = await db
      .select()
      .from(agentWallets)
      .where(eq(agentWallets.agentId, agentToken.sub));

    if (!wallet) {
      return c.json({ error: "No wallet found for agent" }, 404);
    }

    const addresses = await db
      .select()
      .from(walletAddresses)
      .where(eq(walletAddresses.walletId, wallet.id));

    return c.json({
      walletId: wallet.id,
      provider: wallet.provider,
      addresses: addresses.map((a: { chainId: string; address: string }) => ({
        chainId: a.chainId,
        address: a.address,
      })),
      authorizedChains: agentToken.ap.chains,
    });
  });

  app.get("/policy/me", async (c) => {
    const agentToken = c.get("agentToken");

    const [latest] = await db
      .select()
      .from(agentPolicies)
      .where(eq(agentPolicies.agentId, agentToken.sub))
      .orderBy(desc(agentPolicies.version))
      .limit(1);

    if (!latest) {
      return c.json({ error: "No policy found" }, 404);
    }

    const policy = latest.data as AgentPolicy;

    return c.json({
      id: latest.id,
      preset: latest.preset,
      version: latest.version,
      spending: policy.spending,
      rateLimits: policy.rateLimits,
      approval: policy.approval,
      chains: policy.chains,
      contracts: { mode: policy.contracts.mode },
      bridging: { mode: policy.bridging.mode },
      memecoins: { mode: policy.memecoins.mode },
    });
  });

  app.get("/policy/me/remaining", async (c) => {
    const agentToken = c.get("agentToken");

    const [latest] = await db
      .select()
      .from(agentPolicies)
      .where(eq(agentPolicies.agentId, agentToken.sub))
      .orderBy(desc(agentPolicies.version))
      .limit(1);

    if (!latest) {
      return c.json({ error: "No policy found" }, 404);
    }

    const policy = latest.data as AgentPolicy;
    const today = new Date().toISOString().split("T")[0] ?? "";

    const spendingRows = await db
      .select()
      .from(spendingTracking)
      .where(eq(spendingTracking.agentId, agentToken.sub));

    type SpendingRow = typeof spendingRows[number];
    const todayRows = spendingRows.filter((r: SpendingRow) => r.date === today);
    const dailySpent = todayRows.reduce((sum: number, r: SpendingRow) => sum + Number(r.totalUsd), 0);
    const dailyTxCount = todayRows.reduce((sum: number, r: SpendingRow) => sum + r.transactionCount, 0);

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    const weeklySpent = spendingRows
      .filter((r: SpendingRow) => new Date(r.date) >= weekStart)
      .reduce((sum: number, r: SpendingRow) => sum + Number(r.totalUsd), 0);

    const response: PolicyRemainingResponse = {
      dailyLimitUsd: policy.spending.dailyLimitUsd,
      dailySpentUsd: dailySpent,
      dailyRemainingUsd: Math.max(0, policy.spending.dailyLimitUsd - dailySpent),
      weeklyLimitUsd: policy.spending.weeklyLimitUsd,
      weeklySpentUsd: weeklySpent,
      weeklyRemainingUsd: Math.max(0, policy.spending.weeklyLimitUsd - weeklySpent),
      txThisHour: 0,
      maxTxPerHour: policy.rateLimits.maxTxPerHour,
      txToday: dailyTxCount,
      maxTxPerDay: policy.rateLimits.maxTxPerDay,
    };

    return c.json(response);
  });

  app.get("/policy/me/can-transact", async (c) => {
    const agentToken = c.get("agentToken");
    const chainId = c.req.query("chainId");
    const to = c.req.query("to");
    const value = c.req.query("value");

    if (!chainId || !to || !value) {
      return c.json({ error: "chainId, to, and value query params required" }, 400);
    }

    if (!agentToken.ap.chains.includes(chainId)) {
      return c.json({
        canTransact: false,
        wouldRequireApproval: false,
        reason: `Chain ${chainId} not authorized for this token`,
      });
    }

    const [latest] = await db
      .select()
      .from(agentPolicies)
      .where(eq(agentPolicies.agentId, agentToken.sub))
      .orderBy(desc(agentPolicies.version))
      .limit(1);

    if (!latest) {
      return c.json({
        canTransact: false,
        wouldRequireApproval: false,
        reason: "No policy found for agent",
      });
    }

    const policy = latest.data as AgentPolicy;
    policy.agentId = agentToken.sub;

    const tx = { chainId, to, value, urgency: "medium" as const, reason: "pre-check" };
    const result = await ctx.policyEngine.evaluate(policy, tx, agentToken.jti);

    return c.json({
      canTransact: result.allowed,
      wouldRequireApproval: result.requiresHumanApproval,
      reason: result.reason,
    });
  });

  app.post("/allowlist/request", async (c) => {
    const agentToken = c.get("agentToken");
    const body = await c.req.json<{
      contractAddress: string;
      chainId: string;
      reason: string;
      functions?: string[];
    }>();

    if (!body.contractAddress || !body.chainId || !body.reason) {
      return c.json({ error: "contractAddress, chainId, and reason are required" }, 400);
    }

    await db.insert(contractAllowlistRequests).values({
      agentId: agentToken.sub,
      contractAddress: body.contractAddress,
      chainId: body.chainId,
      reason: body.reason,
      requestedFunctions: body.functions ?? [],
    });

    await writeAuditLog({
      agentId: agentToken.sub,
      tokenJti: agentToken.jti,
      action: "allowlist_request",
      metadata: {
        contractAddress: body.contractAddress,
        chainId: body.chainId,
        reason: body.reason,
      },
    });

    return c.json({ success: true }, 201);
  });

  return app;
}
