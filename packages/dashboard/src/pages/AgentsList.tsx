import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, type Agent } from "../api";
import StatusBadge from "../components/StatusBadge";
import Spinner from "../components/Spinner";
import ErrorMessage from "../components/ErrorMessage";
import CreateAgentModal from "./CreateAgentModal";

export default function AgentsList() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.agents.list();
      setAgents(data.agents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="animate-fade-in">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Agents</h1>
          <p className="mt-1 text-sm text-text-tertiary">Manage your autonomous wallet agents</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-surface-0 transition-all hover:bg-accent-dim active:scale-[0.98]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Agent
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      )}

      {error && <ErrorMessage message={error} onRetry={load} />}

      {!loading && !error && agents.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-surface-3">
            <svg className="h-7 w-7 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
            </svg>
          </div>
          <p className="text-sm font-medium text-text-secondary">No agents yet</p>
          <p className="mt-1 text-xs text-text-tertiary">Create your first agent to get started</p>
        </div>
      )}

      {!loading && !error && agents.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">Name</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">Status</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-tertiary hidden sm:table-cell">Created</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-tertiary hidden md:table-cell">ID</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {agents.map((agent, i) => (
                <tr
                  key={agent.id}
                  className={`animate-fade-in border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors stagger-${Math.min(i + 1, 6)}`}
                >
                  <td className="px-5 py-4">
                    <Link to={`/agents/${agent.id}`} className="font-medium text-text-primary hover:text-accent transition-colors">
                      {agent.name}
                    </Link>
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={agent.status} />
                  </td>
                  <td className="px-5 py-4 hidden sm:table-cell">
                    <span className="font-mono text-xs text-text-tertiary">
                      {new Date(agent.createdAt).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-5 py-4 hidden md:table-cell">
                    <span className="font-mono text-xs text-text-tertiary">
                      {agent.id.slice(0, 12)}...
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      to={`/agents/${agent.id}`}
                      className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-accent hover:bg-accent-muted transition-all"
                    >
                      View
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateAgentModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={load} />
    </div>
  );
}
