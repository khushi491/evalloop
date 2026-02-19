"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface Attempt {
  index: number;
  scoreTotal: number | null;
}

export function ScoreChart({
  attempts,
  targetScore,
}: {
  attempts: Attempt[];
  targetScore: number;
}) {
  const data = attempts
    .filter((a) => a.scoreTotal !== null)
    .map((a) => ({
      name: `#${a.index}`,
      score: a.scoreTotal,
    }));

  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Score Trend</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: "#a1a1aa" }}
              stroke="#3f3f46"
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: "#a1a1aa" }}
              stroke="#3f3f46"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#18181b",
                border: "1px solid #3f3f46",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
            <ReferenceLine
              y={targetScore}
              stroke="#10b981"
              strokeDasharray="5 5"
              label={{
                value: `Target: ${targetScore}`,
                position: "insideTopRight",
                fill: "#10b981",
                fontSize: 11,
              }}
            />
            <Line
              type="monotone"
              dataKey="score"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={{ fill: "#f59e0b", r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
