import { nanoid } from "nanoid";

import { db, auditLogs } from "../db/index.js";

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

  await db.insert(auditLogs).values({
    id,
    agentId: entry.agentId,
    tokenJti: entry.tokenJti ?? null,
    action: entry.action,
    request: entry.request ?? {},
    policyEvaluation: entry.policyEvaluation ?? null,
    approval: entry.approval ?? null,
    signing: entry.signing ?? null,
    blockchain: entry.blockchain ?? null,
    metadata: entry.metadata ?? null,
  });

  return id;
}
