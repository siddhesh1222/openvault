import { motion } from "framer-motion";
import { EllipsisVertical, Users } from "lucide-react";

import { ItemMenuItems } from "@/components/files/ItemMenu";
import { Thumbnail } from "@/components/files/Thumbnail";
import { FileIcon } from "@/components/FileIcon";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatBytes, timeAgo } from "@/lib/format";
import { itemKey } from "@/lib/items";

/** Grid view: folders as compact tiles first, then files as cards with thumbnails. */
export function FileGrid({ items, permissionFor, actions, onOpen, getLinks }) {
  const folders = items.filter((i) => i.type === "folder");
  const files = items.filter((i) => i.type === "file");
  return (
    <div className="space-y-8">
      {folders.length > 0 && (
        <Section title="Folders">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5">
            {folders.map((item, i) => (
              <ItemShell key={itemKey(item)} item={item} index={i} permission={permissionFor(item)} actions={actions} onOpen={onOpen}>
                <div className="flex items-center gap-3 p-3 pr-10">
                  <FileIcon item={item} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{item.name}</div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      {item.shared && <Users className="size-3 text-primary" aria-hidden="true" />}
                      {item.shared ? "Shared folder" : "Folder"}
                    </div>
                  </div>
                </div>
              </ItemShell>
            ))}
          </div>
        </Section>
      )}
      {files.length > 0 && (
        <Section title="Files">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {files.map((item, i) => (
              <ItemShell key={itemKey(item)} item={item} index={i} permission={permissionFor(item)} actions={actions} onOpen={onOpen}>
                <div className="p-2 pb-0">
                  <Thumbnail item={item} getLinks={getLinks} />
                </div>
                <div className="p-3 pr-10">
                  <div className="truncate text-sm font-semibold">{item.name}</div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {formatBytes(item.size)} · {timeAgo(item.updated_at)}
                  </div>
                </div>
              </ItemShell>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Shared card frame: the whole card is a button (click / Enter opens it),
 * right-click opens the context menu, and the "⋯" button opens the same menu
 * for keyboard and touch users.
 */
function ItemShell({ item, index, permission, actions, onOpen, children }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(index * 0.025, 0.3), duration: 0.25 }}
          className="group relative rounded-2xl border bg-card shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
        >
          <button
            type="button"
            onClick={() => onOpen(item)}
            className="block w-full rounded-2xl text-left outline-none"
            aria-label={`${item.type === "folder" ? "Open folder" : "Open"} ${item.name}`}
          >
            {children}
          </button>
          {item.shared && item.type === "file" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="absolute top-3 left-3 flex size-6 items-center justify-center rounded-full bg-background/90 text-primary shadow-sm ring-1 ring-border backdrop-blur" aria-label="Shared">
                  <Users className="size-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent>Shared</TooltipContent>
            </Tooltip>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className={`absolute right-1.5 opacity-100 transition-opacity data-[state=open]:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 ${item.type === "folder" ? "top-1/2 -translate-y-1/2" : "bottom-2.5"}`}
                aria-label={`Actions for ${item.name}`}
              >
                <EllipsisVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <ItemMenuItems item={item} permission={permission} actions={actions} />
            </DropdownMenuContent>
          </DropdownMenu>
        </motion.div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ItemMenuItems item={item} permission={permission} actions={actions} kind="context" />
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function FileGridSkeleton() {
  return (
    <div className="space-y-8" aria-label="Loading files" role="status">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-2xl border p-3">
            <Skeleton className="size-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="rounded-2xl border p-2">
            <Skeleton className="aspect-[4/3] rounded-xl" />
            <div className="space-y-2 p-2 pt-3">
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
