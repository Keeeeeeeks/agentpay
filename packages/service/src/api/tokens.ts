import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";

import type { PasskeyAuthEnv } from "../auth/middleware.js";
import { db, agentTokens, agentWallets, agentPolicies } from "../db/index.js";
import { writeAuditLog } from "../audit/logger.js";
import type { TokenIssueRequest } from "../auth/types.js";
import type { PolicyPreset } from "../policy/types.js";
import type { AppContext } from "./context.js";

export function createTokenRoutes(ctx: AppContext) {
  const app = new Hono<PasskeyAuthEnv>();

  app.post("/:agentId/tokens", async (c) => {
    const agentId = c.req.param("agentId");
    const body = await c.req.json<{
      chains?: string[];
      expiresInSeconds?: number;
    }>();

    const [wallet] = await db
      .select()
      .from(agentWallets)
      .where(eq(agentWallets.agentId, agentId));

    if (!wallet) {
      return c.json({ error: "Agent has no wallet" }, 404);
    }

    const policies = await db
      .select()
      .from(agentPolicies)
      .where(eq(agentPolicies.agentId, agentId))
      .orderBy(desc(agentPolicies.version));

    const latestPolicy = policies[0];
    if (!latestPolicy) {
      return c.json({ error: "Agent has no policy" }, 404);
    }

    const policyData = latestPolicy.data as { chains?: { allowed?: string[] } };
    const chains = body.chains ?? policyData.chains?.allowed ?? ["eip155:1"];

    const request: TokenIssueRequest = {
      agentId,
      walletId: wallet.id,
      chains,
      policyId: latestPolicy.id,
      preset: latestPolicy.preset as PolicyPreset,
      expiresInSeconds: body.expiresInSeconds,
    };

    const tokenPair = await ctx.jwtService.issueTokenPair(request);

    const result = await ctx.jwtService.validateToken(tokenPair.accessToken);
    if (!result.valid || !result.payload) {
      return c.json({ error: "Failed to validate issued token" }, 500);
    }

    const ttl = body.expiresInSeconds ?? 86400;
    await db.insert(agentTokens).values({
      jti: result.payload.jti,
      agentId,
      expiresAt: new Date(Date.now() + ttl * 1000),
    });

    await writeAuditLog({
      agentId,
      tokenJti: result.payload.jti,
      action: "token_issued",
      metadata: { chains, ttl },
    });

    return c.json({
      token: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      jti: result.payload.jti,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      chains,
    }, 201);
  });

  app.get("/:agentId/tokens", async (c) => {
    const agentId = c.req.param("agentId");
    const rows = await db
      .select()
      .from(agentTokens)
      .where(eq(agentTokens.agentId, agentId));

    type TokenRow = typeof rows[number];
    return c.json({
      tokens: rows.map((t: TokenRow) => ({
        jti: t.jti,
        issuedAt: t.issuedAt,
        expiresAt: t.expiresAt,
        revokedAt: t.revokedAt,
        lastUsedAt: t.lastUsedAt,
        useCount: t.useCount,
        active: !t.revokedAt && t.expiresAt > new Date(),
      })),
    });
  });

  app.delete("/:agentId/tokens/:jti", async (c) => {
    const agentId = c.req.param("agentId");
    const jti = c.req.param("jti");
    const userId = c.get("passkeyUserId");

    const [tokenRow] = await db
      .select()
      .from(agentTokens)
      .where(and(eq(agentTokens.jti, jti), eq(agentTokens.agentId, agentId)));

    if (!tokenRow) {
      return c.json({ error: "Token not found" }, 404);
    }

    await ctx.jwtService.revokeToken(jti);

    await db
      .update(agentTokens)
      .set({ revokedAt: new Date(), revokedBy: userId })
      .where(eq(agentTokens.jti, jti));

    await writeAuditLog({
      agentId,
      tokenJti: jti,
      action: "token_revoked",
      metadata: { revokedBy: userId },
    });

    return c.json({ revoked: true, jti });
  });

  return app;
}
