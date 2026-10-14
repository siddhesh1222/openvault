import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDropzone } from "react-dropzone";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownUp, CloudUpload, FolderPlus, FolderX, LayoutGrid, List, Upload } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/EmptyState";
import { Breadcrumbs } from "@/components/files/Breadcrumbs";
import { FileGrid, FileGridSkeleton } from "@/components/files/FileGrid";
import { FileList, FileListSkeleton } from "@/components/files/FileList";
import { NameDialog } from "@/components/files/NameDialog";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUploads } from "@/context/UploadContext";
import { useItemActions } from "@/hooks/useItemActions";
import { api, errorMessage } from "@/lib/api";
import { can, sortItems, toItems } from "@/lib/items";
import { cn } from "@/lib/utils";

const VIEW_KEY = "ov_view";

export default function FilesPage() {
  const { folderId } = useParams();
  const currentId = folderId ? Number(folderId) : null;
  const queryClient = useQueryClient();
  const { uploadFiles } = useUploads();

  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || "grid");
  const [sort, setSort] = useState({ key: "name", dir: "asc" });
  const [newFolderOpen, setNewFolderOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["folder", currentId],
    queryFn: () => api.get("/folders/contents", { params: { folder_id: currentId ?? undefined } }).then((r) => r.data),
  });

  const permission = data?.permission ?? "view";
  const canEdit = can(permission, "edit");
  const items = useMemo(() => sortItems(toItems(data?.folders, data?.files), sort), [data, sort]);
  const files = items.filter((i) => i.type === "file");
  const { actions, dialogs } = useItemActions({ files, permissionFor: () => permission });

  // Drag & drop anywhere on the page. `noClick` so clicking cards still works.
  const { getRootProps, getInputProps, isDragActive, open: openFilePicker } = useDropzone({
    onDrop: (accepted) => accepted.length && uploadFiles(accepted, currentId),
    noClick: true,
    noKeyboard: true,
    disabled: !canEdit,
  });

  function changeView(value) {
    localStorage.setItem(VIEW_KEY, value);
    setView(value);
  }

  function toggleSort(key) {
    setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));
  }

  async function createFolder(name) {
    try {
      await api.post("/folders", { name, parent_id: currentId });
      toast.success(`Folder “${name}” created`);
      queryClient.invalidateQueries({ queryKey: ["folder", currentId] });
    } catch (err) {
      toast.error(errorMessage(err));
      throw err;
    }
  }

  if (error) {
    return (
      <EmptyState
        icon={FolderX}
        title="Folder not found"
        description="It may have been moved to the Trash, or it isn't shared with you any more."
        action={
          <Button asChild>
            <Link to="/app/files">Back to My Files</Link>
          </Button>
        }
      />
    );
  }

  const root = permission === "owner" ? { label: "My Files", to: "/app/files" } : { label: "Shared with me", to: "/app/shared" };

  return (
    <div {...getRootProps()} className="relative min-h-[70svh] outline-none">
      <input {...getInputProps()} />

      <PageHeader
        actions={
          <>
            {canEdit && (
              <>
                <Button variant="outline" onClick={() => setNewFolderOpen(true)}>
                  <FolderPlus /> <span className="hidden sm:inline">New folder</span>
                </Button>
                <Button variant="gradient" onClick={openFilePicker}>
                  <Upload /> Upload
                </Button>
              </>
            )}
            <div className="flex items-center rounded-lg border bg-card p-0.5" role="group" aria-label="View">
              <ViewButton active={view === "grid"} onClick={() => changeView("grid")} label="Grid view" icon={LayoutGrid} />
              <ViewButton active={view === "list"} onClick={() => changeView("list")} label="List view" icon={List} />
            </div>
            {view === "grid" && <SortMenu sort={sort} setSort={setSort} />}
          </>
        }
      >
        <Breadcrumbs root={root} crumbs={data?.breadcrumbs ?? []} />
        <div className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
          {data ? `${data.folders.length} folder${data.folders.length === 1 ? "" : "s"}, ${data.files.length} file${data.files.length === 1 ? "" : "s"}` : " "}
          {permission !== "owner" && data && (
            <Badge variant="secondary" className="capitalize">
              Can {permission}
            </Badge>
          )}
        </div>
      </PageHeader>

      {isLoading ? (
        view === "grid" ? <FileGridSkeleton /> : <FileListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={CloudUpload}
          title={currentId ? "This folder is empty" : "Your vault is empty"}
          description={canEdit ? "Drag and drop files anywhere on this page, or use the Upload button." : "Nothing has been added here yet."}
          action={
            canEdit && (
              <div className="flex gap-2">
                <Button variant="gradient" onClick={openFilePicker}>
                  <Upload /> Upload files
                </Button>
                <Button variant="outline" onClick={() => setNewFolderOpen(true)}>
                  <FolderPlus /> New folder
                </Button>
              </div>
            )
          }
          className="rounded-3xl border-2 border-dashed py-20"
        />
      ) : view === "grid" ? (
        <FileGrid items={items} permissionFor={() => permission} actions={actions} onOpen={actions.open} />
      ) : (
        <FileList items={items} sort={sort} onSort={toggleSort} permissionFor={() => permission} actions={actions} onOpen={actions.open} />
      )}

      <DropOverlay active={isDragActive} folderName={data?.folder?.name ?? "My Files"} />

      <NameDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        title="New folder"
        description={`Create a folder in “${data?.folder?.name ?? "My Files"}”.`}
        initialValue=""
        submitLabel="Create"
        onSubmit={createFolder}
      />
      {dialogs}
    </div>
  );
}

function ViewButton({ active, onClick, label, icon: Icon }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClick}
          aria-label={label}
          aria-pressed={active}
          className={cn("text-muted-foreground", active && "bg-accent text-accent-foreground")}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function SortMenu({ sort, setSort }) {
  const value = `${sort.key}:${sort.dir}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Sort">
          <ArrowDownUp />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Sort by</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(v) => {
            const [key, dir] = v.split(":");
            setSort({ key, dir });
          }}
        >
          <DropdownMenuRadioItem value="name:asc">Name (A → Z)</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="name:desc">Name (Z → A)</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="updated:desc">Newest first</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="updated:asc">Oldest first</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="size:desc">Largest first</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Highlighted drop zone shown while files are dragged over the page. */
function DropOverlay({ active, folderName }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-primary/10 p-6 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.92 }}
            animate={{ scale: 1 }}
            className="flex size-full max-h-[34rem] max-w-3xl flex-col items-center justify-center rounded-3xl border-[3px] border-dashed border-primary bg-background/90 text-center shadow-2xl"
          >
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
              className="bg-brand-gradient mb-6 flex size-20 items-center justify-center rounded-3xl text-white shadow-xl shadow-primary/30"
            >
              <CloudUpload className="size-10" />
            </motion.div>
            <p className="text-2xl font-bold">Drop to upload</p>
            <p className="mt-2 text-muted-foreground">
              Files will be added to <span className="font-semibold text-foreground">{folderName}</span>
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
