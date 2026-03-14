import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import type { PasskeyAuthEnv } from "../auth/middleware.js";
import { db, webhooks } from "../db/index.js";
import type { AppContext } from "./context.js";

interface CreateWebhookBody {
  agentId: string;
  url: string;
  subscribedActions?: string[];
}

interface UpdateWebhookBody {
  enabled?: boolean;
  url?: string;
  subscribedActions?: string[];
}

function isValidWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function createWebhookRoutes(_ctx: AppContext) {
  const app = new Hono<PasskeyAuthEnv>();

  app.post("/", async (c) => {
    const body = await c.req.json<CreateWebhookBody>();

    if (!body.agentId || !body.url) {
      return c.json({ error: "agentId and url are required" }, 400);
    }

    if (!isValidWebhookUrl(body.url)) {
      return c.json({ error: "Webhook url must be a valid https URL" }, 400);
    }

    const [webhook] = await db
      .insert(webhooks)
      .values({
        agentId: body.agentId,
        url: body.url,
        secret: nanoid(48),
        enabled: true,
        subscribedActions: body.subscribedActions ?? [],
      })
      .returning();

    return c.json({ webhook }, 201);
  });

  app.get("/:agentId", async (c) => {
    const agentId = c.req.param("agentId");
    const rows = await db.select().from(webhooks).where(eq(webhooks.agentId, agentId));
    return c.json({ webhooks: rows });
  });

  app.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<UpdateWebhookBody>();

    if (body.url && !isValidWebhookUrl(body.url)) {
      return c.json({ error: "Webhook url must be a valid https URL" }, 400);
    }

    const [updated] = await db
      .update(webhooks)
      .set({
        ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}),
        ...(body.url ? { url: body.url } : {}),
        ...(body.subscribedActions ? { subscribedActions: body.subscribedActions } : {}),
        updatedAt: new Date(),
      })
      .where(eq(webhooks.id, id))
      .returning();

    if (!updated) {
      return c.json({ error: "Webhook not found" }, 404);
    }

    return c.json({ webhook: updated });
  });

  app.delete("/:id", async (c) => {
    const id = c.req.param("id");

    const [updated] = await db
      .update(webhooks)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(webhooks.id, id))
      .returning();

    if (!updated) {
      return c.json({ error: "Webhook not found" }, 404);
    }

    return c.json({ disabled: true, id });
  });

  return app;
}
