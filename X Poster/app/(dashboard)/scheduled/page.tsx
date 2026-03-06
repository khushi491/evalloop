export default function ScheduledPostsPage() {
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-50">
            Scheduled posts
          </h1>
          <p className="text-sm text-slate-400">
            See everything queued to go live on X.
          </p>
        </div>
      </header>

      <div className="card overflow-hidden">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900/80 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">
                Post
              </th>
              <th className="px-4 py-2 font-medium">
                Scheduled for
              </th>
              <th className="px-4 py-2 font-medium">
                Status
              </th>
              <th className="px-4 py-2 font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-200">
            <tr>
              <td className="px-4 py-3 text-xs">
                OpenAI&apos;s new multimodal model goes live — real-time text,
                image, and audio reasoning with lower latency.
              </td>
              <td className="px-4 py-3 text-xs text-slate-400">
                Today • 5:30 PM
              </td>
              <td className="px-4 py-3 text-xs">
                <span className="badge-accent badge">
                  scheduled
                </span>
              </td>
              <td className="px-4 py-3 text-xs">
                <div className="flex gap-2">
                  <button className="btn-outline h-7 px-2 text-xs">
                    Edit
                  </button>
                  <button className="btn-ghost h-7 px-2 text-xs">
                    Delete
                  </button>
                  <button className="btn-primary h-7 px-2 text-xs">
                    Publish now
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

