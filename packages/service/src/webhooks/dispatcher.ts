import { createHmac } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { AuditLogEvent } from "../audit/event-bus.js";
import { subscribeAllAuditEvents } from "../audit/event-bus.js";
import { decodeAuditLog } from "../audit/feed.js";
import { db, webhookDeliveries, webhooks } from "../db/index.js";

const MAX_ATTEMPTS = 3;

interface WebhookRecord {
  id: string;
  url: string;
  secret: string;
  subscribedActions: unknown;
}

function shouldSend(action: string, subscribedActions: unknown): boolean {
  if (!Array.isArray(subscribedActions) || subscribedActions.length === 0) {
    return true;
  }

  return subscribedActions.some((item) => typeof item === "string" && item === action);
}

function buildPayload(event: AuditLogEvent) {
  return {
    type: "audit_log",
    log: {
      ...event,
      decoded: decodeAuditLog(event),
    },
  };
}

async function sendToWebhook(webhook: WebhookRecord, event: AuditLogEvent, attempt: number): Promise<void> {
  const payload = buildPayload(event);
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", webhook.secret).update(body).digest("hex");

  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AgentPay-Signature": signature,
        "X-AgentPay-Event": "audit_log",
      },
      body,
    });

    const successful = response.status >= 200 && response.status < 300;

    await db.insert(webhookDeliveries).values({
      webhookId: webhook.id,
      auditLogId: event.id,
      status: successful ? "success" : "failed",
      attempt,
      responseCode: response.status,
      error: successful ? null : `HTTP ${response.status}`,
      nextRetryAt: successful || attempt >= MAX_ATTEMPTS
        ? null
        : new Date(Date.now() + 2000 * attempt),
    });

    if (!successful && attempt < MAX_ATTEMPTS) {
      setTimeout(() => {
        void sendToWebhook(webhook, event, attempt + 1);
      }, 2000 * attempt);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const nextRetryAt = attempt < MAX_ATTEMPTS ? new Date(Date.now() + 2000 * attempt) : null;

    await db.insert(webhookDeliveries).values({
      webhookId: webhook.id,
      auditLogId: event.id,
      status: "failed",
      attempt,
      responseCode: null,
      error: message,
      nextRetryAt,
    });

    if (attempt < MAX_ATTEMPTS) {
      setTimeout(() => {
        void sendToWebhook(webhook, event, attempt + 1);
      }, 2000 * attempt);
    }
  }
}

async function dispatchEvent(event: AuditLogEvent): Promise<void> {
  const rows = await db
    .select({
      id: webhooks.id,
      url: webhooks.url,
      secret: webhooks.secret,
      subscribedActions: webhooks.subscribedActions,
    })
    .from(webhooks)
    .where(and(eq(webhooks.agentId, event.agentId), eq(webhooks.enabled, true)));

  for (const row of rows) {
    if (!shouldSend(event.action, row.subscribedActions)) {
      continue;
    }
    void sendToWebhook(row, event, 1);
  }
}

export function startWebhookDispatcher(): () => void {
  const unsubscribe = subscribeAllAuditEvents((event) => {
    void dispatchEvent(event);
  });

  return unsubscribe;
}
