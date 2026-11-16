export function DemoModeBanner({ label }: { label: string | null | undefined }) {
  if (!label) return null;
  return (
    <div
      role="status"
      className="rounded-lg border border-amber-700/80 bg-amber-950/60 px-4 py-3 text-sm font-medium text-amber-100"
    >
      {label}
    </div>
  );
}
