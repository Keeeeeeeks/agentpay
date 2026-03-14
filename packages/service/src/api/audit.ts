import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { streamSSE } from "hono/streaming";

import type { PasskeyAuthEnv } from "../auth/middleware.js";
import { db, auditLogs } from "../db/index.js";
import type { AppContext } from "./context.js";
import { decodeAuditLog } from "../audit/feed.js";
import { subscribeAuditEvents } from "../audit/event-bus.js";

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

    const logs = rows.map((log) => ({
      ...log,
      timestamp: log.timestamp.toISOString(),
      decoded: decodeAuditLog(log),
    }));

    return c.json({ logs, limit, offset });
  });

  app.get("/:agentId/stream", async (c) => {
    const agentId = c.req.param("agentId");

    return streamSSE(c, async (stream) => {
      let closed = false;

      const unsubscribe = subscribeAuditEvents(agentId, (event) => {
        void stream.writeSSE({
          event: "audit_log",
          data: JSON.stringify({
            type: "audit_log",
            log: {
              ...event,
              decoded: decodeAuditLog(event),
            },
          }),
        });
      });

      await stream.writeSSE({
        event: "connected",
        data: JSON.stringify({ type: "connected", agentId }),
      });

      c.req.raw.signal.addEventListener("abort", () => {
        closed = true;
      });

      while (!closed) {
        await stream.writeSSE({
          event: "heartbeat",
          data: JSON.stringify({ type: "heartbeat", ts: new Date().toISOString() }),
        });
        await stream.sleep(15000);
      }

      unsubscribe();
    });
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

    return c.json({
      ...log,
      timestamp: log.timestamp.toISOString(),
      decoded: decodeAuditLog(log),
    });
  });

  return app;
}
