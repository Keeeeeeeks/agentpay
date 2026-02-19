const variants: Record<string, string> = {
  safe: "bg-info-muted text-info border-info/20",
  normal: "bg-success-muted text-success border-success/20",
  degen: "bg-danger-muted text-danger border-danger/20",
};

export default function PresetBadge({ preset }: { preset: string }) {
  const cls = variants[preset.toLowerCase()] ?? "bg-surface-3 text-text-secondary border-border";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold font-mono uppercase tracking-wider ${cls}`}>
      {preset}
    </span>
  );
}
