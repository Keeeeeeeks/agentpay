import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, type AgentDetail as AgentDetailType, type TokenInfo, type AuditLog } from "../api";
import StatusBadge from "../components/StatusBadge";
import PresetBadge from "../components/PresetBadge";
import Spinner from "../components/Spinner";
import ErrorMessage from "../components/ErrorMessage";

const CHAINS = [
  { id: "eip155:1", label: "Ethereum", short: "ETH" },
  { id: "eip155:8453", label: "Base", short: "BASE" },
  { id: "eip155:42161", label: "Arbitrum", short: "ARB" },
  { id: "eip155:10", label: "Optimism", short: "OP" },
];

const PRESET_OPTIONS = ["safe", "normal", "degen"];

function SpendingBar({ label, spent, limit }: { label: string; spent: number; limit: number }) {
  const pct = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
  const remaining = Math.max(limit - spent, 0);
  const color = pct > 90 ? "bg-danger" : pct > 70 ? "bg-warning" : "bg-accent";

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-medium text-text-secondary">{label}</span>
        <span className="font-mono text-xs text-text-tertiary">
          ${remaining.toLocaleString(undefined, { maximumFractionDigits: 2 })} remaining
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-3">
        <div
          className={`h-full rounded-full ${color} transition-all duration-700 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between">
        <span className="font-mono text-[10px] text-text-tertiary">
          ${spent.toLocaleString(undefined, { maximumFractionDigits: 2 })} spent
        </span>
        <span className="font-mono text-[10px] text-text-tertiary">
          ${limit.toLocaleString(undefined, { maximumFractionDigits: 2 })} limit
        </span>
      </div>
    </div>
  );
}

function RateBar({ label, current, max }: { label: string; current: number; max: number }) {
  const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  const color = pct > 90 ? "bg-danger" : pct > 70 ? "bg-warning" : "bg-info";

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-medium text-text-secondary">{label}</span>
        <span className="font-mono text-xs text-text-tertiary">{current} / {max}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-3">
        <div
          className={`h-full rounded-full ${color} transition-all duration-700 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function TokenRow({ token, agentId, onRevoked }: { token: TokenInfo; agentId: string; onRevoked: () => void }) {
  const [revoking, setRevoking] = useState(false);

  const status = token.revokedAt ? "revoked" : !token.active ? "expired" : "active";

  const handleRevoke = async () => {
    setRevoking(true);
    try {
      await api.tokens.revoke(agentId, token.jti);
      onRevoked();
    } catch {
      setRevoking(false);
    }
  };

  return (
    <tr className="border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors">
      <td className="px-4 py-3">
        <span className="font-mono text-xs text-text-primary">{token.jti.slice(0, 16)}...</span>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={status} />
      </td>
      <td className="px-4 py-3 hidden sm:table-cell">
        <span className="font-mono text-[11px] text-text-tertiary">
          {new Date(token.issuedAt).toLocaleString()}
        </span>
      </td>
      <td className="px-4 py-3 hidden md:table-cell">
        <span className="font-mono text-[11px] text-text-tertiary">
          {new Date(token.expiresAt).toLocaleString()}
        </span>
      </td>
      <td className="px-4 py-3 hidden lg:table-cell">
        <span className="font-mono text-[11px] text-text-tertiary">{token.useCount}</span>
      </td>
      <td className="px-4 py-3 text-right">
        {status === "active" && (
          <button
            onClick={handleRevoke}
            disabled={revoking}
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger-muted transition-all disabled:opacity-50"
          >
            {revoking ? <Spinner size="sm" /> : "Revoke"}
          </button>
        )}
      </td>
    </tr>
  );
}

function AuditRow({ log }: { log: AuditLog }) {
  const [expanded, setExpanded] = useState(false);

  const actionColors: Record<string, string> = {
    "tx.submit": "text-accent",
    "tx.approved": "text-success",
    "tx.rejected": "text-danger",
    "tx.pending_approval": "text-warning",
    "policy.updated": "text-info",
  };

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        className="cursor-pointer border-b border-border hover:bg-surface-2/50 transition-colors"
      >
        <td className="px-4 py-3">
          <span className={`font-mono text-xs font-medium ${actionColors[log.action] ?? "text-text-secondary"}`}>
            {log.action}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className="font-mono text-[11px] text-text-tertiary">
            {new Date(log.timestamp).toLocaleString()}
          </span>
        </td>
        <td className="px-4 py-3 hidden sm:table-cell">
          <span className="font-mono text-[11px] text-text-tertiary">
            {log.tokenJti ? `${log.tokenJti.slice(0, 12)}...` : "—"}
          </span>
        </td>
        <td className="px-4 py-3 text-right">
          <svg
            className={`inline h-4 w-4 text-text-tertiary transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border">
          <td colSpan={4} className="px-4 py-4 bg-surface-2/30">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {log.request && Object.keys(log.request).length > 0 && (
                <DetailBlock title="Request" data={log.request} />
              )}
              {log.policyEvaluation && Object.keys(log.policyEvaluation).length > 0 && (
                <DetailBlock title="Policy Evaluation" data={log.policyEvaluation} />
              )}
              {log.approval && Object.keys(log.approval).length > 0 && (
                <DetailBlock title="Approval" data={log.approval} />
              )}
              {log.signing && Object.keys(log.signing).length > 0 && (
                <DetailBlock title="Signing" data={log.signing} />
              )}
              {log.blockchain && Object.keys(log.blockchain).length > 0 && (
                <DetailBlock title="Blockchain" data={log.blockchain} />
              )}
              {log.metadata && Object.keys(log.metadata).length > 0 && (
                <DetailBlock title="Metadata" data={log.metadata} />
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function DetailBlock({ title, data }: { title: string; data: Record<string, unknown> }) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">{title}</p>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-text-secondary">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

function IssueTokenForm({ agentId, onIssued }: { agentId: string; onIssued: () => void }) {
  const [selectedChains, setSelectedChains] = useState<string[]>(["eip155:1"]);
  const [ttl, setTtl] = useState("3600");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ token: string; expiresAt: string } | null>(null);

  const toggleChain = (chainId: string) => {
    setSelectedChains((prev) =>
      prev.includes(chainId) ? prev.filter((c) => c !== chainId) : [...prev, chainId],
    );
  };

  const handleIssue = async () => {
    if (selectedChains.length === 0) {
      setError("Select at least one chain");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await api.tokens.issue(agentId, selectedChains, parseInt(ttl) || undefined);
      setResult({ token: data.token, expiresAt: data.expiresAt });
      onIssued();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to issue token");
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="rounded-xl border border-success/20 bg-success-muted p-4">
        <div className="mb-2 flex items-center gap-2">
          <svg className="h-4 w-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-semibold text-success">Token Issued</span>
        </div>
        <div className="mb-2 rounded-lg bg-surface-2 p-3">
          <p className="break-all font-mono text-[11px] text-text-primary">{result.token}</p>
        </div>
        <p className="text-[10px] text-text-tertiary">
          Expires: {new Date(result.expiresAt).toLocaleString()}
        </p>
        <button
          onClick={() => setResult(null)}
          className="mt-3 text-xs font-medium text-success hover:text-green-300 transition-colors"
        >
          Issue Another
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-text-tertiary">Chains</label>
        <div className="flex flex-wrap gap-2">
          {CHAINS.map((chain) => (
            <button
              key={chain.id}
              onClick={() => toggleChain(chain.id)}
              className={`rounded-lg border px-3 py-2 font-mono text-xs transition-all ${
                selectedChains.includes(chain.id)
                  ? "border-accent/30 bg-accent-muted text-accent"
                  : "border-border bg-surface-2 text-text-secondary hover:border-border-hover"
              }`}
            >
              {chain.short}
              <span className="ml-1.5 text-text-tertiary">{chain.id}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-text-tertiary">TTL (seconds)</label>
        <input
          type="number"
          value={ttl}
          onChange={(e) => setTtl(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-border bg-surface-2 px-4 py-2.5 font-mono text-sm text-text-primary outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all"
        />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <button
        onClick={handleIssue}
        disabled={loading}
        className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-surface-0 transition-all hover:bg-accent-dim disabled:opacity-50 active:scale-[0.98]"
      >
        {loading && <Spinner size="sm" />}
        Issue Token
      </button>
    </div>
  );
}

function PolicySection({
  agent,
  onUpdated,
}: {
  agent: AgentDetailType;
  onUpdated: () => void;
}) {
  const [changingPreset, setChangingPreset] = useState(false);
  const [newPreset, setNewPreset] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const policy = agent.currentPolicy;
  if (!policy) {
    return <p className="text-sm text-text-tertiary">No policy assigned</p>;
  }

  const data = policy.data as Record<string, unknown>;
  const spending = data.spending as Record<string, unknown> | undefined;
  const rateLimits = data.rateLimits as Record<string, unknown> | undefined;
  const contractMode = (data.contractPolicy as Record<string, unknown>)?.mode as string | undefined;
  const bridgeMode = (data.bridgePolicy as Record<string, unknown>)?.mode as string | undefined;
  const memecoinMode = (data.memecoinPolicy as Record<string, unknown>)?.mode as string | undefined;

  const handlePresetChange = async () => {
    setLoading(true);
    setError("");
    try {
      await api.policies.update(agent.id, newPreset, confirmText || undefined);
      setChangingPreset(false);
      setNewPreset("");
      setConfirmText("");
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update policy");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PresetBadge preset={policy.preset} />
          <span className="font-mono text-xs text-text-tertiary">v{policy.version}</span>
        </div>
        {!changingPreset && (
          <button
            onClick={() => setChangingPreset(true)}
            className="text-xs font-medium text-text-secondary hover:text-accent transition-colors"
          >
            Change Preset
          </button>
        )}
      </div>

      {changingPreset && (
        <div className="rounded-xl border border-warning/20 bg-warning-muted p-4 space-y-3">
          <p className="text-xs font-semibold text-warning">Change Policy Preset</p>
          <div className="flex gap-2">
            {PRESET_OPTIONS.map((p) => (
              <button
                key={p}
                onClick={() => setNewPreset(p)}
                className={`rounded-lg border px-3 py-2 font-mono text-xs font-semibold uppercase transition-all ${
                  newPreset === p
                    ? "border-accent/30 bg-accent-muted text-accent"
                    : "border-border bg-surface-2 text-text-secondary hover:border-border-hover"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Change summary (optional)"
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-text-primary outline-none focus:border-accent/40 transition-all"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => { setChangingPreset(false); setNewPreset(""); setError(""); }}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handlePresetChange}
              disabled={!newPreset || loading}
              className="flex items-center gap-1.5 rounded-lg bg-warning px-3 py-1.5 text-xs font-semibold text-surface-0 disabled:opacity-50 transition-all"
            >
              {loading && <Spinner size="sm" />}
              Confirm Change
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {spending && (
          <div className="rounded-lg border border-border bg-surface-2/50 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Spending Limits</p>
            <div className="space-y-1">
              <p className="font-mono text-xs text-text-secondary">
                Daily: <span className="text-text-primary">${String(spending.dailyLimitUsd ?? "—")}</span>
              </p>
              <p className="font-mono text-xs text-text-secondary">
                Weekly: <span className="text-text-primary">${String(spending.weeklyLimitUsd ?? "—")}</span>
              </p>
              <p className="font-mono text-xs text-text-secondary">
                Per-tx: <span className="text-text-primary">${String(spending.perTransactionLimitUsd ?? "—")}</span>
              </p>
            </div>
          </div>
        )}
        {rateLimits && (
          <div className="rounded-lg border border-border bg-surface-2/50 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Rate Limits</p>
            <div className="space-y-1">
              <p className="font-mono text-xs text-text-secondary">
                Per hour: <span className="text-text-primary">{String(rateLimits.maxTransactionsPerHour ?? "—")}</span>
              </p>
              <p className="font-mono text-xs text-text-secondary">
                Per day: <span className="text-text-primary">{String(rateLimits.maxTransactionsPerDay ?? "—")}</span>
              </p>
            </div>
          </div>
        )}
        <div className="rounded-lg border border-border bg-surface-2/50 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Modes</p>
          <div className="space-y-1.5">
            <ModeIndicator label="Contracts" mode={contractMode} />
            <ModeIndicator label="Bridges" mode={bridgeMode} />
            <ModeIndicator label="Memecoins" mode={memecoinMode} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeIndicator({ label, mode }: { label: string; mode?: string }) {
  const modeColors: Record<string, string> = {
    blocked: "text-danger",
    whitelist: "text-info",
    "whitelist-only": "text-info",
    audited: "text-success",
    allowed: "text-success",
    any: "text-warning",
  };

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-text-secondary">{label}</span>
      <span className={`font-mono text-xs font-medium ${modeColors[mode ?? ""] ?? "text-text-tertiary"}`}>
        {mode ?? "—"}
      </span>
    </div>
  );
}

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [agent, setAgent] = useState<AgentDetailType | null>(null);
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [spending, setSpending] = useState<{
    dailyLimitUsd: number; dailySpentUsd: number; dailyRemainingUsd: number;
    weeklyLimitUsd: number; weeklySpentUsd: number; weeklyRemainingUsd: number;
    txThisHour: number; maxTxPerHour: number; txToday: number; maxTxPerDay: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [disabling, setDisabling] = useState(false);
  const [activeTab, setActiveTab] = useState<"tokens" | "audit">("tokens");

  const loadAgent = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.agents.get(id);
      setAgent(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agent");
    }
  }, [id]);

  const loadTokens = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.tokens.list(id);
      setTokens(data.tokens);
    } catch { setTokens([]); }
  }, [id]);

  const loadLogs = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.audit.list(id);
      setLogs(data.logs);
    } catch { setLogs([]); }
  }, [id]);

  const loadSpending = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.policies.remaining(id);
      setSpending(data);
    } catch { setSpending(null); }
  }, [id]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    await Promise.all([loadAgent(), loadTokens(), loadLogs(), loadSpending()]);
    setLoading(false);
  }, [loadAgent, loadTokens, loadLogs, loadSpending]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleDisable = async () => {
    if (!id || !agent) return;
    setDisabling(true);
    try {
      await api.agents.disable(id);
      await loadAgent();
    } catch { setDisabling(false); return; } finally {
      setDisabling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <ErrorMessage message={error} onRetry={loadAll} />;
  }

  if (!agent) return null;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={() => navigate("/agents")}
            className="mb-3 flex items-center gap-1 text-xs font-medium text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Back to Agents
          </button>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">{agent.name}</h1>
          <div className="mt-2 flex items-center gap-3">
            <StatusBadge status={agent.status} />
            <span className="font-mono text-xs text-text-tertiary">{agent.id}</span>
          </div>
        </div>
        {agent.status === "active" && (
          <button
            onClick={handleDisable}
            disabled={disabling}
            className="flex items-center gap-1.5 rounded-lg border border-danger/20 bg-danger-muted px-3 py-2 text-xs font-medium text-danger hover:bg-danger/20 transition-all disabled:opacity-50"
          >
            {disabling && <Spinner size="sm" />}
            Disable Agent
          </button>
        )}
      </div>

      {agent.wallets.length > 0 && (
        <Section title="Wallets">
          <div className="grid gap-3 sm:grid-cols-2">
            {agent.wallets.map((w) => (
              <div key={w.id} className="rounded-lg border border-border bg-surface-2/50 p-4">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">{w.provider}</span>
                </div>
                <p className="font-mono text-xs text-text-primary break-all">{w.providerWalletId}</p>
                <p className="mt-1 font-mono text-[10px] text-text-tertiary">
                  Created {new Date(w.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Policy">
        <PolicySection agent={agent} onUpdated={() => { loadAgent(); loadSpending(); }} />
      </Section>

      {spending && (
        <Section title="Spending & Rate Limits">
          <div className="grid gap-5 sm:grid-cols-2">
            <SpendingBar label="Daily Spending" spent={spending.dailySpentUsd} limit={spending.dailyLimitUsd} />
            <SpendingBar label="Weekly Spending" spent={spending.weeklySpentUsd} limit={spending.weeklyLimitUsd} />
            <RateBar label="Transactions / Hour" current={spending.txThisHour} max={spending.maxTxPerHour} />
            <RateBar label="Transactions / Day" current={spending.txToday} max={spending.maxTxPerDay} />
          </div>
        </Section>
      )}

      <div>
        <div className="mb-4 flex items-center gap-1 rounded-lg bg-surface-2 p-1">
          <TabButton active={activeTab === "tokens"} onClick={() => setActiveTab("tokens")}>
            Tokens
          </TabButton>
          <TabButton active={activeTab === "audit"} onClick={() => setActiveTab("audit")}>
            Audit Log
          </TabButton>
        </div>

        {activeTab === "tokens" && (
          <div className="space-y-4 animate-fade-in">
            <Section title="Issue New Token">
              <IssueTokenForm agentId={agent.id} onIssued={loadTokens} />
            </Section>
            <Section title="Issued Tokens">
              {tokens.length === 0 ? (
                <p className="text-sm text-text-tertiary">No tokens issued yet</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-surface-2/30">
                        <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">JTI</th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Status</th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-text-tertiary hidden sm:table-cell">Issued</th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-text-tertiary hidden md:table-cell">Expires</th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-text-tertiary hidden lg:table-cell">Uses</th>
                        <th className="px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {tokens.map((t) => (
                        <TokenRow key={t.jti} token={t} agentId={agent.id} onRevoked={loadTokens} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </div>
        )}

        {activeTab === "audit" && (
          <Section title="Audit Log">
            {logs.length === 0 ? (
              <p className="text-sm text-text-tertiary">No audit logs yet</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border animate-fade-in">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-surface-2/30">
                      <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Action</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Timestamp</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-text-tertiary hidden sm:table-cell">Token</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <AuditRow key={log.id} log={log} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-5">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-text-tertiary">{title}</h2>
      {children}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all ${
        active
          ? "bg-surface-3 text-text-primary"
          : "text-text-tertiary hover:text-text-secondary"
      }`}
    >
      {children}
    </button>
  );
}
