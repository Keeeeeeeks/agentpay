export default function ErrorMessage({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-danger/20 bg-danger-muted px-4 py-3">
      <svg className="h-5 w-5 shrink-0 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
      <span className="text-sm text-danger">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="ml-auto text-xs font-medium text-danger hover:text-red-300 transition-colors">
          Retry
        </button>
      )}
    </div>
  );
}
