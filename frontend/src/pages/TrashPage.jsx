import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { FileList, FileListSkeleton } from "@/components/files/FileList";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, errorMessage } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { itemPath, toItems } from "@/lib/items";

/** Deleted items: restore them, delete them forever, or empty the Trash. */
export default function TrashPage() {
  const queryClient = useQueryClient();
  const [confirmItem, setConfirmItem] = useState(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["trash"],
    queryFn: () => api.get("/trash").then((r) => r.data),
  });
  const items = toItems(data?.folders, data?.files);

  const refresh = () => {
    for (const key of ["trash", "folder", "me"]) queryClient.invalidateQueries({ queryKey: [key] });
  };

  async function restore(item) {
    try {
      const { data: restored } = await api.post(`${itemPath(item)}/restore`);
      toast.success(`“${restored.name}” restored`);
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function deleteForever(item) {
    try {
      await api.delete(`${itemPath(item)}/permanent`);
      toast.success(`“${item.name}” deleted forever`);
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function emptyTrash() {
    try {
      const { data: result } = await api.delete("/trash");
      toast.success(result.message);
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader
        title="Trash"
        description="Items here still use storage until you delete them forever."
        actions={
          items.length > 0 && (
            <Button variant="outline" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirmEmpty(true)}>
              <Trash2 /> Empty Trash
            </Button>
          )
        }
      />
      {isLoading ? (
        <FileListSkeleton rows={4} />
      ) : items.length === 0 ? (
        <EmptyState icon={Trash2} title="Trash is empty" description="Deleted files and folders appear here, so you can restore them if you change your mind." />
      ) : (
        <FileList
          items={items}
          extraColumn={{ label: "Deleted", render: (item) => timeAgo(item.deleted_at) }}
          rowActions={(item) => (
            <div className="flex justify-end gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" onClick={() => restore(item)} aria-label={`Restore ${item.name}`}>
                    <RotateCcw />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Restore</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setConfirmItem(item)}
                    aria-label={`Delete ${item.name} forever`}
                  >
                    <Trash2 />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete forever</TooltipContent>
              </Tooltip>
            </div>
          )}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirmItem)}
        onOpenChange={(o) => !o && setConfirmItem(null)}
        title={`Delete “${confirmItem?.name}” forever?`}
        description="This permanently deletes it and all of its versions. This cannot be undone."
        confirmLabel="Delete forever"
        onConfirm={() => deleteForever(confirmItem)}
      />
      <ConfirmDialog
        open={confirmEmpty}
        onOpenChange={setConfirmEmpty}
        title="Empty the Trash?"
        description={`All ${items.length} item(s) in the Trash will be permanently deleted. This cannot be undone.`}
        confirmLabel="Empty Trash"
        onConfirm={emptyTrash}
      />
    </>
  );
}
