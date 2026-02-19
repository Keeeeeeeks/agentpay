import { Hono } from "hono";
import { nanoid } from "nanoid";

import type { AgentAuthEnv } from "../auth/middleware.js";
import type { TransactionRequest, TransactionResponse } from "./types.js";
import type { AgentPolicy } from "../policy/types.js";
import { db, agentPolicies, pendingApprovals } from "../db/index.js";
import { eq, desc } from "drizzle-orm";
import { writeAuditLog } from "../audit/logger.js";
import type { AppContext } from "./context.js";

export function createTransactionRoutes(ctx: AppContext) {
  const app = new Hono<AgentAuthEnv>();

  app.post("/sign", async (c) => {
    const agentToken = c.get("agentToken");
    const body = await c.req.json<TransactionRequest>();

    if (!body.chainId || !body.to || !body.value) {
      return c.json({ error: "chainId, to, and value are required" }, 400);
    }

    if (!agentToken.ap.chains.includes(body.chainId)) {
      return c.json({ error: `Chain ${body.chainId} not authorized for this token` }, 403);
    }

    const policies = await db
      .select()
      .from(agentPolicies)
      .where(eq(agentPolicies.agentId, agentToken.sub))
      .orderBy(desc(agentPolicies.version));

    const latestPolicy = policies[0];
    if (!latestPolicy) {
      return c.json({ error: "No policy found for agent" }, 500);
    }

    const policy = latestPolicy.data as AgentPolicy;
    policy.agentId = agentToken.sub;

    const policyResult = await ctx.policyEngine.evaluate(policy, body, agentToken.jti);

    if (!policyResult.allowed) {
      const auditId = await writeAuditLog({
        agentId: agentToken.sub,
        tokenJti: agentToken.jti,
        action: "sign_rejected",
        request: body as unknown as Record<string, unknown>,
        policyEvaluation: policyResult as unknown as Record<string, unknown>,
      });

      const response: TransactionResponse = {
        status: "rejected",
        rejectionReason: policyResult.reason,
        auditId,
      };
      return c.json(response, 403);
    }

    if (policyResult.requiresHumanApproval) {
      const auditId = await writeAuditLog({
        agentId: agentToken.sub,
        tokenJti: agentToken.jti,
        action: "sign_pending_human",
        request: body as unknown as Record<string, unknown>,
        policyEvaluation: policyResult as unknown as Record<string, unknown>,
      });

      const [approval] = await db
        .insert(pendingApprovals)
        .values({
          auditLogId: auditId,
          agentId: agentToken.sub,
          expiresAt: new Date(Date.now() + 3600_000),
        })
        .returning();

      const response: TransactionResponse = {
        status: "pending_human",
        approvalUrl: `/api/approvals/${approval?.id}`,
        auditId,
      };
      return c.json(response, 202);
    }

    const chain = ctx.chainRegistry.get(body.chainId);
    if (!chain) {
      return c.json({ error: `Chain ${body.chainId} not supported` }, 400);
    }

    const signResult = await ctx.signingProvider.signTransaction({
      chainId: body.chainId,
      to: body.to,
      value: body.value,
      data: body.data,
    });

    let txHash: string;
    try {
      txHash = await chain.broadcastTransaction(signResult.signedTransaction);
    } catch (broadcastError) {
      txHash = signResult.hash;
    }

    const valueUsd = Number(body.value) || 0;

    if (ctx.spendingTracker) {
      await ctx.spendingTracker.recordSpend({
        agentId: agentToken.sub,
        chainId: body.chainId,
        amountUsd: valueUsd,
        isMemecoin: false,
        isBridge: false,
      });
    }

    const auditId = await writeAuditLog({
      agentId: agentToken.sub,
      tokenJti: agentToken.jti,
      action: "sign_approved",
      request: body as unknown as Record<string, unknown>,
      policyEvaluation: policyResult as unknown as Record<string, unknown>,
      signing: { hash: signResult.hash },
      blockchain: { txHash, chainId: body.chainId },
    });

    const response: TransactionResponse = {
      status: "approved",
      transactionHash: txHash,
      auditId,
    };
    return c.json(response);
  });

  app.get("/status/:hash", async (c) => {
    const hash = c.req.param("hash");
    const agentToken = c.get("agentToken");

    for (const chainId of agentToken.ap.chains) {
      const chain = ctx.chainRegistry.get(chainId);
      if (!chain) continue;

      try {
        const tx = await chain.getTransaction(hash);
        if (tx) {
          return c.json(tx);
        }
      } catch {
        continue;
      }
    }

    return c.json({ error: "Transaction not found" }, 404);
  });

  return app;
}
