import { useState } from "react";
import { ChartColumn, Table2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Card that holds one chart, with a button to switch to a plain data table
 * (so the numbers are available without relying on colour or hovering).
 */
export function ChartCard({ title, description, table, children, empty }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="flex flex-col rounded-2xl border bg-card p-5 shadow-xs">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {!empty && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setAsTable(!asTable)}
                aria-label={asTable ? "Show chart" : "Show as table"}
                aria-pressed={asTable}
                className="text-muted-foreground"
              >
                {asTable ? <ChartColumn /> : <Table2 />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{asTable ? "Show chart" : "Show as table"}</TooltipContent>
          </Tooltip>
        )}
      </header>
      <div className="flex-1">{empty ?? (asTable ? table : children)}</div>
    </section>
  );
}

/** Simple accessible table used by the "Show as table" view. */
export function DataTable({ columns, rows }) {
  return (
    <div className="max-h-64 overflow-auto rounded-xl border">
      <table className="w-full text-sm tabular-nums">
        <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`px-3 py-2 font-semibold ${c.align === "right" ? "text-right" : ""}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key} className={`px-3 py-2 ${c.align === "right" ? "text-right" : ""}`}>
                  {c.format ? c.format(row[c.key], row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Tooltip box shared by the charts (text uses text colours, never the series colour). */
export function ChartTooltip({ title, lines }) {
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-popover-foreground">{title}</div>
      {lines.map(([label, value]) => (
        <div key={label} className="flex items-center gap-3">
          <span className="size-2 rounded-full bg-chart-1" aria-hidden="true" />
          <span className="text-muted-foreground">{label}</span>
          <span className="ml-auto font-semibold text-popover-foreground tabular-nums">{value}</span>
        </div>
      ))}
    </div>
  );
}
