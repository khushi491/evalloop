export default function SourcesPage() {
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-50">
            Sources
          </h1>
          <p className="text-sm text-slate-400">
            Choose which labs, blogs, and feeds power your AI newsroom.
          </p>
        </div>
        <button className="btn-primary">
          Save preferences
        </button>
      </header>

      <div className="card divide-y divide-slate-800">
        <div className="flex items-center justify-between px-4 py-3 text-xs text-slate-400">
          <span>Preconfigured sources</span>
          <span>Status • Last update</span>
        </div>

        <div className="divide-y divide-slate-800 text-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="font-medium text-slate-100">
                Major AI labs
              </p>
              <p className="text-xs text-slate-500">
                OpenAI, Anthropic, DeepMind, Meta, xAI, Mistral, more.
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="badge-accent badge">
                enabled
              </span>
              <span className="text-slate-500">
                last pull: 12 min ago
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="font-medium text-slate-100">
                AI research & arXiv
              </p>
              <p className="text-xs text-slate-500">
                ML, CV, NLP, multimodal, safety, systems.
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="badge-muted badge">
                enabled
              </span>
              <span className="text-slate-500">
                last pull: 1 hr ago
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="font-medium text-slate-100">
                AI startup funding
              </p>
              <p className="text-xs text-slate-500">
                Funding rounds, acquisitions, and AI infra plays.
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="badge-muted badge">
                disabled
              </span>
              <span className="text-slate-500">
                last pull: paused
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

