import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, CornerLeftUp, FolderClosed, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

/**
 * Pick a destination folder by browsing your folders, then press "Move here".
 * The item being moved (if it's a folder) is hidden so it can't be moved into itself.
 */
export function MoveDialog({ open, onOpenChange, item, onMove }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Mounted only while open, so browsing always starts at My Files. */}
        {item && <FolderBrowser item={item} onMove={onMove} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function FolderBrowser({ item, onMove, onClose }) {
  const [folderId, setFolderId] = useState(null); // null = My Files (top level)
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["folder", folderId],
    queryFn: () => api.get("/folders/contents", { params: { folder_id: folderId ?? undefined } }).then((r) => r.data),
  });

  const folders = (data?.folders ?? []).filter((f) => !(item.type === "folder" && f.id === item.id));
  const crumbs = data?.breadcrumbs ?? [];
  const parentId = crumbs.length > 1 ? crumbs[crumbs.length - 2].id : null;
  const currentParent = (item.type === "folder" ? item.parent_id : item.folder_id) ?? null;

  async function handleMove() {
    setBusy(true);
    try {
      await onMove(item, folderId);
      onClose();
    } catch {
      /* toast already shown */
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Move “{item.name}”</DialogTitle>
        <DialogDescription>Choose the folder to move it into.</DialogDescription>
      </DialogHeader>

      <div className="overflow-hidden rounded-xl border">
        <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-sm">
          {folderId !== null && (
            <Button variant="ghost" size="icon-xs" onClick={() => setFolderId(parentId)} aria-label="Up one folder">
              <CornerLeftUp />
            </Button>
          )}
          <span className="truncate font-semibold">{crumbs.length ? crumbs.map((c) => c.name).join(" / ") : "My Files"}</span>
        </div>
        <ul className="max-h-64 overflow-y-auto p-1.5">
          {isLoading &&
            Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="flex items-center gap-3 px-2.5 py-2">
                <Skeleton className="size-5 rounded" />
                <Skeleton className="h-3.5 w-40" />
              </li>
            ))}
          {!isLoading && folders.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No sub-folders here</li>}
          {folders.map((f) => (
            <li key={f.id}>
              <button
                onClick={() => setFolderId(f.id)}
                className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <FolderClosed className="size-4.5 fill-primary/15 text-primary" />
                <span className="flex-1 truncate">{f.name}</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleMove} disabled={busy || folderId === currentParent}>
          {busy && <LoaderCircle className="animate-spin" />}
          Move here
        </Button>
      </DialogFooter>
    </>
  );
}
