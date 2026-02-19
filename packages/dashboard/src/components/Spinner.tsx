export default function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dims = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-8 w-8" : "h-5 w-5";
  return (
    <div
      className={`${dims} rounded-full border-2 border-surface-3 border-t-accent`}
      style={{ animation: "spin 0.6s linear infinite" }}
    />
  );
}
