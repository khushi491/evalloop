import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-16 lg:flex-row lg:items-center">
        <div className="max-w-xl space-y-6">
          <span className="badge-accent badge">
            New • AI newsroom autoposter
          </span>
          <h1 className="text-balance text-4xl font-semibold tracking-tight text-slate-50 sm:text-5xl">
            Turn AI news into{" "}
            <span className="bg-gradient-to-r from-sky-400 to-cyan-300 bg-clip-text text-transparent">
              X posts
            </span>{" "}
            automatically.
          </h1>
          <p className="text-balance text-sm text-slate-400 sm:text-base">
            AI News AutoPoster watches research papers, model releases, and AI
            product launches, then turns them into clean, on-brand posts and
            daily digest threads ready to publish.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/feed" className="btn-primary">
              Open newsroom dashboard
            </Link>
            <Link href="/sources" className="btn-outline">
              Configure sources
            </Link>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-slate-500">
            <div className="space-y-1">
              <p className="font-medium text-slate-300">
                Built for AI operators
              </p>
              <p>Researchers, newsletter writers, and X accounts.</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-slate-300">
                Newsroom-grade workflow
              </p>
              <p>Ingestion → summarization → post generation → scheduling.</p>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-4">
          <div className="card p-4">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
              Example generated post
            </p>
            <div className="mt-3 space-y-2 rounded-lg border border-slate-800 bg-slate-900/80 p-3 text-sm text-slate-100">
              <p>
                OpenAI just released a new multimodal model capable of real-time
                reasoning across text, audio, and video.
              </p>
              <p>
                The biggest change: significantly lower latency for voice
                interactions — a big unlock for assistants and live copilots.
              </p>
              <p className="text-slate-400">
                Details:{" "}
                <span className="text-sky-400">
                  [link will be auto-inserted]
                </span>
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="card p-3">
              <p className="text-xs font-medium text-slate-400">
                Sources
              </p>
              <p className="mt-1 text-sm text-slate-200">
                Labs, arXiv, tech media, funding.
              </p>
            </div>
            <div className="card p-3">
              <p className="text-xs font-medium text-slate-400">
                Output modes
              </p>
              <p className="mt-1 text-sm text-slate-200">
                Single posts, model-release threads, daily digests.
              </p>
            </div>
            <div className="card p-3">
              <p className="text-xs font-medium text-slate-400">
                Control
              </p>
              <p className="mt-1 text-sm text-slate-200">
                Human-in-the-loop review or safe autopublish.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

