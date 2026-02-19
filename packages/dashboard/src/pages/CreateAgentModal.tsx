import { useState } from "react";
import { api } from "../api";
import Spinner from "../components/Spinner";

const presets = [
  {
    id: "safe",
    name: "Safe",
    color: "border-info/30 bg-info-muted",
    accent: "text-info",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    description: "Conservative limits. Whitelisted contracts only. No bridges, no memecoins.",
    limits: "$100/day · $500/week · 10 tx/hr",
  },
  {
    id: "normal",
    name: "Normal",
    color: "border-success/30 bg-success-muted",
    accent: "text-success",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
    description: "Balanced limits. Audited contracts. Bridges allowed, no memecoins.",
    limits: "$1,000/day · $5,000/week · 30 tx/hr",
  },
  {
    id: "degen",
    name: "Degen",
    color: "border-danger/30 bg-danger-muted",
    accent: "text-danger",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
      </svg>
    ),
    description: "High limits. Any contract. Bridges + memecoins enabled. Max risk.",
    limits: "$10,000/day · $50,000/week · 100 tx/hr",
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateAgentModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [preset, setPreset] = useState("normal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Agent name is required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api.agents.create(name.trim(), preset);
      setName("");
      setPreset("normal");
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg animate-fade-in rounded-2xl border border-border bg-surface-1 p-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-primary">Create Agent</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-text-tertiary hover:text-text-primary hover:bg-surface-3 transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-text-tertiary">
              Agent Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              placeholder="e.g. trading-bot-alpha"
              className="w-full rounded-lg border border-border bg-surface-2 px-4 py-3 font-mono text-sm text-text-primary placeholder-text-tertiary outline-none transition-all focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-3 block text-xs font-medium uppercase tracking-wider text-text-tertiary">
              Policy Preset
            </label>
            <div className="grid gap-3">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPreset(p.id)}
                  className={`flex items-start gap-4 rounded-xl border p-4 text-left transition-all ${
                    preset === p.id
                      ? `${p.color} ring-1 ring-current/20`
                      : "border-border bg-surface-2 hover:border-border-hover"
                  }`}
                >
                  <div className={`mt-0.5 shrink-0 ${preset === p.id ? p.accent : "text-text-tertiary"}`}>
                    {p.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${preset === p.id ? p.accent : "text-text-primary"}`}>
                        {p.name}
                      </span>
                      {preset === p.id && (
                        <svg className={`h-4 w-4 ${p.accent}`} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-text-secondary">{p.description}</p>
                    <p className="mt-1.5 font-mono text-[11px] text-text-tertiary">{p.limits}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-xs text-danger">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:border-border-hover transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-surface-0 transition-all hover:bg-accent-dim disabled:opacity-50 active:scale-[0.98]"
            >
              {loading ? <Spinner size="sm" /> : null}
              Create Agent
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
