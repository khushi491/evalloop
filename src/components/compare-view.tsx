"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Attempt {
  id: string;
  index: number;
  outputText: string;
  scoreTotal: number | null;
}

export function CompareView({
  first,
  best,
  current,
}: {
  first: Attempt | null;
  best: Attempt | null;
  current: Attempt | null;
}) {
  if (!first) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-zinc-500">
          No attempts to compare.
        </CardContent>
      </Card>
    );
  }

  const right = best && best.index !== first.index ? best : current;

  return (
    <div className="grid grid-cols-2 gap-4">
      <AttemptCard attempt={first} label="Attempt 1" />
      {right && right.index !== first.index ? (
        <AttemptCard
          attempt={right}
          label={right === best ? "Best Attempt" : `Attempt ${right.index}`}
        />
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center py-8 text-sm text-zinc-500">
            Only one attempt so far.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AttemptCard({
  attempt,
  label,
}: {
  attempt: Attempt;
  label: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{label}</CardTitle>
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
              {attempt.scoreTotal}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
          {attempt.outputText}
        </p>
      </CardContent>
    </Card>
  );
}
