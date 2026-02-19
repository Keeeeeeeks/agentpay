import { Hono } from "hono";
import { eq, and } from "drizzle-orm";

import type { PasskeyAuthEnv } from "../auth/middleware.js";
import { db, pendingApprovals, auditLogs } from "../db/index.js";
import { writeAuditLog } from "../audit/logger.js";
import type { AppContext } from "./context.js";

export function createApprovalRoutes(_ctx: AppContext) {
  const app = new Hono<PasskeyAuthEnv>();

  app.get("/", async (c) => {
    const rows = await db
      .select()
      .from(pendingApprovals)
      .where(eq(pendingApprovals.status, "pending"));

    return c.json({ approvals: rows });
  });

  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const [approval] = await db
      .select()
      .from(pendingApprovals)
      .where(eq(pendingApprovals.id, id));

    if (!approval) {
      return c.json({ error: "Approval not found" }, 404);
    }

    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.id, approval.auditLogId));

    return c.json({ approval, auditLog: audit });
  });

  app.post("/:id/approve", async (c) => {
    const id = c.req.param("id");
    const userId = c.get("passkeyUserId");

    const [approval] = await db
      .select()
      .from(pendingApprovals)
      .where(and(eq(pendingApprovals.id, id), eq(pendingApprovals.status, "pending")));

    if (!approval) {
      return c.json({ error: "Approval not found or already resolved" }, 404);
    }

    if (approval.expiresAt < new Date()) {
      await db
        .update(pendingApprovals)
        .set({ status: "expired" })
        .where(eq(pendingApprovals.id, id));

      return c.json({ error: "Approval expired" }, 410);
    }

    await db
      .update(pendingApprovals)
      .set({
        status: "approved",
        approvedBy: userId,
        approvedAt: new Date(),
      })
      .where(eq(pendingApprovals.id, id));

    await writeAuditLog({
      agentId: approval.agentId,
      action: "human_approved",
      approval: { approvalId: id, approvedBy: userId },
    });

    return c.json({ status: "approved", approvalId: id });
  });

  app.post("/:id/reject", async (c) => {
    const id = c.req.param("id");
    const userId = c.get("passkeyUserId");
    const body = await c.req.json<{ reason?: string }>();

    const [approval] = await db
      .select()
      .from(pendingApprovals)
      .where(and(eq(pendingApprovals.id, id), eq(pendingApprovals.status, "pending")));

    if (!approval) {
      return c.json({ error: "Approval not found or already resolved" }, 404);
    }

    await db
      .update(pendingApprovals)
      .set({
        status: "rejected",
        approvedBy: userId,
        approvedAt: new Date(),
      })
      .where(eq(pendingApprovals.id, id));

    await writeAuditLog({
      agentId: approval.agentId,
      action: "human_rejected",
      approval: { approvalId: id, rejectedBy: userId, reason: body.reason },
    });

    return c.json({ status: "rejected", approvalId: id });
  });

  return app;
}
