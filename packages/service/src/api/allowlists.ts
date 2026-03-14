import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";

import type { PasskeyAuthEnv } from "../auth/middleware.js";
import { db, contractAllowlists, contractAllowlistRequests } from "../db/index.js";
import type { AppContext } from "./context.js";

export function createAllowlistRoutes(_ctx: AppContext) {
  const app = new Hono<PasskeyAuthEnv>();

  app.get("/:agentId/allowlists", async (c) => {
    const agentId = c.req.param("agentId");

    const rows = await db
      .select()
      .from(contractAllowlists)
      .where(eq(contractAllowlists.agentId, agentId))
      .orderBy(desc(contractAllowlists.addedAt));

    const entries = rows.map((row) => ({
      id: row.id,
      agentId: row.agentId,
      address: row.address,
      chainId: row.chainId,
      name: row.name,
      type: row.type,
      allowedFunctions: (row.allowedFunctions ?? []) as string[],
      addedBy: row.addedBy,
      createdAt: row.addedAt.toISOString(),
    }));

    return c.json({ entries });
  });

  app.get("/:agentId/allowlist-requests", async (c) => {
    const agentId = c.req.param("agentId");

    const rows = await db
      .select()
      .from(contractAllowlistRequests)
      .where(eq(contractAllowlistRequests.agentId, agentId))
      .orderBy(desc(contractAllowlistRequests.createdAt));

    const requests = rows.map((row) => ({
      id: row.id,
      agentId: row.agentId,
      address: row.contractAddress,
      chainId: row.chainId,
      reason: row.reason,
      requestedFunctions: (row.requestedFunctions ?? []) as string[],
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    }));

    return c.json({ requests });
  });

  app.post("/:agentId/allowlist-requests/:id/approve", async (c) => {
    const requestId = c.req.param("id");
    const userId = c.get("passkeyUserId");

    const [request] = await db
      .select()
      .from(contractAllowlistRequests)
      .where(eq(contractAllowlistRequests.id, requestId));

    if (!request) {
      return c.json({ error: "Request not found" }, 404);
    }

    await db
      .update(contractAllowlistRequests)
      .set({
        status: "approved",
        reviewedBy: userId,
        reviewedAt: new Date(),
      })
      .where(eq(contractAllowlistRequests.id, requestId));

    await db.insert(contractAllowlists).values({
      agentId: request.agentId,
      address: request.contractAddress,
      chainId: request.chainId,
      name: request.contractAddress,
      type: "contract",
      allowedFunctions: request.requestedFunctions,
      addedBy: userId,
    });

    return c.json({ status: "approved" });
  });

  app.post("/:agentId/allowlist-requests/:id/reject", async (c) => {
    const requestId = c.req.param("id");
    const userId = c.get("passkeyUserId");

    const [request] = await db
      .select()
      .from(contractAllowlistRequests)
      .where(eq(contractAllowlistRequests.id, requestId));

    if (!request) {
      return c.json({ error: "Request not found" }, 404);
    }

    await db
      .update(contractAllowlistRequests)
      .set({
        status: "rejected",
        reviewedBy: userId,
        reviewedAt: new Date(),
      })
      .where(eq(contractAllowlistRequests.id, requestId));

    return c.json({ status: "rejected" });
  });

  return app;
}
