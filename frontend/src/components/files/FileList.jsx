import { ArrowDown, ArrowUp, ArrowUpDown, EllipsisVertical, Users } from "lucide-react";

import { ItemMenuItems } from "@/components/files/ItemMenu";
import { FileIcon } from "@/components/FileIcon";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes, formatDateTime, timeAgo } from "@/lib/format";
import { fileKind, kindInfo } from "@/lib/fileTypes";
import { itemKey } from "@/lib/items";
import { cn } from "@/lib/utils";

const COLUMNS = [
  { key: "name", label: "Name" },
  { key: "size", label: "Size", className: "hidden w-28 sm:table-cell" },
  { key: "updated", label: "Modified", className: "hidden w-44 md:table-cell" },
];

/**
 * List view: a sortable table. Clicking a column header sorts by it;
 * clicking again flips the direction. `extraColumn` lets pages add a column
 * (e.g. "Shared by" or "Deleted").
 */
export function FileList({ items, sort, onSort, permissionFor, actions, onOpen, extraColumn, rowActions }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn("h-11 px-4 font-semibold", col.className)}
                aria-sort={sort?.key === col.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
              >
                {onSort ? (
                  <button
                    type="button"
                    onClick={() => onSort(col.key)}
                    className="-mx-1 inline-flex items-center gap-1.5 rounded px-1 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {col.label}
                    {sort?.key === col.key ? (
                      sort.dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />
                    ) : (
                      <ArrowUpDown className="size-3.5 opacity-40" />
                    )}
                  </button>
                ) : (
                  col.label
                )}
              </th>
            ))}
            {extraColumn && <th scope="col" className="hidden h-11 px-4 font-semibold lg:table-cell">{extraColumn.label}</th>}
            <th scope="col" className="h-11 w-14 px-2"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((item) => (
            <Row
              key={itemKey(item)}
              item={item}
              permission={permissionFor?.(item)}
              actions={actions}
              onOpen={onOpen}
              extraColumn={extraColumn}
              rowActions={rowActions}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ item, permission, actions, onOpen, extraColumn, rowActions }) {
  const row = (
    <tr className="group transition-colors hover:bg-muted/50">
      <td className="px-4 py-2.5">
        <button
          type="button"
          onClick={() => onOpen?.(item)}
          className="flex w-full min-w-0 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <FileIcon item={item} size="sm" />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate font-medium">{item.name}</span>
              {item.shared && <Users className="size-3.5 shrink-0 text-primary" aria-label="Shared" />}
            </span>
            <span className="block truncate text-xs text-muted-foreground sm:hidden">
              {item.type === "folder" ? "Folder" : formatBytes(item.size)} · {timeAgo(item.updated_at ?? item.created_at)}
            </span>
          </span>
        </button>
      </td>
      <td className="hidden px-4 text-muted-foreground sm:table-cell">
        {item.type === "folder" ? "—" : formatBytes(item.size)}
      </td>
      <td className="hidden px-4 text-muted-foreground md:table-cell" title={formatDateTime(item.updated_at ?? item.created_at)}>
        {timeAgo(item.updated_at ?? item.created_at)}
        <span className="sr-only"> ({kindInfo(fileKind(item)).label})</span>
      </td>
      {extraColumn && <td className="hidden px-4 text-muted-foreground lg:table-cell">{extraColumn.render(item)}</td>}
      <td className="px-2 text-right">
        {rowActions ? (
          rowActions(item)
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${item.name}`} className="sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 data-[state=open]:opacity-100">
                <EllipsisVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <ItemMenuItems item={item} permission={permission} actions={actions} />
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </td>
    </tr>
  );
  if (rowActions) return row; // pages with their own buttons (Trash) don't need the context menu
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ItemMenuItems item={item} permission={permission} actions={actions} kind="context" />
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function FileListSkeleton({ rows = 8 }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card" role="status" aria-label="Loading">
      <div className="h-11 border-b bg-muted/40" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b px-4 py-3 last:border-0">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${40 + ((i * 17) % 35)}%` }} />
          <Skeleton className="ml-auto hidden h-3.5 w-16 sm:block" />
          <Skeleton className="hidden h-3.5 w-24 md:block" />
        </div>
      ))}
    </div>
  );
}
