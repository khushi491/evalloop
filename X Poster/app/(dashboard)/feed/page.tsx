export default function NewsFeedPage() {
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-50">
            AI News Feed
          </h1>
          <p className="text-sm text-slate-400">
            Live view of AI research, model releases, and product launches ready
            to turn into posts.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-outline">
            Ingest latest news
          </button>
          <button className="btn-primary">
            Generate daily digest
          </button>
        </div>
      </header>

      <div className="page-grid">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              Incoming stories
            </p>
            <p className="text-xs text-slate-500">
              Sample data • wiring to API later
            </p>
          </div>
          <div className="card divide-y divide-slate-800">
            <div className="flex items-start gap-3 p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-100">
                  New frontier model announced with real-time multimodal
                  reasoning
                </p>
                <p className="text-xs text-slate-400">
                  From: OpenAI • 4 min ago • model release
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <span className="badge-accent badge">
                    model release
                  </span>
                  <span className="badge-muted badge">
                    research
                  </span>
                  <span className="badge-muted badge">
                    multimodal
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1 text-xs">
                <button className="btn-primary h-7 px-2 text-xs">
                  Generate post
                </button>
                <button className="btn-outline h-7 px-2 text-xs">
                  Generate thread
                </button>
                <button className="btn-ghost h-7 px-2 text-xs">
                  Ignore
                </button>
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            Queue
          </p>
          <div className="card space-y-2 p-4 text-sm text-slate-300">
            <p className="text-xs text-slate-400">
              This sidebar will show draft posts and digest threads generated
              from selected stories.
            </p>
            <p className="text-xs text-slate-500">
              Once the backend is wired, this becomes your workspace: select a
              story → summarize → generate variants → schedule.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

