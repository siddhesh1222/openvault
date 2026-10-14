import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, LoaderCircle, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";

import { FileIcon } from "@/components/FileIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { api, downloadUrl, errorMessage } from "@/lib/api";
import { formatBytes, formatDateTime, timeAgo } from "@/lib/format";
import { can } from "@/lib/items";
import { cn } from "@/lib/utils";

/**
 * Side drawer with every stored version of a file, newest first.
 * Restoring copies an old version as the new current one (nothing is lost).
 */
export function VersionDrawer({ item, permission, onClose }) {
  const queryClient = useQueryClient();
  const fileInput = useRef(null);
  const queryKey = ["versions", item?.id];

  const { data: versions, isLoading } = useQuery({
    queryKey,
    queryFn: () => api.get(`/files/${item.id}/versions`).then((r) => r.data),
    enabled: Boolean(item),
  });

  const afterChange = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["folder"] });
    queryClient.invalidateQueries({ queryKey: ["me"] });
  };

  const restore = useMutation({
    mutationFn: (version) => api.post(`/files/${item.id}/versions/${version.id}/restore`),
    onSuccess: (_res, version) => {
      toast.success(`Version ${version.version_no} restored`, { description: "It is now the current version." });
      afterChange();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const uploadVersion = useMutation({
    mutationFn: (file) => {
      const form = new FormData();
      form.append("file", file);
      return api.post(`/files/${item.id}/versions`, form);
    },
    onSuccess: () => {
      toast.success("New version uploaded");
      afterChange();
    },
    onError: (err) => toast.error(errorMessage(err, "Upload failed")),
  });

  async function download(version) {
    try {
      const { data } = await api.post(`/files/${item.id}/versions/${version.id}/links`);
      downloadUrl(data.download_url);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const canEdit = can(permission, "edit");

  return (
    <Sheet open={Boolean(item)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        {item && (
          <>
            <SheetHeader className="border-b p-5">
              <div className="flex items-center gap-3 pr-6">
                <FileIcon item={item} />
                <div className="min-w-0">
                  <SheetTitle className="truncate">Version history</SheetTitle>
                  <SheetDescription className="truncate">{item.name}</SheetDescription>
                </div>
              </div>
              {canEdit && (
                <>
                  <input
                    ref={fileInput}
                    type="file"
                    hidden
                    onChange={(e) => {
                      if (e.target.files[0]) uploadVersion.mutate(e.target.files[0]);
                      e.target.value = "";
                    }}
                  />
                  <Button variant="outline" className="mt-4 w-full" onClick={() => fileInput.current.click()} disabled={uploadVersion.isPending}>
                    {uploadVersion.isPending ? <LoaderCircle className="animate-spin" /> : <Upload />}
                    Upload new version
                  </Button>
                </>
              )}
            </SheetHeader>

            <div className="flex-1 overflow-y-auto p-5">
              {isLoading ? (
                <div className="space-y-5">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex gap-4">
                      <Skeleton className="size-3 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-3 w-2/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <ol className="relative space-y-1">
                  {/* the vertical timeline line */}
                  <div className="absolute top-3 bottom-3 left-[7px] w-px bg-border" aria-hidden="true" />
                  {versions?.map((v) => (
                    <li key={v.id} className="group relative flex gap-4 rounded-xl py-3 pr-2">
                      <span
                        className={cn(
                          "relative z-10 mt-1 size-[15px] shrink-0 rounded-full border-[3px] border-background",
                          v.is_current ? "bg-brand-gradient ring-4 ring-primary/15" : "bg-muted-foreground/40",
                        )}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">Version {v.version_no}</span>
                          {v.is_current && <Badge className="bg-primary/10 text-primary hover:bg-primary/10">Current</Badge>}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground" title={formatDateTime(v.created_at)}>
                          {timeAgo(v.created_at)} · {formatBytes(v.size)}
                          {v.created_by_name && ` · ${v.created_by_name}`}
                        </p>
                        <div className="mt-2 flex gap-1.5">
                          <Button variant="outline" size="xs" onClick={() => download(v)}>
                            <Download /> Download
                          </Button>
                          {!v.is_current && canEdit && (
                            <Button size="xs" onClick={() => restore.mutate(v)} disabled={restore.isPending}>
                              {restore.isPending && restore.variables?.id === v.id ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}
                              Restore
                            </Button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <p className="border-t px-5 py-3 text-xs text-muted-foreground">
              Restoring copies the old version as a new one, so you never lose history.
            </p>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
