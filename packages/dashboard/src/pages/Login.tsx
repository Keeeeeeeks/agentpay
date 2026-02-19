import { useState } from "react";
import { setAdminKey, getAdminKey } from "../api";
import { Navigate } from "react-router-dom";

export default function Login() {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");

  if (getAdminKey()) {
    return <Navigate to="/agents" replace />;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) {
      setError("Admin key is required");
      return;
    }
    setAdminKey(key.trim());
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-0 px-4">
      <div className="relative w-full max-w-sm animate-fade-in">
        <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-b from-accent/20 to-transparent opacity-60 blur-xl" />
        <div className="relative rounded-2xl border border-border bg-surface-1 p-8">
          <div className="mb-8 flex flex-col items-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-accent/10 animate-pulse-glow">
              <svg className="h-7 w-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-text-primary">AgentPay</h1>
            <p className="mt-1 text-xs font-mono uppercase tracking-widest text-text-tertiary">Admin Console</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-text-tertiary">
                Admin Key
              </label>
              <input
                type="password"
                value={key}
                onChange={(e) => { setKey(e.target.value); setError(""); }}
                placeholder="Enter your admin key..."
                className="w-full rounded-lg border border-border bg-surface-2 px-4 py-3 font-mono text-sm text-text-primary placeholder-text-tertiary outline-none transition-all focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                autoFocus
              />
            </div>

            {error && (
              <p className="text-xs text-danger">{error}</p>
            )}

            <button
              type="submit"
              className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-surface-0 transition-all hover:bg-accent-dim active:scale-[0.98]"
            >
              Authenticate
            </button>
          </form>

          <div className="mt-6 flex items-center justify-center gap-2 text-[10px] text-text-tertiary">
            <span className="h-1 w-1 rounded-full bg-accent/50" />
            <span className="font-mono uppercase tracking-widest">Secured Connection</span>
            <span className="h-1 w-1 rounded-full bg-accent/50" />
          </div>
        </div>
      </div>
    </div>
  );
}
