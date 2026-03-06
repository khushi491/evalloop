import { MainNav } from "../../components/main-nav";

export default function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dashboard-shell">
      <MainNav />
      <main className="dashboard-main">
        <header className="dashboard-header">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                AI News AutoPoster
              </p>
              <p className="text-sm text-slate-300">
                Newsroom dashboard • monitor, generate, schedule.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-outline">
                View docs
              </button>
              <button className="btn-primary">
                New digest thread
              </button>
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-6xl px-4 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}

