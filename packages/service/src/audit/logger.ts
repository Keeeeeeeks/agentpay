import { nanoid } from "nanoid";

import { db, auditLogs } from "../db/index.js";
import { publishAuditEvent } from "./event-bus.js";

export type AuditAction =
  | "sign_request"
  | "sign_approved"
  | "sign_rejected"
  | "sign_pending_human"
  | "human_approved"
  | "human_rejected"
  | "policy_change"
  | "token_issued"
  | "token_revoked"
  | "agent_created"
  | "agent_revoked"
  | "allowlist_request";

export interface AuditEntry {
  agentId: string;
  tokenJti?: string;
  action: AuditAction;
  request?: Record<string, unknown>;
  policyEvaluation?: Record<string, unknown>;
  approval?: Record<string, unknown>;
  signing?: Record<string, unknown>;
  blockchain?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(entry: AuditEntry): Promise<string> {
  const id = nanoid();
  const timestamp = new Date();
  const request = entry.request ?? {};
  const policyEvaluation = entry.policyEvaluation ?? null;
  const approval = entry.approval ?? null;
  const signing = entry.signing ?? null;
  const blockchain = entry.blockchain ?? null;
  const metadata = entry.metadata ?? null;

  await db.insert(auditLogs).values({
    id,
    agentId: entry.agentId,
    tokenJti: entry.tokenJti ?? null,
    timestamp,
    action: entry.action,
    request,
    policyEvaluation,
    approval,
    signing,
    blockchain,
    metadata,
  });

  publishAuditEvent({
    id,
    agentId: entry.agentId,
    tokenJti: entry.tokenJti ?? null,
    timestamp: timestamp.toISOString(),
    action: entry.action,
    request,
    policyEvaluation,
    approval,
    signing,
    blockchain,
    metadata,
  });

  return id;
}
