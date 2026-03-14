import { useState, useEffect, useCallback } from "react";
import { api, type Agent } from "../api";
import Spinner from "../components/Spinner";
import ErrorMessage from "../components/ErrorMessage";
import StatusBadge from "../components/StatusBadge";

interface AllowlistEntry {
  id: string;
  agentId: string;
  address: string;
  chainId: string;
  name: string;
  type: string;
  allowedFunctions: string[];
  addedBy: string;
  createdAt: string;
}

interface AllowlistRequest {
  id: string;
  agentId: string;
  address: string;
  chainId: string;
  reason: string;
  requestedFunctions: string[];
  status: string;
  createdAt: string;
}

function truncateAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

export default function Allowlists() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [entries, setEntries] = useState<AllowlistEntry[]>([]);
  const [requests, setRequests] = useState<AllowlistRequest[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState("");
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.agents.list();
        setAgents(data.agents);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load agents");
      } finally {
        setLoadingAgents(false);
      }
    })();
  }, []);

  const loadData = useCallback(async (agentId: string) => {
    if (!agentId) return;
    setLoadingData(true);
    setError("");
    try {
      const [allowlistData, requestData] = await Promise.all([
        api.allowlists.list(agentId),
        api.allowlists.listRequests(agentId),
      ]);
      setEntries(allowlistData.entries);
      setRequests(requestData.requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load allowlist data");
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (selectedAgentId) {
      loadData(selectedAgentId);
    } else {
      setEntries([]);
      setRequests([]);
    }
  }, [selectedAgentId, loadData]);

  const handleApprove = async (requestId: string) => {
    setActing(requestId);
    try {
      await api.allowlists.approveRequest(selectedAgentId, requestId);
      await loadData(selectedAgentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve request");
    } finally {
      setActing(null);
    }
  };

  const handleReject = async (requestId: string) => {
    setActing(requestId);
    try {
      await api.allowlists.rejectRequest(selectedAgentId, requestId);
      await loadData(selectedAgentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject request");
    } finally {
      setActing(null);
    }
  };

  const pendingRequests = requests.filter((r) => r.status === "pending");

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">Allowlists</h1>
        <p className="mt-1 text-sm text-text-tertiary">Manage contract allowlists and review agent requests</p>
      </div>

      <div className="mb-6">
        <label htmlFor="agent-selector" className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
          Select Agent
        </label>
        {loadingAgents ? (
          <div className="flex items-center gap-2 py-2">
            <Spinner size="sm" />
            <span className="text-xs text-text-tertiary">Loading agents...</span>
          </div>
        ) : (
          <select
            id="agent-selector"
            value={selectedAgentId}
            onChange={(e) => setSelectedAgentId(e.target.value)}
            className="w-full max-w-sm rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-text-primary outline-none transition-all focus:border-accent/40"
          >
            <option value="">Choose an agent...</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name} ({agent.id.slice(0, 8)}...)
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <ErrorMessage message={error} onRetry={selectedAgentId ? () => loadData(selectedAgentId) : undefined} />}

      {loadingData && (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      )}

      {selectedAgentId && !loadingData && !error && (
        <>
          {/* Contract Allowlist */}
          <div className="mb-8">
            <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
              Contract Allowlist ({entries.length})
            </h2>

            {entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-surface-3">
                  <svg className="h-7 w-7 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-text-secondary">No contracts allowlisted</p>
                <p className="mt-1 text-xs text-text-tertiary">Approved contracts will appear here</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">Address</th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">Chain</th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-tertiary hidden sm:table-cell">Name</th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-tertiary hidden md:table-cell">Type</th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-tertiary hidden lg:table-cell">Functions</th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-tertiary hidden lg:table-cell">Added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.id} className="border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors">
                        <td className="px-5 py-3">
                          <span className="font-mono text-xs text-text-primary" title={entry.address}>
                            {truncateAddress(entry.address)}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className="font-mono text-xs text-text-secondary">{entry.chainId}</span>
                        </td>
                        <td className="px-5 py-3 hidden sm:table-cell">
                          <span className="text-xs text-text-secondary">{entry.name}</span>
                        </td>
                        <td className="px-5 py-3 hidden md:table-cell">
                          <span className="inline-flex rounded-full border border-border bg-surface-3 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
                            {entry.type}
                          </span>
                        </td>
                        <td className="px-5 py-3 hidden lg:table-cell">
                          <span className="font-mono text-xs text-text-tertiary">{entry.allowedFunctions.length}</span>
                        </td>
                        <td className="px-5 py-3 hidden lg:table-cell">
                          <span className="font-mono text-[11px] text-text-tertiary">
                            {new Date(entry.createdAt).toLocaleDateString()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pending Requests */}
          <div>
            <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
              Pending Requests ({pendingRequests.length})
            </h2>

            {pendingRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-surface-3">
                  <svg className="h-7 w-7 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-text-secondary">No pending requests</p>
                <p className="mt-1 text-xs text-text-tertiary">Agent allowlist requests will appear here</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {pendingRequests.map((req, i) => (
                  <div
                    key={req.id}
                    className={`animate-fade-in stagger-${Math.min(i + 1, 6)} rounded-xl border border-warning/20 bg-warning-muted p-4 transition-all`}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <StatusBadge status="pending" />
                      <span className="font-mono text-[10px] text-text-tertiary">
                        {new Date(req.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="mb-3 space-y-1.5">
                      <p className="font-mono text-xs text-text-primary" title={req.address}>
                        {truncateAddress(req.address)}
                      </p>
                      <p className="font-mono text-[11px] text-text-tertiary">
                        Chain: {req.chainId}
                      </p>
                    </div>

                    {req.reason && (
                      <div className="mb-3 rounded-lg border border-border bg-surface-2/50 p-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Reason</p>
                        <p className="mt-1 text-xs text-text-secondary leading-relaxed">{req.reason}</p>
                      </div>
                    )}

                    {req.requestedFunctions.length > 0 && (
                      <div className="mb-3">
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Requested Functions</p>
                        <div className="flex flex-wrap gap-1">
                          {req.requestedFunctions.map((fn) => (
                            <span
                              key={fn}
                              className="inline-flex rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-text-secondary"
                            >
                              {fn}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleReject(req.id)}
                        disabled={acting === req.id}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-danger/20 bg-danger-muted px-3 py-2 text-xs font-semibold text-danger transition-all hover:bg-danger/20 disabled:opacity-50"
                      >
                        {acting === req.id && <Spinner size="sm" />}
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApprove(req.id)}
                        disabled={acting === req.id}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-success px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-green-500 disabled:opacity-50"
                      >
                        {acting === req.id && <Spinner size="sm" />}
                        Approve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {!selectedAgentId && !loadingAgents && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-surface-3">
            <svg className="h-7 w-7 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-text-secondary">Select an agent</p>
          <p className="mt-1 text-xs text-text-tertiary">Choose an agent above to manage its contract allowlist</p>
        </div>
      )}
    </div>
  );
}
