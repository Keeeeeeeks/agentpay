import type { AuditEntry } from "./logger.js";

export interface AuditLogEvent {
  id: string;
  agentId: string;
  tokenJti: string | null;
  timestamp: string;
  action: AuditEntry["action"];
  request: Record<string, unknown>;
  policyEvaluation: Record<string, unknown> | null;
  approval: Record<string, unknown> | null;
  signing: Record<string, unknown> | null;
  blockchain: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

type Listener = (event: AuditLogEvent) => void;

const byAgent = new Map<string, Set<Listener>>();
const globalListeners = new Set<Listener>();

export function subscribeAuditEvents(agentId: string, listener: Listener): () => void {
  const listeners = byAgent.get(agentId) ?? new Set<Listener>();
  listeners.add(listener);
  byAgent.set(agentId, listeners);

  return () => {
    const current = byAgent.get(agentId);
    if (!current) {
      return;
    }
    current.delete(listener);
    if (current.size === 0) {
      byAgent.delete(agentId);
    }
  };
}

export function subscribeAllAuditEvents(listener: Listener): () => void {
  globalListeners.add(listener);
  return () => {
    globalListeners.delete(listener);
  };
}

export function publishAuditEvent(event: AuditLogEvent): void {
  for (const listener of globalListeners) {
    listener(event);
  }

  const listeners = byAgent.get(event.agentId);
  if (!listeners) {
    return;
  }

  for (const listener of listeners) {
    listener(event);
  }
}
