export function LoadingState({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 px-4 py-6" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-16 rounded-2xl" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="grid flex-1 place-items-center px-8 py-16 text-center">
      <div>
        <div className="font-mono text-4xl font-black tabular tracking-tight text-accent">0:00.0</div>
        <p className="mt-4 text-lg font-semibold">{title}</p>
        {hint ? <p className="mt-2 text-sm text-dim">{hint}</p> : null}
      </div>
    </div>
  );
}
