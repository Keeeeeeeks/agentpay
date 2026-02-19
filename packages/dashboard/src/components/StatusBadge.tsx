const variants: Record<string, string> = {
  active: "bg-success-muted text-success border-success/20",
  disabled: "bg-danger-muted text-danger border-danger/20",
  pending: "bg-warning-muted text-warning border-warning/20",
  approved: "bg-success-muted text-success border-success/20",
  rejected: "bg-danger-muted text-danger border-danger/20",
  expired: "bg-surface-3 text-text-tertiary border-border",
  revoked: "bg-danger-muted text-danger border-danger/20",
};

export default function StatusBadge({ status }: { status: string }) {
  const cls = variants[status.toLowerCase()] ?? "bg-surface-3 text-text-secondary border-border";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium font-mono uppercase tracking-wider ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
