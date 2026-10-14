import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartTooltip } from "@/components/charts/ChartCard";
import { formatBytes, shortDay } from "@/lib/format";

/**
 * Columns: number of uploads on each of the last 14 days.
 * Each day is a separate count, so columns (not a smooth line) are the honest
 * form. One series -> one colour; the title says what it is, so no legend.
 */
export function UploadsChart({ data }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  return (
    <div className="h-56" role="img" aria-label={`Uploads in the last ${data.length} days: ${total} in total`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tickFormatter={shortDay}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <ChartTooltip
                  title={shortDay(payload[0].payload.date)}
                  lines={[
                    ["Uploads", payload[0].payload.count],
                    ["Size", formatBytes(payload[0].payload.bytes)],
                  ]}
                />
              ) : null
            }
          />
          {/* columns: <= 24px wide, 4px rounded top, square at the baseline */}
          <Bar dataKey="count" fill="var(--chart-1)" maxBarSize={24} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
