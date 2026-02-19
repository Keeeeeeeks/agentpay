import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, type Approval, type AuditLog } from "../api";
import StatusBadge from "../components/StatusBadge";
import Spinner from "../components/Spinner";
import ErrorMessage from "../components/ErrorMessage";

function ApprovalDetailModal({
  approvalId,
  onClose,
  onAction,
}: {
  approvalId: string;
  onClose: () => void;
  onAction: () => void;
}) {
  const [data, setData] = useState<{ approval: Approval; auditLog: AuditLog } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.approvals.get(approvalId);
        setData(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load approval");
      } finally {
        setLoading(false);
      }
    })();
  }, [approvalId]);

  const handleApprove = async () => {
    setActing(true);
    try {
      await api.approvals.approve(approvalId);
      onAction();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve");
      setActing(false);
    }
  };

  const handleReject = async () => {
    setActing(true);
    try {
      await api.approvals.reject(approvalId, rejectReason || undefined);
      onAction();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject");
      setActing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl animate-fade-in rounded-2xl border border-border bg-surface-1 p-6 max-h-[90vh] overflow-y-auto">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-primary">Approval Request</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-text-tertiary hover:text-text-primary hover:bg-surface-3 transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading && (
          <div className="flex justify-center py-10">
            <Spinner size="lg" />
          </div>
        )}

        {error && <ErrorMessage message={error} />}

        {data && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <InfoCell label="Agent" value={data.approval.agentId.slice(0, 12) + "..."} />
              <InfoCell label="Status" value={data.approval.status} />
              <InfoCell label="Expires" value={new Date(data.approval.expiresAt).toLocaleString()} />
              <InfoCell label="Audit Log" value={data.approval.auditLogId.slice(0, 12) + "..."} />
            </div>

            {data.auditLog.request && Object.keys(data.auditLog.request).length > 0 && (
              <div className="rounded-lg border border-border bg-surface-2/50 p-4">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Transaction Request</p>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-text-secondary">
                  {JSON.stringify(data.auditLog.request, null, 2)}
                </pre>
              </div>
            )}

            {data.auditLog.policyEvaluation && Object.keys(data.auditLog.policyEvaluation).length > 0 && (
              <div className="rounded-lg border border-border bg-surface-2/50 p-4">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Policy Evaluation</p>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-text-secondary">
                  {JSON.stringify(data.auditLog.policyEvaluation, null, 2)}
                </pre>
              </div>
            )}

            {data.approval.status === "pending" && (
              <div className="space-y-3 pt-2">
                {showReject && (
                  <div className="rounded-lg border border-danger/20 bg-danger-muted p-3">
                    <input
                      type="text"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Rejection reason (optional)"
                      className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-text-primary outline-none focus:border-accent/40 transition-all"
                    />
                  </div>
                )}
                <div className="flex gap-3">
                  {showReject ? (
                    <>
                      <button
                        onClick={() => setShowReject(false)}
                        className="flex-1 rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleReject}
                        disabled={acting}
                        className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-danger px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-red-500 disabled:opacity-50"
                      >
                        {acting && <Spinner size="sm" />}
                        Confirm Reject
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setShowReject(true)}
                        className="flex-1 rounded-lg border border-danger/20 bg-danger-muted px-4 py-2.5 text-sm font-semibold text-danger transition-all hover:bg-danger/20"
                      >
                        Reject
                      </button>
                      <button
                        onClick={handleApprove}
                        disabled={acting}
                        className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-green-500 disabled:opacity-50"
                      >
                        {acting && <Spinner size="sm" />}
                        Approve
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">{label}</p>
      <p className="mt-1 font-mono text-xs text-text-primary">{value}</p>
    </div>
  );
}

export default function Approvals() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.approvals.list();
      setApprovals(data.approvals);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load approvals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pending = approvals.filter((a) => a.status === "pending");
  const resolved = approvals.filter((a) => a.status !== "pending");

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">Approvals</h1>
        <p className="mt-1 text-sm text-text-tertiary">Review and manage pending human approvals</p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      )}

      {error && <ErrorMessage message={error} onRetry={load} />}

      {!loading && !error && approvals.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-surface-3">
            <svg className="h-7 w-7 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-text-secondary">No approvals</p>
          <p className="mt-1 text-xs text-text-tertiary">Approval requests will appear here</p>
        </div>
      )}

      {!loading && !error && pending.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-warning">
            Pending ({pending.length})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pending.map((approval, i) => (
              <button
                key={approval.id}
                onClick={() => setSelectedId(approval.id)}
                className={`animate-fade-in stagger-${Math.min(i + 1, 6)} rounded-xl border border-warning/20 bg-warning-muted p-4 text-left transition-all hover:border-warning/40 hover:bg-warning/15`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <StatusBadge status="pending" />
                  <svg className="h-4 w-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
                <p className="font-mono text-xs text-text-secondary">
                  Agent: <Link to={`/agents/${approval.agentId}`} className="text-text-primary hover:text-accent" onClick={(e) => e.stopPropagation()}>
                    {approval.agentId.slice(0, 12)}...
                  </Link>
                </p>
                <p className="mt-1 font-mono text-[11px] text-text-tertiary">
                  Expires: {new Date(approval.expiresAt).toLocaleString()}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {!loading && !error && resolved.length > 0 && (
        <div>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-text-tertiary">
            Resolved ({resolved.length})
          </h2>
          <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">Status</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">Agent</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-tertiary hidden sm:table-cell">Resolved By</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-tertiary hidden md:table-cell">Resolved At</th>
                </tr>
              </thead>
              <tbody>
                {resolved.map((approval) => (
                  <tr
                    key={approval.id}
                    onClick={() => setSelectedId(approval.id)}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <StatusBadge status={approval.status} />
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs text-text-primary">{approval.agentId.slice(0, 12)}...</span>
                    </td>
                    <td className="px-5 py-3 hidden sm:table-cell">
                      <span className="font-mono text-xs text-text-tertiary">{approval.approvedBy ?? "—"}</span>
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell">
                      <span className="font-mono text-[11px] text-text-tertiary">
                        {approval.approvedAt ? new Date(approval.approvedAt).toLocaleString() : "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedId && (
        <ApprovalDetailModal
          approvalId={selectedId}
          onClose={() => setSelectedId(null)}
          onAction={load}
        />
      )}
    </div>
  );
}
