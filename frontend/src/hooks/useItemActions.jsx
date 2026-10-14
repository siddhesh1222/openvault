/**
 * Everything you can do to a file or folder, in one place.
 *
 * Returns:
 *   actions  - functions passed to menus/cards: open, preview, download, share,
 *              versions, rename, move, trash
 *   dialogs  - the JSX of all dialogs; render it once in the page
 *   getLinks - fetch short-lived preview/download links for a file
 *
 * Used by the My Files, Shared with me and Search pages, so they all behave
 * the same way.
 */
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { MoveDialog } from "@/components/files/MoveDialog";
import { NameDialog } from "@/components/files/NameDialog";
import { PreviewModal } from "@/components/files/PreviewModal";
import { ShareDialog } from "@/components/files/ShareDialog";
import { VersionDrawer } from "@/components/files/VersionDrawer";
import { api, downloadUrl, errorMessage } from "@/lib/api";
import { previewType } from "@/lib/fileTypes";
import { itemPath } from "@/lib/items";

export function useItemActions({ files = [], permissionFor = () => "owner" } = {}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Which dialog is open, and for which item (null = closed).
  const [previewItem, setPreviewItem] = useState(null);
  const [shareItem, setShareItem] = useState(null);
  const [versionsItem, setVersionsItem] = useState(null);
  const [renameItem, setRenameItem] = useState(null);
  const [moveItem, setMoveItem] = useState(null);
  const [trashItem, setTrashItem] = useState(null);

  const refresh = useCallback(() => {
    for (const key of ["folder", "me", "trash", "search", "shared-with-me"]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  }, [queryClient]);

  const getLinks = useCallback((item) => api.post(`/files/${item.id}/links`).then((r) => r.data), []);

  const download = useCallback(
    async (item) => {
      try {
        const links = await getLinks(item);
        downloadUrl(links.download_url);
        toast.success(`Downloading “${item.name}”`);
      } catch (err) {
        toast.error(errorMessage(err, "Download failed"));
      }
    },
    [getLinks],
  );

  const open = useCallback(
    (item) => {
      if (item.type === "folder") navigate(`/app/files/${item.id}`);
      else if (previewType(item)) setPreviewItem(item);
      else download(item);
    },
    [navigate, download],
  );

  async function rename(name) {
    try {
      await api.patch(itemPath(renameItem), { name });
      toast.success(`Renamed to “${name}”`);
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      throw err; // keeps the dialog open
    }
  }

  async function move(item, folderId) {
    try {
      const body = item.type === "folder" ? { parent_id: folderId } : { folder_id: folderId };
      await api.patch(itemPath(item), body);
      toast.success(`Moved “${item.name}”`);
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      throw err;
    }
  }

  async function trash() {
    const item = trashItem;
    try {
      await api.delete(itemPath(item));
      refresh();
      toast.success(`“${item.name}” moved to Trash`, {
        action: {
          label: "Undo",
          onClick: async () => {
            await api.post(`${itemPath(item)}/restore`);
            toast.success(`“${item.name}” restored`);
            refresh();
          },
        },
      });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const actions = {
    open,
    preview: setPreviewItem,
    download,
    share: setShareItem,
    versions: setVersionsItem,
    rename: setRenameItem,
    move: setMoveItem,
    trash: setTrashItem,
  };

  const dialogs = (
    <>
      <PreviewModal
        item={previewItem}
        files={files}
        onClose={() => setPreviewItem(null)}
        onNavigate={setPreviewItem}
        getLinks={getLinks}
        onDownload={download}
      />
      <ShareDialog item={shareItem} onClose={() => setShareItem(null)} />
      <VersionDrawer item={versionsItem} permission={versionsItem && permissionFor(versionsItem)} onClose={() => setVersionsItem(null)} />
      <NameDialog
        open={Boolean(renameItem)}
        onOpenChange={(o) => !o && setRenameItem(null)}
        title={`Rename ${renameItem?.type === "folder" ? "folder" : "file"}`}
        initialValue={renameItem?.name ?? ""}
        submitLabel="Rename"
        onSubmit={rename}
      />
      <MoveDialog open={Boolean(moveItem)} onOpenChange={(o) => !o && setMoveItem(null)} item={moveItem} onMove={move} />
      <ConfirmDialog
        open={Boolean(trashItem)}
        onOpenChange={(o) => !o && setTrashItem(null)}
        title={`Move “${trashItem?.name}” to Trash?`}
        description={
          trashItem?.type === "folder"
            ? "The folder and everything inside it will be moved to Trash. You can restore it from there."
            : "You can restore it from the Trash later."
        }
        confirmLabel="Move to Trash"
        onConfirm={trash}
      />
    </>
  );

  return { actions, dialogs, getLinks };
}
