export default function GeneratePostPage() {
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-50">
            Generate post
          </h1>
          <p className="text-sm text-slate-400">
            Select an article, then let the model suggest X posts or research
            threads.
          </p>
        </div>
        <button className="btn-outline">
          View summarization settings
        </button>
      </header>

      <div className="page-grid">
        <section className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            Selected article
          </p>
          <div className="card space-y-2 p-4 text-sm">
            <p className="text-xs text-slate-400">
              This panel will show the article you picked from the feed.
            </p>
            <p className="text-slate-200">
              For now, we are using placeholder content — the backend will wire
              summaries and metadata into this view.
            </p>
          </div>

          <div className="card space-y-3 p-4 text-sm">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              Generation options
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs text-slate-400">
                  Post type
                </p>
                <select className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100">
                  <option>Single post</option>
                  <option>Model release thread</option>
                  <option>Daily AI digest</option>
                </select>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-slate-400">
                  Tone
                </p>
                <select className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100">
                  <option>Neutral</option>
                  <option>Excited</option>
                  <option>Analytical</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-slate-400">
              <label className="flex items-center gap-2">
                <input type="checkbox" defaultChecked className="h-3 w-3" />
                <span>Include article link</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" defaultChecked className="h-3 w-3" />
                <span>Include suggested hashtags</span>
              </label>
            </div>
            <button className="btn-primary">
              Generate variants
            </button>
          </div>
        </section>

        <aside className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            Generated posts
          </p>
          <div className="card space-y-3 p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="text-slate-100">
                Draft variant #1 will appear here with character count and quick
                actions once the generation API is wired.
              </p>
              <span className="badge-muted badge">
                0 / 280
              </span>
            </div>
            <div className="flex gap-2 text-xs">
              <button className="btn-primary">
                Schedule
              </button>
              <button className="btn-outline">
                Copy
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

