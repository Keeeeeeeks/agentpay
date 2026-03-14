import { useState, useEffect, useCallback } from "react";
import { api, type AgentDetail as AgentDetailType } from "../api";
import PresetBadge from "../components/PresetBadge";
import Spinner from "../components/Spinner";
import ErrorMessage from "../components/ErrorMessage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentPolicy {
  spending: { maxTransactionValueUsd: number; dailyLimitUsd: number; weeklyLimitUsd: number };
  rateLimits: { maxTxPerHour: number; maxTxPerDay: number };
  approval: { autonomousThresholdUsd: number };
  contracts: { mode: "allowlist" | "verified" | "blocklist_only"; tokenApprovalMode: "exact" | "capped" | "uncapped" };
  bridging: { mode: "no" | "stables_canonical" | "yes" };
  memecoins: { mode: "no" | "capped" | "yes"; perTxLimitUsd?: number; dailyLimitUsd?: number };
  chains: { allowed: string[] };
}

type PresetName = "safe" | "normal" | "degen" | "custom";

const CHAIN_OPTIONS = [
  { id: "eip155:1", label: "Ethereum", short: "ETH" },
  { id: "eip155:8453", label: "Base", short: "BASE" },
  { id: "eip155:42161", label: "Arbitrum", short: "ARB" },
  { id: "eip155:10", label: "Optimism", short: "OP" },
  { id: "eip155:137", label: "Polygon", short: "MATIC" },
];

const PRESET_LABELS: PresetName[] = ["safe", "normal", "degen"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function policyFromRaw(raw: Record<string, unknown>): AgentPolicy {
  const s = (raw.spending ?? {}) as Record<string, unknown>;
  const r = (raw.rateLimits ?? {}) as Record<string, unknown>;
  const a = (raw.approval ?? {}) as Record<string, unknown>;
  const c = (raw.contractPolicy ?? raw.contracts ?? {}) as Record<string, unknown>;
  const b = (raw.bridgePolicy ?? raw.bridging ?? {}) as Record<string, unknown>;
  const m = (raw.memecoinPolicy ?? raw.memecoins ?? {}) as Record<string, unknown>;
  const ch = (raw.chains ?? {}) as Record<string, unknown>;

  return {
    spending: {
      maxTransactionValueUsd: Number(s.maxTransactionValueUsd ?? s.perTransactionLimitUsd ?? 0),
      dailyLimitUsd: Number(s.dailyLimitUsd ?? 0),
      weeklyLimitUsd: Number(s.weeklyLimitUsd ?? 0),
    },
    rateLimits: {
      maxTxPerHour: Number(r.maxTxPerHour ?? r.maxTransactionsPerHour ?? 0),
      maxTxPerDay: Number(r.maxTxPerDay ?? r.maxTransactionsPerDay ?? 0),
    },
    approval: {
      autonomousThresholdUsd: Number(a.autonomousThresholdUsd ?? 0),
    },
    contracts: {
      mode: (c.mode as AgentPolicy["contracts"]["mode"]) ?? "verified",
      tokenApprovalMode: (c.tokenApprovalMode as AgentPolicy["contracts"]["tokenApprovalMode"]) ?? "exact",
    },
    bridging: {
      mode: (b.mode as AgentPolicy["bridging"]["mode"]) ?? "no",
    },
    memecoins: {
      mode: (m.mode as AgentPolicy["memecoins"]["mode"]) ?? "no",
      perTxLimitUsd: m.perTxLimitUsd != null ? Number(m.perTxLimitUsd) : undefined,
      dailyLimitUsd: m.dailyLimitUsd != null ? Number(m.dailyLimitUsd) : undefined,
    },
    chains: {
      allowed: Array.isArray(ch.allowed) ? (ch.allowed as string[]) : [],
    },
  };
}

function policyToOverrides(p: AgentPolicy): Record<string, unknown> {
  return {
    spending: p.spending,
    rateLimits: p.rateLimits,
    approval: p.approval,
    contracts: p.contracts,
    bridging: p.bridging,
    memecoins: p.memecoins,
    chains: p.chains,
  };
}

function policiesEqual(a: AgentPolicy, b: AgentPolicy): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-4">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">{title}</p>
      {children}
    </div>
  );
}

function DollarInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-text-secondary">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-text-tertiary">
          $
        </span>
        <input
          id={id}
          type="number"
          min={0}
          step="any"
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-full rounded-lg border border-border bg-surface-2 pl-7 pr-4 py-2.5 font-mono text-sm text-text-primary outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all"
        />
      </div>
    </div>
  );
}

function NumberInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-text-secondary">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full rounded-lg border border-border bg-surface-2 px-4 py-2.5 font-mono text-sm text-text-primary outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all"
      />
    </div>
  );
}

function ButtonGroup<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  labels?: Record<T, string>;
}) {
  return (
    <div className="flex gap-1.5">
      {options.map((opt) => (
        <button
          type="button"
          key={opt}
          onClick={() => onChange(opt)}
          className={`flex-1 rounded-lg border px-3 py-2 font-mono text-xs font-semibold transition-all ${
            value === opt
              ? "border-accent/30 bg-accent-muted text-accent"
              : "border-border bg-surface-2 text-text-secondary hover:border-border-hover"
          }`}
        >
          {labels ? labels[opt] : opt.replace(/_/g, " ")}
        </button>
      ))}
    </div>
  );
}

function ChainChips({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (chains: string[]) => void;
}) {
  const toggle = (chainId: string) => {
    onChange(
      selected.includes(chainId)
        ? selected.filter((c) => c !== chainId)
        : [...selected, chainId],
    );
  };

  return (
    <div className="flex flex-wrap gap-2">
      {CHAIN_OPTIONS.map((chain) => (
        <button
          type="button"
          key={chain.id}
          onClick={() => toggle(chain.id)}
          className={`rounded-lg border px-3 py-2 font-mono text-xs transition-all ${
            selected.includes(chain.id)
              ? "border-accent/30 bg-accent-muted text-accent"
              : "border-border bg-surface-2 text-text-secondary hover:border-border-hover"
          }`}
        >
          {chain.short}
          <span className="ml-1.5 text-text-tertiary">{chain.label}</span>
        </button>
      ))}
    </div>
  );
}

function ChangeSummaryPanel({
  original,
  current,
  originalPreset,
  currentPreset,
}: {
  original: AgentPolicy;
  current: AgentPolicy;
  originalPreset: string;
  currentPreset: string;
}) {
  const diffs: string[] = [];

  if (originalPreset !== currentPreset) {
    diffs.push(`Preset: ${originalPreset} -> ${currentPreset}`);
  }

  // spending
  if (original.spending.maxTransactionValueUsd !== current.spending.maxTransactionValueUsd) {
    diffs.push(`Max tx: $${fmt(original.spending.maxTransactionValueUsd)} -> $${fmt(current.spending.maxTransactionValueUsd)}`);
  }
  if (original.spending.dailyLimitUsd !== current.spending.dailyLimitUsd) {
    diffs.push(`Daily limit: $${fmt(original.spending.dailyLimitUsd)} -> $${fmt(current.spending.dailyLimitUsd)}`);
  }
  if (original.spending.weeklyLimitUsd !== current.spending.weeklyLimitUsd) {
    diffs.push(`Weekly limit: $${fmt(original.spending.weeklyLimitUsd)} -> $${fmt(current.spending.weeklyLimitUsd)}`);
  }

  // rates
  if (original.rateLimits.maxTxPerHour !== current.rateLimits.maxTxPerHour) {
    diffs.push(`Tx/hour: ${original.rateLimits.maxTxPerHour} -> ${current.rateLimits.maxTxPerHour}`);
  }
  if (original.rateLimits.maxTxPerDay !== current.rateLimits.maxTxPerDay) {
    diffs.push(`Tx/day: ${original.rateLimits.maxTxPerDay} -> ${current.rateLimits.maxTxPerDay}`);
  }

  // approval
  if (original.approval.autonomousThresholdUsd !== current.approval.autonomousThresholdUsd) {
    diffs.push(`Auto threshold: $${fmt(original.approval.autonomousThresholdUsd)} -> $${fmt(current.approval.autonomousThresholdUsd)}`);
  }

  // contracts
  if (original.contracts.mode !== current.contracts.mode) {
    diffs.push(`Contract mode: ${original.contracts.mode} -> ${current.contracts.mode}`);
  }
  if (original.contracts.tokenApprovalMode !== current.contracts.tokenApprovalMode) {
    diffs.push(`Token approvals: ${original.contracts.tokenApprovalMode} -> ${current.contracts.tokenApprovalMode}`);
  }

  // bridging
  if (original.bridging.mode !== current.bridging.mode) {
    diffs.push(`Bridge mode: ${original.bridging.mode} -> ${current.bridging.mode}`);
  }

  // memecoins
  if (original.memecoins.mode !== current.memecoins.mode) {
    diffs.push(`Memecoin mode: ${original.memecoins.mode} -> ${current.memecoins.mode}`);
  }
  if (original.memecoins.perTxLimitUsd !== current.memecoins.perTxLimitUsd) {
    diffs.push(`Memecoin per-tx: $${fmt(original.memecoins.perTxLimitUsd ?? 0)} -> $${fmt(current.memecoins.perTxLimitUsd ?? 0)}`);
  }
  if (original.memecoins.dailyLimitUsd !== current.memecoins.dailyLimitUsd) {
    diffs.push(`Memecoin daily: $${fmt(original.memecoins.dailyLimitUsd ?? 0)} -> $${fmt(current.memecoins.dailyLimitUsd ?? 0)}`);
  }

  // chains
  const origChains = [...original.chains.allowed].sort().join(",");
  const curChains = [...current.chains.allowed].sort().join(",");
  if (origChains !== curChains) {
    const added = current.chains.allowed.filter((c) => !original.chains.allowed.includes(c));
    const removed = original.chains.allowed.filter((c) => !current.chains.allowed.includes(c));
    if (added.length > 0) diffs.push(`Chains added: ${added.join(", ")}`);
    if (removed.length > 0) diffs.push(`Chains removed: ${removed.join(", ")}`);
  }

  if (diffs.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface-2/30 p-3">
        <p className="text-xs text-text-tertiary">No changes detected</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-warning/20 bg-warning-muted p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-warning">
        {diffs.length} change{diffs.length !== 1 ? "s" : ""}
      </p>
      <ul className="space-y-1">
        {diffs.map((d) => (
          <li key={d} className="font-mono text-xs text-text-secondary">
            <span className="mr-1.5 text-warning">*</span>
            {d}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View Mode (read-only summary)
// ---------------------------------------------------------------------------

function PolicyViewMode({
  policy,
  preset,
  version,
  onEdit,
}: {
  policy: AgentPolicy;
  preset: string;
  version: number;
  onEdit: () => void;
}) {
  const chainLabel = (id: string) => CHAIN_OPTIONS.find((c) => c.id === id)?.short ?? id;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PresetBadge preset={preset} />
          <span className="font-mono text-xs text-text-tertiary">v{version}</span>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-accent transition-colors"
        >
          <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
          </svg>
          Edit Policy
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface-2/50 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Spending Limits</p>
          <div className="space-y-1">
            <p className="font-mono text-xs text-text-secondary">
              Per-tx: <span className="text-text-primary">${fmt(policy.spending.maxTransactionValueUsd)}</span>
            </p>
            <p className="font-mono text-xs text-text-secondary">
              Daily: <span className="text-text-primary">${fmt(policy.spending.dailyLimitUsd)}</span>
            </p>
            <p className="font-mono text-xs text-text-secondary">
              Weekly: <span className="text-text-primary">${fmt(policy.spending.weeklyLimitUsd)}</span>
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface-2/50 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Rate Limits</p>
          <div className="space-y-1">
            <p className="font-mono text-xs text-text-secondary">
              Per hour: <span className="text-text-primary">{policy.rateLimits.maxTxPerHour}</span>
            </p>
            <p className="font-mono text-xs text-text-secondary">
              Per day: <span className="text-text-primary">{policy.rateLimits.maxTxPerDay}</span>
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface-2/50 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Approval</p>
          <p className="font-mono text-xs text-text-secondary">
            Auto threshold: <span className="text-text-primary">${fmt(policy.approval.autonomousThresholdUsd)}</span>
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface-2/50 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Contracts</p>
          <div className="space-y-1">
            <p className="font-mono text-xs text-text-secondary">
              Mode: <span className="text-text-primary">{policy.contracts.mode.replace(/_/g, " ")}</span>
            </p>
            <p className="font-mono text-xs text-text-secondary">
              Approvals: <span className="text-text-primary">{policy.contracts.tokenApprovalMode}</span>
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface-2/50 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Bridging & Memecoins</p>
          <div className="space-y-1">
            <p className="font-mono text-xs text-text-secondary">
              Bridge: <span className="text-text-primary">{policy.bridging.mode.replace(/_/g, " ")}</span>
            </p>
            <p className="font-mono text-xs text-text-secondary">
              Memecoins: <span className="text-text-primary">{policy.memecoins.mode}</span>
            </p>
            {policy.memecoins.mode === "capped" && policy.memecoins.perTxLimitUsd != null && (
              <p className="font-mono text-xs text-text-tertiary ml-2">
                cap: ${fmt(policy.memecoins.perTxLimitUsd)}/tx, ${fmt(policy.memecoins.dailyLimitUsd ?? 0)}/day
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface-2/50 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Chains</p>
          <div className="flex flex-wrap gap-1.5">
            {policy.chains.allowed.length === 0 ? (
              <span className="text-xs text-text-tertiary">None</span>
            ) : (
              policy.chains.allowed.map((c) => (
                <span
                  key={c}
                  className="rounded-md border border-border bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-text-secondary"
                >
                  {chainLabel(c)}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main PolicyEditor
// ---------------------------------------------------------------------------

export default function PolicyEditor({
  agent,
  onUpdated,
}: {
  agent: AgentDetailType;
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [presetConfigs, setPresetConfigs] = useState<Record<string, Record<string, unknown>> | null>(null);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [presetsError, setPresetsError] = useState("");

  // Current edited state
  const [activePreset, setActivePreset] = useState<PresetName>("custom");
  const [draft, setDraft] = useState<AgentPolicy | null>(null);
  const [changeSummary, setChangeSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const policy = agent.currentPolicy;

  const originalPolicy: AgentPolicy | null = policy ? policyFromRaw(policy.data) : null;

  // Fetch presets on first edit
  const loadPresets = useCallback(async () => {
    if (presetConfigs) return;
    setPresetsLoading(true);
    setPresetsError("");
    try {
      const data = await api.policies.presets();
      setPresetConfigs(data);
    } catch (err) {
      setPresetsError(err instanceof Error ? err.message : "Failed to load presets");
    } finally {
      setPresetsLoading(false);
    }
  }, [presetConfigs]);

  // When entering edit mode, load presets + init draft
  const startEditing = useCallback(() => {
    if (originalPolicy) {
      setDraft({ ...structuredClone(originalPolicy) });
      setActivePreset((policy?.preset as PresetName) ?? "custom");
    }
    setChangeSummary("");
    setSaveError("");
    setEditing(true);
  }, [originalPolicy, policy?.preset]);

  useEffect(() => {
    if (editing) {
      void loadPresets();
    }
  }, [editing, loadPresets]);

  // Apply preset values
  const applyPreset = useCallback(
    (name: PresetName) => {
      if (name === "custom" || !presetConfigs) {
        setActivePreset("custom");
        return;
      }
      const raw = presetConfigs[name];
      if (!raw) return;
      setDraft(policyFromRaw(raw));
      setActivePreset(name);
    },
    [presetConfigs],
  );

  // Update a field and switch to custom if it diverges from active preset
  const updateDraft = useCallback(
    (updater: (prev: AgentPolicy) => AgentPolicy) => {
      setDraft((prev) => {
        if (!prev) return prev;
        const next = updater(prev);

        // Check if still matches active preset
        if (activePreset !== "custom" && presetConfigs) {
          const presetRaw = presetConfigs[activePreset];
          if (presetRaw) {
            const presetPolicy = policyFromRaw(presetRaw);
            if (!policiesEqual(next, presetPolicy)) {
              setActivePreset("custom");
            }
          }
        }

        return next;
      });
    },
    [activePreset, presetConfigs],
  );

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setSaveError("");
    try {
      await api.policies.updateFull(
        agent.id,
        activePreset,
        policyToOverrides(draft),
        changeSummary || undefined,
      );
      setEditing(false);
      onUpdated();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save policy");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setDraft(null);
    setSaveError("");
  };

  // ---------------------------------------------------------------------------
  // No policy state
  // ---------------------------------------------------------------------------

  if (!policy || !originalPolicy) {
    return <p className="text-sm text-text-tertiary">No policy assigned</p>;
  }

  // ---------------------------------------------------------------------------
  // View Mode
  // ---------------------------------------------------------------------------

  if (!editing) {
    return (
      <PolicyViewMode
        policy={originalPolicy}
        preset={policy.preset}
        version={policy.version}
        onEdit={startEditing}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Edit Mode
  // ---------------------------------------------------------------------------

  if (!draft) return null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PresetBadge preset={activePreset} />
          <span className="font-mono text-xs text-text-tertiary">v{policy.version}</span>
          <span className="text-[10px] font-medium text-accent">Editing</span>
        </div>
      </div>

      {/* Preset presets error */}
      {presetsError && <ErrorMessage message={presetsError} onRetry={loadPresets} />}

      {/* Preset quick-select */}
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Preset</p>
        <div className="flex gap-2">
          {presetsLoading && <Spinner size="sm" />}
          {!presetsLoading &&
            PRESET_LABELS.map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => applyPreset(p)}
                disabled={!presetConfigs}
                className={`rounded-lg border px-4 py-2 font-mono text-xs font-semibold uppercase transition-all disabled:opacity-40 ${
                  activePreset === p
                    ? "border-accent/30 bg-accent-muted text-accent"
                    : "border-border bg-surface-2 text-text-secondary hover:border-border-hover"
                }`}
              >
                {p}
              </button>
            ))}
          <button
            type="button"
            className={`rounded-lg border px-4 py-2 font-mono text-xs font-semibold uppercase transition-all ${
              activePreset === "custom"
                ? "border-accent/30 bg-accent-muted text-accent"
                : "border-border bg-surface-2 text-text-secondary hover:border-border-hover"
            }`}
            onClick={() => setActivePreset("custom")}
          >
            custom
          </button>
        </div>
      </div>

      {/* Field groups */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Spending Limits */}
        <SectionCard title="Spending Limits">
          <div className="space-y-3">
            <DollarInput
              id="pe-max-tx"
              label="Max transaction"
              value={draft.spending.maxTransactionValueUsd}
              onChange={(v) =>
                updateDraft((d) => ({
                  ...d,
                  spending: { ...d.spending, maxTransactionValueUsd: v },
                }))
              }
            />
            <DollarInput
              id="pe-daily"
              label="Daily limit"
              value={draft.spending.dailyLimitUsd}
              onChange={(v) =>
                updateDraft((d) => ({
                  ...d,
                  spending: { ...d.spending, dailyLimitUsd: v },
                }))
              }
            />
            <DollarInput
              id="pe-weekly"
              label="Weekly limit"
              value={draft.spending.weeklyLimitUsd}
              onChange={(v) =>
                updateDraft((d) => ({
                  ...d,
                  spending: { ...d.spending, weeklyLimitUsd: v },
                }))
              }
            />
          </div>
        </SectionCard>

        {/* Rate Limits */}
        <SectionCard title="Rate Limits">
          <div className="space-y-3">
            <NumberInput
              id="pe-tx-hour"
              label="Max tx per hour"
              value={draft.rateLimits.maxTxPerHour}
              onChange={(v) =>
                updateDraft((d) => ({
                  ...d,
                  rateLimits: { ...d.rateLimits, maxTxPerHour: v },
                }))
              }
            />
            <NumberInput
              id="pe-tx-day"
              label="Max tx per day"
              value={draft.rateLimits.maxTxPerDay}
              onChange={(v) =>
                updateDraft((d) => ({
                  ...d,
                  rateLimits: { ...d.rateLimits, maxTxPerDay: v },
                }))
              }
            />
          </div>
        </SectionCard>

        {/* Approval */}
        <SectionCard title="Approval">
          <DollarInput
            id="pe-auto-threshold"
            label="Autonomous threshold"
            value={draft.approval.autonomousThresholdUsd}
            onChange={(v) =>
              updateDraft((d) => ({
                ...d,
                approval: { autonomousThresholdUsd: v },
              }))
            }
          />
        </SectionCard>

        {/* Contract Mode */}
        <SectionCard title="Contract Mode">
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-text-secondary">Interaction mode</p>
              <ButtonGroup
                options={["allowlist", "verified", "blocklist_only"] as const}
                value={draft.contracts.mode}
                onChange={(v) =>
                  updateDraft((d) => ({
                    ...d,
                    contracts: { ...d.contracts, mode: v },
                  }))
                }
                labels={{ allowlist: "allowlist", verified: "verified", blocklist_only: "blocklist only" }}
              />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-text-secondary">Token approvals</p>
              <ButtonGroup
                options={["exact", "capped", "uncapped"] as const}
                value={draft.contracts.tokenApprovalMode}
                onChange={(v) =>
                  updateDraft((d) => ({
                    ...d,
                    contracts: { ...d.contracts, tokenApprovalMode: v },
                  }))
                }
              />
            </div>
          </div>
        </SectionCard>

        {/* Bridge Mode */}
        <SectionCard title="Bridge Mode">
          <ButtonGroup
            options={["no", "stables_canonical", "yes"] as const}
            value={draft.bridging.mode}
            onChange={(v) =>
              updateDraft((d) => ({
                ...d,
                bridging: { mode: v },
              }))
            }
            labels={{ no: "no", stables_canonical: "stables + canonical", yes: "yes" }}
          />
        </SectionCard>

        {/* Memecoin Mode */}
        <SectionCard title="Memecoin Mode">
          <div className="space-y-3">
            <ButtonGroup
              options={["no", "capped", "yes"] as const}
              value={draft.memecoins.mode}
              onChange={(v) =>
                updateDraft((d) => ({
                  ...d,
                  memecoins: {
                    ...d.memecoins,
                    mode: v,
                    perTxLimitUsd: v === "capped" ? (d.memecoins.perTxLimitUsd ?? 100) : undefined,
                    dailyLimitUsd: v === "capped" ? (d.memecoins.dailyLimitUsd ?? 500) : undefined,
                  },
                }))
              }
            />
            {draft.memecoins.mode === "capped" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <DollarInput
                  id="pe-meme-tx"
                  label="Per-tx limit"
                  value={draft.memecoins.perTxLimitUsd ?? 0}
                  onChange={(v) =>
                    updateDraft((d) => ({
                      ...d,
                      memecoins: { ...d.memecoins, perTxLimitUsd: v },
                    }))
                  }
                />
                <DollarInput
                  id="pe-meme-daily"
                  label="Daily limit"
                  value={draft.memecoins.dailyLimitUsd ?? 0}
                  onChange={(v) =>
                    updateDraft((d) => ({
                      ...d,
                      memecoins: { ...d.memecoins, dailyLimitUsd: v },
                    }))
                  }
                />
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      {/* Chains (full width) */}
      <SectionCard title="Chains">
        <ChainChips
          selected={draft.chains.allowed}
          onChange={(chains) =>
            updateDraft((d) => ({ ...d, chains: { allowed: chains } }))
          }
        />
      </SectionCard>

      {/* Change summary / diff */}
      <ChangeSummaryPanel
        original={originalPolicy}
        current={draft}
        originalPreset={policy.preset}
        currentPreset={activePreset}
      />

      {/* Change description */}
      <div>
        <label htmlFor="pe-change-summary" className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
          Change Summary
        </label>
        <input
          id="pe-change-summary"
          type="text"
          value={changeSummary}
          onChange={(e) => setChangeSummary(e.target.value)}
          placeholder="Describe what changed and why (optional)"
          className="w-full rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-sm text-text-primary outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all"
        />
      </div>

      {/* Save error */}
      {saveError && <ErrorMessage message={saveError} />}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || policiesEqual(originalPolicy, draft)}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-surface-0 transition-all hover:bg-accent-dim disabled:opacity-50 active:scale-[0.98]"
        >
          {saving && <Spinner size="sm" />}
          Save Changes
        </button>
      </div>
    </div>
  );
}
