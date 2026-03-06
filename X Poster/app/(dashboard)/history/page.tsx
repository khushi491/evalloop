export default function HistoryPage() {
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-50">
            Published history
          </h1>
          <p className="text-sm text-slate-400">
            A running log of what went live, when, and where.
          </p>
        </div>
      </header>

      <div className="card divide-y divide-slate-800">
        <div className="flex items-center justify-between px-4 py-3 text-xs text-slate-500">
          <span>Most recent posts</span>
          <span>Engagement (placeholder)</span>
        </div>

        <div className="space-y-3 p-4 text-sm">
          <div className="space-y-1">
            <p className="text-slate-100">
              &quot;Daily AI digest — funding rounds, new models, and key
              research from today&quot;
            </p>
            <p className="text-xs text-slate-500">
              Posted to X • 2 hours ago • link coming from API
            </p>
            <p className="text-xs text-slate-500">
              Engagement: ⭐ placeholder until connected to X analytics.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

