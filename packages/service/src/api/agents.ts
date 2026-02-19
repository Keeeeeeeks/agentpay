import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";

import type { PasskeyAuthEnv } from "../auth/middleware.js";
import { db, agents, agentWallets, walletAddresses, agentPolicies, agentTokens } from "../db/index.js";
import { createPolicyFromPreset } from "../policy/presets.js";
import type { PolicyPreset } from "../policy/types.js";
import { writeAuditLog } from "../audit/logger.js";
import type { AppContext } from "./context.js";

export function createAgentRoutes(ctx: AppContext) {
  const app = new Hono<PasskeyAuthEnv>();

  app.post("/", async (c) => {
    const body = await c.req.json<{
      name: string;
      preset?: PolicyPreset;
      chains?: string[];
    }>();

    if (!body.name) {
      return c.json({ error: "name is required" }, 400);
    }

    const preset = body.preset ?? "safe";
    const userId = c.get("passkeyUserId");

    const [agent] = await db
      .insert(agents)
      .values({ name: body.name, createdBy: userId })
      .returning();

    if (!agent) {
      return c.json({ error: "Failed to create agent" }, 500);
    }

    const wallet = await ctx.signingProvider.createWallet("EVM", agent.id);
    const [walletRow] = await db
      .insert(agentWallets)
      .values({
        agentId: agent.id,
        provider: ctx.signingProvider.name,
        providerWalletId: wallet.walletId,
      })
      .returning();

    if (walletRow) {
      await db.insert(walletAddresses).values({
        walletId: walletRow.id,
        chainId: wallet.chainId,
        address: wallet.address,
      });
    }

    const policy = createPolicyFromPreset(agent.id, preset, userId);
    if (body.chains) {
      policy.chains.allowed = body.chains;
    }

    await db.insert(agentPolicies).values({
      id: policy.id,
      agentId: agent.id,
      version: policy.version,
      preset,
      data: policy,
      createdBy: userId,
    });

    await writeAuditLog({
      agentId: agent.id,
      action: "agent_created",
      metadata: { name: body.name, preset },
    });

    return c.json({
      id: agent.id,
      name: agent.name,
      status: agent.status,
      walletId: walletRow?.id,
      address: wallet.address,
      policyId: policy.id,
      preset,
    }, 201);
  });

  app.get("/", async (c) => {
    const rows = await db.select().from(agents);
    return c.json({ agents: rows });
  });

  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const [agent] = await db.select().from(agents).where(eq(agents.id, id));
    if (!agent) {
      return c.json({ error: "Agent not found" }, 404);
    }

    const wallets = await db
      .select()
      .from(agentWallets)
      .where(eq(agentWallets.agentId, id));

    const policies = await db
      .select()
      .from(agentPolicies)
      .where(eq(agentPolicies.agentId, id))
      .orderBy(desc(agentPolicies.version));

    const latestPolicy = policies[0];

    return c.json({
      ...agent,
      wallets,
      currentPolicy: latestPolicy,
    });
  });

  app.patch("/:id/disable", async (c) => {
    const id = c.req.param("id");
    const userId = c.get("passkeyUserId");

    const [updated] = await db
      .update(agents)
      .set({
        status: "disabled",
        disabledAt: new Date(),
        disabledBy: userId,
      })
      .where(eq(agents.id, id))
      .returning();

    if (!updated) {
      return c.json({ error: "Agent not found" }, 404);
    }

    await writeAuditLog({
      agentId: id,
      action: "agent_revoked",
      metadata: { disabledBy: userId },
    });

    return c.json(updated);
  });

  app.delete("/:id", async (c) => {
    const id = c.req.param("id");
    const userId = c.get("passkeyUserId");

    const [agent] = await db.select().from(agents).where(eq(agents.id, id));
    if (!agent) {
      return c.json({ error: "Agent not found" }, 404);
    }

    const tokens = await db
      .select()
      .from(agentTokens)
      .where(eq(agentTokens.agentId, id));

    for (const token of tokens) {
      if (!token.revokedAt) {
        await ctx.jwtService.revokeToken(token.jti);
      }
    }

    await db
      .update(agents)
      .set({
        status: "deleted",
        disabledAt: new Date(),
        disabledBy: userId,
      })
      .where(eq(agents.id, id));

    await writeAuditLog({
      agentId: id,
      action: "agent_revoked",
      metadata: { deletedBy: userId, tokensRevoked: tokens.length },
    });

    return c.json({ deleted: true, id, tokensRevoked: tokens.length });
  });

  return app;
}
