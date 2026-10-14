import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartTooltip } from "@/components/charts/ChartCard";
import { formatBytes } from "@/lib/format";

/**
 * Horizontal bars: how much space each file type uses.
 * One colour on purpose: the job is comparing sizes (magnitude), and the
 * labels name each bar, so no colour legend is needed.
 */
export function StorageByTypeChart({ data }) {
  const rows = [...data].sort((a, b) => b.bytes - a.bytes);
  const height = rows.length * 40 + 8;
  return (
    <div style={{ height }} role="img" aria-label={`Storage by file type: ${rows.map((r) => `${r.label} ${formatBytes(r.bytes)}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 72, bottom: 0, left: 0 }} barCategoryGap={8}>
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis
            type="category"
            dataKey="label"
            width={88}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 13 }}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <ChartTooltip
                  title={payload[0].payload.label}
                  lines={[
                    ["Size", formatBytes(payload[0].payload.bytes)],
                    ["Files", payload[0].payload.count],
                  ]}
                />
              ) : null
            }
          />
          {/* bars: <= 24px thick, 4px rounded data-end, square at the baseline */}
          <Bar dataKey="bytes" fill="var(--chart-1)" barSize={20} radius={[0, 4, 4, 0]} isAnimationActive>
            <LabelList
              dataKey="bytes"
              position="right"
              formatter={(value) => formatBytes(value)}
              style={{ fill: "var(--foreground)", fontSize: 12, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
