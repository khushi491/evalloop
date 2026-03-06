export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-50">
            Settings
          </h1>
          <p className="text-sm text-slate-400">
            Configure X connection, tone, and autoposting behaviour.
          </p>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card space-y-3 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            X account
          </p>
          <p className="text-xs text-slate-400">
            OAuth + token storage will be wired here. For now this is a visual
            placeholder.
          </p>
          <button className="btn-primary">
            Connect X account
          </button>
        </section>

        <section className="card space-y-3 p-4 text-sm">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            Defaults
          </p>
          <div className="space-y-2">
            <label className="space-y-1">
              <span className="text-xs text-slate-400">
                Default tone
              </span>
              <select className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100">
                <option>Neutral</option>
                <option>Excited</option>
                <option>Analytical</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-400">
                Max posts per day
              </span>
              <input
                type="number"
                defaultValue={8}
                className="w-24 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input type="checkbox" className="h-3 w-3" />
              <span>Enable autopublish for low-risk updates</span>
            </label>
          </div>
        </section>
      </div>
    </div>
  );
}

