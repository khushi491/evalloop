"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Attempt {
  index: number;
  scoreTotal: number | null;
  scoreBreakdown: Record<string, number> | null;
  violations: { type: string; message: string; severity: string }[] | null;
  notes: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  constraint_coverage: "Constraint Coverage",
  clarity_structure: "Clarity & Structure",
  tone: "Tone",
  safety: "Safety",
  tool_correctness: "Tool Correctness",
};

export function EvaluatorView({ attempt }: { attempt: Attempt }) {
  return (
    <div className="space-y-4">
      {/* Score Breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">
              Score Breakdown — Attempt {attempt.index}
            </CardTitle>
            {attempt.scoreTotal !== null && (
              <Badge
                variant={
                  attempt.scoreTotal >= 90
                    ? "success"
                    : attempt.scoreTotal >= 70
                    ? "warning"
                    : "destructive"
                }
              >
                Total: {attempt.scoreTotal}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {attempt.scoreBreakdown ? (
            <div className="space-y-3">
              {Object.entries(attempt.scoreBreakdown).map(([key, val]) => (
                <div key={key}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-zinc-300">
                      {CATEGORY_LABELS[key] ?? key}
                    </span>
                    <span className="font-mono text-zinc-400">{val}/5</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-zinc-800">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        val >= 4
                          ? "bg-emerald-500"
                          : val >= 3
                          ? "bg-amber-500"
                          : "bg-red-500"
                      }`}
                      style={{ width: `${(val / 5) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No breakdown available.</p>
          )}
        </CardContent>
      </Card>

      {/* Evaluator Notes */}
      {attempt.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Evaluator Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-zinc-300">
              {attempt.notes}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Violations */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Violations</CardTitle>
        </CardHeader>
        <CardContent>
          {attempt.violations && attempt.violations.length > 0 ? (
            <ul className="space-y-2">
              {attempt.violations.map((v, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3"
                >
                  <Badge
                    variant={
                      v.severity === "high"
                        ? "destructive"
                        : v.severity === "medium"
                        ? "warning"
                        : "secondary"
                    }
                    className="mt-0.5 shrink-0 text-xs"
                  >
                    {v.severity}
                  </Badge>
                  <div>
                    <span className="text-xs font-medium uppercase text-zinc-500">
                      {v.type}
                    </span>
                    <p className="text-sm text-zinc-300">{v.message}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-emerald-400">
              No violations found.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
