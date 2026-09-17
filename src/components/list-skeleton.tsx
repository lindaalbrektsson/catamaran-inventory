export function ListSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div role="status" aria-busy="true" className="my-4">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="grid gap-2 lg:grid-cols-2">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex min-h-24 items-center gap-3 rounded-xl border p-3">
            <div className="skeleton size-9 rounded-lg" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-3/4 rounded" />
              <div className="skeleton h-3 w-1/2 rounded" />
            </div>
            <div className="skeleton h-7 w-14 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
