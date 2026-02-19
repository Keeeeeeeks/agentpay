import { Hono } from "hono";
import { eq, desc, sql } from "drizzle-orm";

import type { PasskeyAuthEnv } from "../auth/middleware.js";
import { db, agentPolicies, spendingTracking } from "../db/index.js";
import { createPolicyFromPreset } from "../policy/presets.js";
import type { AgentPolicy, PolicyPreset } from "../policy/types.js";
import type { PolicyRemainingResponse } from "./types.js";
import { writeAuditLog } from "../audit/logger.js";
import type { AppContext } from "./context.js";

export function createPolicyRoutes(_ctx: AppContext) {
  const app = new Hono<PasskeyAuthEnv>();

  app.get("/:agentId/policy", async (c) => {
    const agentId = c.req.param("agentId");

    const [latest] = await db
      .select()
      .from(agentPolicies)
      .where(eq(agentPolicies.agentId, agentId))
      .orderBy(desc(agentPolicies.version))
      .limit(1);

    if (!latest) {
      return c.json({ error: "No policy found" }, 404);
    }

    return c.json(latest);
  });

  app.put("/:agentId/policy", async (c) => {
    const agentId = c.req.param("agentId");
    const userId = c.get("passkeyUserId");
    const body = await c.req.json<{
      preset?: PolicyPreset;
      overrides?: Partial<AgentPolicy>;
      changeSummary?: string;
    }>();

    const [maxRow] = await db
      .select({ maxVersion: sql<number>`COALESCE(MAX(${agentPolicies.version}), 0)` })
      .from(agentPolicies)
      .where(eq(agentPolicies.agentId, agentId));

    const currentVersion = maxRow?.maxVersion ?? 0;

    const preset = body.preset ?? "custom";
    const newPolicy = createPolicyFromPreset(agentId, preset, userId);
    newPolicy.version = currentVersion + 1;

    if (body.overrides) {
      if (body.overrides.spending) {
        Object.assign(newPolicy.spending, body.overrides.spending);
      }
      if (body.overrides.rateLimits) {
        Object.assign(newPolicy.rateLimits, body.overrides.rateLimits);
      }
      if (body.overrides.approval) {
        Object.assign(newPolicy.approval, body.overrides.approval);
      }
      if (body.overrides.contracts) {
        Object.assign(newPolicy.contracts, body.overrides.contracts);
      }
      if (body.overrides.bridging) {
        Object.assign(newPolicy.bridging, body.overrides.bridging);
      }
      if (body.overrides.memecoins) {
        Object.assign(newPolicy.memecoins, body.overrides.memecoins);
      }
      if (body.overrides.chains) {
        Object.assign(newPolicy.chains, body.overrides.chains);
      }
    }

    await db.insert(agentPolicies).values({
      id: newPolicy.id,
      agentId,
      version: newPolicy.version,
      preset,
      data: newPolicy,
      createdBy: userId,
      changeSummary: body.changeSummary,
    });

    await writeAuditLog({
      agentId,
      action: "policy_change",
      metadata: {
        newVersion: newPolicy.version,
        preset,
        changeSummary: body.changeSummary,
        changedBy: userId,
      },
    });

    return c.json(newPolicy);
  });

  app.get("/:agentId/policy/history", async (c) => {
    const agentId = c.req.param("agentId");

    const policies = await db
      .select()
      .from(agentPolicies)
      .where(eq(agentPolicies.agentId, agentId))
      .orderBy(desc(agentPolicies.version));

    return c.json({ history: policies });
  });

  app.get("/:agentId/policy/remaining", async (c) => {
    const agentId = c.req.param("agentId");

    const [latest] = await db
      .select()
      .from(agentPolicies)
      .where(eq(agentPolicies.agentId, agentId))
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
      .where(eq(spendingTracking.agentId, agentId));

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

  return app;
}
