export type FeedRiskLevel = "info" | "warning" | "critical";

export interface DecodedAuditLog {
  summary: string;
  reason: string | null;
  protocol: string | null;
  amount: string | null;
  riskLevel: FeedRiskLevel;
}

type JsonMap = Record<string, unknown>;

function asObject(value: unknown): JsonMap {
  return value && typeof value === "object" ? (value as JsonMap) : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function detectRiskLevel(action: string): FeedRiskLevel {
  if (action.includes("rejected")) {
    return "critical";
  }
  if (action.includes("pending") || action.includes("approval")) {
    return "warning";
  }
  return "info";
}

function buildSummary(action: string, protocol: string | null, reason: string | null): string {
  const protocolPart = protocol ? ` on ${protocol}` : "";
  const reasonPart = reason ? ` for ${reason}` : "";

  switch (action) {
    case "sign_approved":
      return `Agent signed and broadcast a transaction${protocolPart}${reasonPart}`;
    case "sign_pending_human":
      return `Agent requested human approval for a transaction${protocolPart}${reasonPart}`;
    case "sign_rejected":
      return `Agent transaction was rejected by policy${protocolPart}${reasonPart}`;
    case "human_approved":
      return "Human approved a pending agent transaction";
    case "human_rejected":
      return "Human rejected a pending agent transaction";
    case "policy_change":
      return "Agent policy was updated";
    case "token_issued":
      return "A new agent token was issued";
    case "token_revoked":
      return "An agent token was revoked";
    case "agent_created":
      return "Agent was created";
    case "agent_revoked":
      return "Agent was disabled or revoked";
    case "allowlist_request":
      return "Agent requested contract allowlist access";
    default:
      return `Agent action: ${action}`;
  }
}

export function decodeAuditLog(log: {
  action: string;
  request: unknown;
  metadata: unknown;
}): DecodedAuditLog {
  const request = asObject(log.request);
  const metadata = asObject(log.metadata);

  const reason = asString(request.reason) ?? asString(metadata.reason);
  const protocol = asString(metadata.protocol) ?? asString(request.protocol);
  const amount = asString(request.value) ?? asString(metadata.amount);
  const riskLevel = detectRiskLevel(log.action);

  return {
    summary: buildSummary(log.action, protocol, reason),
    reason,
    protocol,
    amount,
    riskLevel,
  };
}
