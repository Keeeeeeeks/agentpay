import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";

import type { PasskeyAuthEnv } from "../auth/middleware.js";
import { db, auditLogs } from "../db/index.js";
import type { AppContext } from "./context.js";

export function createAuditRoutes(_ctx: AppContext) {
  const app = new Hono<PasskeyAuthEnv>();

  app.get("/:agentId", async (c) => {
    const agentId = c.req.param("agentId");
    const limit = Number(c.req.query("limit") ?? "50");
    const offset = Number(c.req.query("offset") ?? "0");

    const rows = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.agentId, agentId))
      .orderBy(desc(auditLogs.timestamp))
      .limit(limit)
      .offset(offset);

    return c.json({ logs: rows, limit, offset });
  });

  app.get("/:agentId/:logId", async (c) => {
    const logId = c.req.param("logId");

    const [log] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.id, logId));

    if (!log) {
      return c.json({ error: "Audit log not found" }, 404);
    }

    return c.json(log);
  });

  return app;
}
