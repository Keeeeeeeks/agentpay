import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Agent, type AuditLog } from "../api";
import StatusBadge from "../components/StatusBadge";
import Spinner from "../components/Spinner";
import ErrorMessage from "../components/ErrorMessage";

type RemainingLimits = {
  dailyLimitUsd: number;
  dailySpentUsd: number;
  dailyRemainingUsd: number;
  weeklyLimitUsd: number;
  weeklySpentUsd: number;
  weeklyRemainingUsd: number;
  txThisHour: number;
  maxTxPerHour: number;
  txToday: number;
  maxTxPerDay: number;
};

type AgentAnalytics = {
  agent: Agent;
  remaining: RemainingLimits | null;
  logs: AuditLog[];
  dailySpentUsd: number;
  weeklySpentUsd: number;
  txToday: number;
  txThisHour: number;
  recentActivityAt: string | null;
  criticalEvents: number;
};

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function formatUsd(value: number): string {
  return USD.format(Number.isFinite(value) ? value : 0);
}

function formatDate(value: string | null): string {
  if (!value) {
    return "--";
  }
  return new Date(value).toLocaleString();
}

function escapeCsvValue(value: string): string {
  if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function createCsv(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => escapeCsvValue(cell)).join(",")).join("\n");
}

function downloadText(filename: string, content: string, contentType: string): void {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function RiskPill({ criticalEvents }: { criticalEvents: number }) {
  if (criticalEvents === 0) {
    return <span className="text-[11px] text-text-tertiary">No critical alerts</span>;
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-danger/25 bg-danger-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-danger">
      {criticalEvents} critical
    </span>
  );
}

export default function Analytics() {
  const [rows, setRows] = useState<AgentAnalytics[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "disabled">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [agentsResult, approvalsResult] = await Promise.all([
        api.agents.list(),
        api.approvals.list(),
      ]);

      const mapped = await Promise.all(
        agentsResult.agents.map(async (agent) => {
          const [remainingResult, auditResult] = await Promise.all([
            api.policies.remaining(agent.id).catch(() => null),
            api.audit.list(agent.id, 100, 0).catch(() => ({ logs: [], limit: 100, offset: 0 })),
          ]);

          const logs = auditResult.logs;

          return {
            agent,
            remaining: remainingResult,
            logs,
            dailySpentUsd: remainingResult?.dailySpentUsd ?? 0,
            weeklySpentUsd: remainingResult?.weeklySpentUsd ?? 0,
            txToday: remainingResult?.txToday ?? 0,
            txThisHour: remainingResult?.txThisHour ?? 0,
            recentActivityAt: logs[0]?.timestamp ?? null,
            criticalEvents: logs.filter((log) => log.decoded?.riskLevel === "critical").length,
          } satisfies AgentAnalytics;
        }),
      );

      setRows(mapped);
      setPendingApprovals(approvalsResult.approvals.filter((approval) => approval.status === "pending").length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rows.filter((row) => {
      const statusMatch = statusFilter === "all" ? true : row.agent.status.toLowerCase() === statusFilter;
      if (!statusMatch) {
        return false;
      }

      if (q.length === 0) {
        return true;
      }

      const searchBase = [
        row.agent.name,
        row.agent.id,
        row.logs[0]?.decoded?.summary ?? "",
        row.logs[0]?.decoded?.protocol ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return searchBase.includes(q);
    });
  }, [rows, query, statusFilter]);

  const overview = useMemo(() => {
    const activeAgents = rows.filter((row) => row.agent.status === "active").length;
    const totalDailySpent = rows.reduce((sum, row) => sum + row.dailySpentUsd, 0);
    const totalWeeklySpent = rows.reduce((sum, row) => sum + row.weeklySpentUsd, 0);
    const totalTxToday = rows.reduce((sum, row) => sum + row.txToday, 0);
    const totalCritical = rows.reduce((sum, row) => sum + row.criticalEvents, 0);

    return {
      totalAgents: rows.length,
      activeAgents,
      totalDailySpent,
      totalWeeklySpent,
      totalTxToday,
      totalCritical,
    };
  }, [rows]);

  const topByDaily = useMemo(
    () => [...rows].sort((a, b) => b.dailySpentUsd - a.dailySpentUsd).slice(0, 5),
    [rows],
  );

  const topByWeekly = useMemo(
    () => [...rows].sort((a, b) => b.weeklySpentUsd - a.weeklySpentUsd).slice(0, 5),
    [rows],
  );

  const activityBuckets = useMemo(() => {
    const now = Date.now();
    const labels = ["20-24h", "16-20h", "12-16h", "8-12h", "4-8h", "0-4h"];
    const counts = [0, 0, 0, 0, 0, 0];

    for (const row of rows) {
      for (const log of row.logs) {
        const ageHours = (now - new Date(log.timestamp).getTime()) / 3_600_000;
        if (ageHours < 0 || ageHours >= 24) {
          continue;
        }
        const index = Math.min(5, Math.floor((24 - ageHours - 0.0001) / 4));
        counts[index] += 1;
      }
    }

    return labels.map((label, i) => ({ label, count: counts[i] }));
  }, [rows]);

  const exportOverviewJson = () => {
    const payload = filtered.map((row) => ({
      agentId: row.agent.id,
      agentName: row.agent.name,
      status: row.agent.status,
      dailySpentUsd: row.dailySpentUsd,
      weeklySpentUsd: row.weeklySpentUsd,
      txToday: row.txToday,
      txThisHour: row.txThisHour,
      recentActivityAt: row.recentActivityAt,
      criticalEvents: row.criticalEvents,
    }));

    downloadText(
      `apay-analytics-overview-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(payload, null, 2),
      "application/json",
    );
  };

  const exportOverviewCsv = () => {
    const csv = createCsv([
      [
        "agent_id",
        "agent_name",
        "status",
        "daily_spent_usd",
        "weekly_spent_usd",
        "tx_today",
        "tx_this_hour",
        "recent_activity_at",
        "critical_events",
      ],
      ...filtered.map((row) => [
        row.agent.id,
        row.agent.name,
        row.agent.status,
        row.dailySpentUsd.toFixed(2),
        row.weeklySpentUsd.toFixed(2),
        String(row.txToday),
        String(row.txThisHour),
        row.recentActivityAt ?? "",
        String(row.criticalEvents),
      ]),
    ]);

    downloadText(
      `apay-analytics-overview-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      "text/csv;charset=utf-8",
    );
  };

  const exportActivityJson = () => {
    const payload = filtered.flatMap((row) =>
      row.logs.map((log) => ({
        agentId: row.agent.id,
        agentName: row.agent.name,
        timestamp: log.timestamp,
        action: log.action,
        summary: log.decoded?.summary ?? null,
        protocol: log.decoded?.protocol ?? null,
        amount: log.decoded?.amount ?? null,
        riskLevel: log.decoded?.riskLevel ?? null,
      })),
    );

    downloadText(
      `apay-analytics-activity-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(payload, null, 2),
      "application/json",
    );
  };

  const exportActivityCsv = () => {
    const csv = createCsv([
      ["agent_id", "agent_name", "timestamp", "action", "summary", "protocol", "amount", "risk_level"],
      ...filtered.flatMap((row) =>
        row.logs.map((log) => [
          row.agent.id,
          row.agent.name,
          log.timestamp,
          log.action,
          log.decoded?.summary ?? "",
          log.decoded?.protocol ?? "",
          log.decoded?.amount ?? "",
          log.decoded?.riskLevel ?? "",
        ]),
      ),
    ]);

    downloadText(
      `apay-analytics-activity-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      "text/csv;charset=utf-8",
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <ErrorMessage message={error} onRetry={load} />;
  }

  const maxDaily = Math.max(1, ...topByDaily.map((row) => row.dailySpentUsd));
  const maxWeekly = Math.max(1, ...topByWeekly.map((row) => row.weeklySpentUsd));
  const maxBucketCount = Math.max(1, ...activityBuckets.map((bucket) => bucket.count));

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Analytics</h1>
          <p className="mt-1 text-sm text-text-tertiary">Spending visibility, multi-agent health, and exportable telemetry</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportOverviewCsv}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-text-secondary transition-colors hover:text-text-primary"
          >
            Export Overview CSV
          </button>
          <button
            type="button"
            onClick={exportOverviewJson}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-text-secondary transition-colors hover:text-text-primary"
          >
            Export Overview JSON
          </button>
          <button
            type="button"
            onClick={exportActivityCsv}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-text-secondary transition-colors hover:text-text-primary"
          >
            Export Activity CSV
          </button>
          <button
            type="button"
            onClick={exportActivityJson}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-text-secondary transition-colors hover:text-text-primary"
          >
            Export Activity JSON
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Agents" value={String(overview.totalAgents)} tone="neutral" />
        <MetricCard label="Active" value={String(overview.activeAgents)} tone="success" />
        <MetricCard label="Pending Approvals" value={String(pendingApprovals)} tone="warning" />
        <MetricCard label="Daily Spend" value={formatUsd(overview.totalDailySpent)} tone="accent" />
        <MetricCard label="Weekly Spend" value={formatUsd(overview.totalWeeklySpent)} tone="accent" />
        <MetricCard label="Critical Events" value={String(overview.totalCritical)} tone={overview.totalCritical > 0 ? "danger" : "neutral"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Top Agents by Daily Spend" subtitle="Current day usage from policy counters">
          {topByDaily.length === 0 ? (
            <p className="text-xs text-text-tertiary">No data yet</p>
          ) : (
            <div className="space-y-3">
              {topByDaily.map((row) => (
                <BarRow
                  key={row.agent.id}
                  label={row.agent.name}
                  sublabel={row.agent.id.slice(0, 10) + "..."}
                  value={row.dailySpentUsd}
                  formatted={formatUsd(row.dailySpentUsd)}
                  widthPct={(row.dailySpentUsd / maxDaily) * 100}
                  color="bg-accent"
                />
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard title="Top Agents by Weekly Spend" subtitle="Rolling week usage from policy counters">
          {topByWeekly.length === 0 ? (
            <p className="text-xs text-text-tertiary">No data yet</p>
          ) : (
            <div className="space-y-3">
              {topByWeekly.map((row) => (
                <BarRow
                  key={row.agent.id}
                  label={row.agent.name}
                  sublabel={row.agent.id.slice(0, 10) + "..."}
                  value={row.weeklySpentUsd}
                  formatted={formatUsd(row.weeklySpentUsd)}
                  widthPct={(row.weeklySpentUsd / maxWeekly) * 100}
                  color="bg-info"
                />
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard title="Activity (Last 24h)" subtitle="Audit event counts in 4-hour buckets">
          <div className="grid h-44 grid-cols-6 items-end gap-2">
            {activityBuckets.map((bucket) => (
              <div key={bucket.label} className="flex flex-col items-center gap-2">
                <div className="w-full rounded-md bg-surface-2 p-1">
                  <div
                    className="w-full rounded-sm bg-warning transition-all"
                    style={{ height: `${Math.max(6, (bucket.count / maxBucketCount) * 110)}px` }}
                  />
                </div>
                <span className="font-mono text-[10px] text-text-tertiary">{bucket.label}</span>
                <span className="font-mono text-[10px] text-text-secondary">{bucket.count}</span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      <div className="rounded-xl border border-border bg-surface-1">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Multi-Agent Overview</p>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <input
                id="analytics-search"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, id, protocol"
                className="w-64 rounded-lg border border-border bg-surface-2 px-4 py-2.5 pr-9 text-sm text-text-primary outline-none transition-all focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
              />
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
              </svg>
            </div>

            <select
              id="analytics-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "disabled")}
              className="rounded-full border border-border bg-surface-2 px-3 py-2 text-xs font-medium text-text-secondary outline-none"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14">
            <p className="text-sm font-medium text-text-secondary">No analytics rows</p>
            <p className="mt-1 text-xs text-text-tertiary">Try a different filter or create more agent activity</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">Agent</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">Status</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">Daily Spend</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">Weekly Spend</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">TX Today</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">Last Activity</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">Risk</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.agent.id} className="border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors">
                    <td className="px-5 py-4">
                      <Link to={`/agents/${row.agent.id}`} className="text-sm font-medium text-text-primary transition-colors hover:text-accent">
                        {row.agent.name}
                      </Link>
                      <p className="mt-1 font-mono text-[11px] text-text-tertiary">{row.agent.id}</p>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={row.agent.status} />
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-mono text-xs text-text-primary">{formatUsd(row.dailySpentUsd)}</p>
                      <p className="mt-1 font-mono text-[10px] text-text-tertiary">
                        limit {formatUsd(row.remaining?.dailyLimitUsd ?? 0)}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-mono text-xs text-text-primary">{formatUsd(row.weeklySpentUsd)}</p>
                      <p className="mt-1 font-mono text-[10px] text-text-tertiary">
                        limit {formatUsd(row.remaining?.weeklyLimitUsd ?? 0)}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-mono text-xs text-text-primary">{row.txToday}</p>
                      <p className="mt-1 font-mono text-[10px] text-text-tertiary">{row.txThisHour} in last hour</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-mono text-xs text-text-secondary">{formatDate(row.recentActivityAt)}</p>
                    </td>
                    <td className="px-5 py-4">
                      <RiskPill criticalEvents={row.criticalEvents} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: "neutral" | "success" | "warning" | "danger" | "accent" }) {
  const toneClass: Record<string, string> = {
    neutral: "border-border bg-surface-1 text-text-primary",
    success: "border-success/25 bg-success-muted text-success",
    warning: "border-warning/25 bg-warning-muted text-warning",
    danger: "border-danger/25 bg-danger-muted text-danger",
    accent: "border-accent/25 bg-accent-muted text-accent",
  };

  return (
    <div className={`rounded-xl border p-4 ${toneClass[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">{label}</p>
      <p className="mt-2 font-mono text-xl font-semibold">{value}</p>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">{title}</p>
      <p className="mt-1 text-xs text-text-tertiary">{subtitle}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function BarRow({
  label,
  sublabel,
  value,
  formatted,
  widthPct,
  color,
}: {
  label: string;
  sublabel: string;
  value: number;
  formatted: string;
  widthPct: number;
  color: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-text-primary">{label}</p>
          <p className="font-mono text-[10px] text-text-tertiary">{sublabel}</p>
        </div>
        <p className="font-mono text-xs text-text-secondary">{formatted}</p>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, widthPct))}%` }} />
      </div>
      <p className="mt-1 font-mono text-[10px] text-text-tertiary">{value.toFixed(2)} USD</p>
    </div>
  );
}
