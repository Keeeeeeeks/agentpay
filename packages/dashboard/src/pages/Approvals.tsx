import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { api, type Approval, type AuditLog } from "../api";
import StatusBadge from "../components/StatusBadge";
import Spinner from "../components/Spinner";
import ErrorMessage from "../components/ErrorMessage";

type ApprovalDetail = { approval: Approval; auditLog: AuditLog };

const riskColors: Record<string, string> = {
  info: "bg-success",
  warning: "bg-warning",
  critical: "bg-danger",
};

const riskBorderColors: Record<string, string> = {
  info: "border-border bg-surface-2/40",
  warning: "border-warning/30 bg-warning-muted",
  critical: "border-danger/30 bg-danger-muted",
};

function RiskDot({ level }: { level: string }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${riskColors[level] ?? "bg-text-tertiary"}`}
      title={`Risk: ${level}`}
    />
  );
}

function ApprovalDetailModal({
  approvalId,
  prefetchedData,
  onClose,
  onAction,
}: {
  approvalId: string;
  prefetchedData: ApprovalDetail | undefined;
  onClose: () => void;
  onAction: () => void;
}) {
  const [data, setData] = useState<ApprovalDetail | null>(prefetchedData ?? null);
  const [loading, setLoading] = useState(!prefetchedData);
  const [error, setError] = useState("");
  const [acting, setActing] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [expandRequest, setExpandRequest] = useState(false);
  const [expandPolicy, setExpandPolicy] = useState(false);

  useEffect(() => {
    if (prefetchedData) return;
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
  }, [approvalId, prefetchedData]);

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

  const decoded = data?.auditLog.decoded;

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70" onClick={onClose}>
      <div className="flex min-h-full items-center justify-center px-4 py-8" onClick={(e) => e.stopPropagation()}>
      <div className="relative w-full max-w-xl animate-fade-in rounded-2xl border border-border bg-surface-1 p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-primary">Approval Request</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-text-tertiary hover:text-text-primary hover:bg-surface-3 transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
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
            {/* Decoded summary hero */}
            {decoded && (
              <div className={`rounded-xl border p-4 ${riskBorderColors[decoded.riskLevel] ?? "border-border bg-surface-2/40"}`}>
                <div className="mb-3 flex items-center gap-2">
                  <RiskDot level={decoded.riskLevel} />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
                    {decoded.riskLevel} risk
                  </span>
                </div>
                <p className="text-sm font-medium leading-relaxed text-text-primary">
                  {decoded.summary}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {decoded.protocol && (
                    <span className="rounded-md bg-surface-2 px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                      {decoded.protocol}
                    </span>
                  )}
                  {decoded.amount && (
                    <span className="rounded-md bg-surface-2 px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                      {decoded.amount}
                    </span>
                  )}
                </div>
                {decoded.reason && (
                  <p className="mt-3 border-t border-border/50 pt-3 text-xs leading-relaxed text-text-secondary">
                    {decoded.reason}
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <InfoCell label="Agent" value={data.approval.agentId.slice(0, 12) + "..."} />
              <InfoCell label="Status" value={data.approval.status} />
              <InfoCell label="Expires" value={new Date(data.approval.expiresAt).toLocaleString()} />
              <InfoCell label="Audit Log" value={data.approval.auditLogId.slice(0, 12) + "..."} />
            </div>

            {/* Expandable technical details */}
            {data.auditLog.request && Object.keys(data.auditLog.request).length > 0 && (
              <div className="rounded-lg border border-border bg-surface-2/50">
                <button
                  type="button"
                  onClick={() => setExpandRequest((v) => !v)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-surface-3/30"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Transaction Request</p>
                  <svg
                    className={`h-4 w-4 text-text-tertiary transition-transform ${expandRequest ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {expandRequest && (
                  <div className="border-t border-border px-4 py-3">
                    <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-text-secondary">
                      {JSON.stringify(data.auditLog.request, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {data.auditLog.policyEvaluation && Object.keys(data.auditLog.policyEvaluation).length > 0 && (
              <div className="rounded-lg border border-border bg-surface-2/50">
                <button
                  type="button"
                  onClick={() => setExpandPolicy((v) => !v)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-surface-3/30"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Policy Evaluation</p>
                  <svg
                    className={`h-4 w-4 text-text-tertiary transition-transform ${expandPolicy ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {expandPolicy && (
                  <div className="border-t border-border px-4 py-3">
                    <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-text-secondary">
                      {JSON.stringify(data.auditLog.policyEvaluation, null, 2)}
                    </pre>
                  </div>
                )}
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
                        type="button"
                        onClick={() => setShowReject(false)}
                        className="flex-1 rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
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
                        type="button"
                        onClick={() => setShowReject(true)}
                        className="flex-1 rounded-lg border border-danger/20 bg-danger-muted px-4 py-3 text-sm font-semibold text-danger transition-all hover:bg-danger/20"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={handleApprove}
                        disabled={acting}
                        className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-success px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-green-500 disabled:opacity-50"
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
    </div>,
    document.body,
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
  const [detailsMap, setDetailsMap] = useState<Record<string, ApprovalDetail>>({});
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.approvals.list();
      setApprovals(data.approvals);

      // Pre-fetch details for pending approvals
      const pendingItems = data.approvals.filter((a) => a.status === "pending");
      const details = await Promise.allSettled(
        pendingItems.map((a) => api.approvals.get(a.id)),
      );
      const map: Record<string, ApprovalDetail> = {};
      details.forEach((result, idx) => {
        if (result.status === "fulfilled") {
          map[pendingItems[idx].id] = result.value;
        }
      });
      setDetailsMap(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load approvals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const uniqueAgentIds = useMemo(
    () => [...new Set(approvals.map((a) => a.agentId))],
    [approvals],
  );

  const filtered = useMemo(() => {
    return approvals
      .filter((a) => {
        if (!search) return true;
        const s = search.toLowerCase();
        const detail = detailsMap[a.id];
        const decoded = detail?.auditLog.decoded;
        return (
          a.agentId.toLowerCase().includes(s) ||
          a.id.toLowerCase().includes(s) ||
          (decoded?.summary?.toLowerCase().includes(s) ?? false)
        );
      })
      .filter((a) => !agentFilter || a.agentId === agentFilter)
      .filter(() => !typeFilter || typeFilter === "send_transaction")
      .filter((a) => !statusFilter || a.status === statusFilter)
      .sort(
        (a, b) =>
          new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime(),
      );
  }, [approvals, search, agentFilter, typeFilter, statusFilter, detailsMap]);

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">Approvals</h1>
      </div>

      {/* Search + Filters */}
      {!loading && !error && approvals.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px] flex-1">
            <svg
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by wallet address or agent ID"
              className="w-full rounded-lg border border-border bg-surface-2 py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-tertiary outline-none transition-all focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
            />
          </div>

          <div className="relative">
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="cursor-pointer appearance-none rounded-full border border-border bg-surface-2 py-1.5 pl-3 pr-8 text-xs font-medium text-text-secondary outline-none transition-all focus:border-accent/40"
            >
              <option value="">Agent</option>
              {uniqueAgentIds.map((id) => (
                <option key={id} value={id}>
                  {id.slice(0, 12)}...
                </option>
              ))}
            </select>
            <svg
              className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-text-tertiary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m19.5 8.25-7.5 7.5-7.5-7.5"
              />
            </svg>
          </div>

          <div className="relative">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="cursor-pointer appearance-none rounded-full border border-border bg-surface-2 py-1.5 pl-3 pr-8 text-xs font-medium text-text-secondary outline-none transition-all focus:border-accent/40"
            >
              <option value="">Proposal type</option>
              <option value="send_transaction">Send transaction</option>
            </select>
            <svg
              className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-text-tertiary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m19.5 8.25-7.5 7.5-7.5-7.5"
              />
            </svg>
          </div>

          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="cursor-pointer appearance-none rounded-full border border-border bg-surface-2 py-1.5 pl-3 pr-8 text-xs font-medium text-text-secondary outline-none transition-all focus:border-accent/40"
            >
              <option value="">Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
            </select>
            <svg
              className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-text-tertiary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m19.5 8.25-7.5 7.5-7.5-7.5"
              />
            </svg>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      )}

      {error && <ErrorMessage message={error} onRetry={load} />}

      {!loading && !error && approvals.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-surface-3">
            <svg className="h-7 w-7 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-text-secondary">No approvals</p>
          <p className="mt-1 text-xs text-text-tertiary">Approval requests will appear here</p>
        </div>
      )}

      {/* Unified approvals table */}
      {!loading && !error && approvals.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">
                  Proposal type
                </th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">
                  Resource
                </th>
                <th className="hidden px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-tertiary md:table-cell">
                  Expires
                </th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">Status</th>
                <th className="hidden px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-tertiary lg:table-cell">
                  Authorizations
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((approval) => {
                const detail = detailsMap[approval.id];
                const decoded = detail?.auditLog.decoded;
                const isFilled =
                  approval.status === "approved" ||
                  approval.status === "executed";
                const isRejected = approval.status === "rejected";
                const expiresDate = new Date(approval.expiresAt);

                return (
                  <tr
                    key={approval.id}
                    onClick={() => setSelectedId(approval.id)}
                    className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-surface-2/50"
                  >
                    {/* Proposal type */}
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-medium text-text-primary">
                        Send transaction
                      </p>
                      {decoded?.protocol && (
                        <p className="mt-0.5 text-xs text-text-tertiary">
                          {decoded.protocol}
                        </p>
                      )}
                    </td>

                    {/* Resource */}
                    <td className="max-w-[280px] px-5 py-3.5">
                      {decoded?.summary ? (
                        <>
                          <p className="truncate text-sm text-text-primary">
                            {decoded.summary}
                          </p>
                          <p className="mt-0.5 font-mono text-[11px] text-text-tertiary">
                            {approval.id.slice(0, 16)}...
                          </p>
                        </>
                      ) : (
                        <>
                          <Link
                            to={`/agents/${approval.agentId}`}
                            className="text-sm text-text-primary transition-colors hover:text-accent"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Agent {approval.agentId.slice(0, 12)}...
                          </Link>
                          <p className="mt-0.5 font-mono text-[11px] text-text-tertiary">
                            {approval.id.slice(0, 16)}...
                          </p>
                        </>
                      )}
                    </td>

                    {/* Expires */}
                    <td className="hidden px-5 py-3.5 md:table-cell">
                      <p className="text-sm text-text-secondary">
                        {expiresDate.toLocaleDateString()}
                      </p>
                      <p className="mt-0.5 text-xs text-text-tertiary">
                        {expiresDate.toLocaleTimeString()}
                      </p>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3.5">
                      <StatusBadge
                        status={
                          approval.status === "executed"
                            ? "approved"
                            : approval.status
                        }
                      />
                    </td>

                    {/* Authorizations */}
                    <td className="hidden px-5 py-3.5 lg:table-cell">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-medium text-text-secondary">
                          Admin
                        </span>
                        <div className="flex gap-0.5">
                          <div
                            className={`h-1.5 w-6 rounded-full ${
                              isFilled
                                ? "bg-success"
                                : isRejected
                                  ? "border border-danger/60 bg-transparent"
                                  : "bg-surface-3"
                            }`}
                          />
                        </div>
                        <span className="font-mono text-xs text-text-tertiary">
                          {isFilled ? "1/1" : "0/1"}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-12 text-center text-sm text-text-tertiary"
                  >
                    No approvals match your filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selectedId && (
        <ApprovalDetailModal
          approvalId={selectedId}
          prefetchedData={detailsMap[selectedId]}
          onClose={() => setSelectedId(null)}
          onAction={load}
        />
      )}
    </div>
  );
}
