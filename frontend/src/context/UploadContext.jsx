/**
 * Upload queue shared by the whole app.
 *
 * `uploadFiles(files, folderId)` adds files to the queue. They are sent one
 * at a time; axios reports progress, which the floating UploadPanel shows as
 * a progress bar per file. When a file finishes, the folder listing and the
 * storage bar are refreshed.
 */
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, errorMessage } from "@/lib/api";

const UploadContext = createContext(null);
let nextId = 1;

export function UploadProvider({ children }) {
  const queryClient = useQueryClient();
  const [uploads, setUploads] = useState([]); // [{id, name, size, progress, status, error}]
  const queue = useRef(Promise.resolve()); // promise chain = one upload at a time

  const update = (id, changes) =>
    setUploads((list) => list.map((u) => (u.id === id ? { ...u, ...changes } : u)));

  const uploadOne = useCallback(
    async (item, file, folderId) => {
      const form = new FormData();
      form.append("file", file);
      if (folderId != null) form.append("folder_id", folderId);
      try {
        const { data } = await api.post("/files/upload", form, {
          onUploadProgress: (e) => e.total && update(item.id, { progress: Math.round((e.loaded / e.total) * 100) }),
        });
        update(item.id, { status: "done", progress: 100 });
        if (data.version_count > 1) toast.success(`Saved new version of “${data.name}”`);
      } catch (error) {
        update(item.id, { status: "error", error: errorMessage(error, "Upload failed") });
        toast.error(`Couldn't upload “${file.name}”`, { description: errorMessage(error) });
      }
      queryClient.invalidateQueries({ queryKey: ["folder"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    [queryClient],
  );

  const uploadFiles = useCallback(
    (files, folderId = null) => {
      const items = Array.from(files).map((file) => ({
        id: nextId++,
        name: file.name,
        size: file.size,
        progress: 0,
        status: "queued",
        error: null,
        file,
      }));
      setUploads((list) => [...list, ...items]);
      for (const item of items) {
        queue.current = queue.current.then(() => {
          update(item.id, { status: "uploading" });
          return uploadOne(item, item.file, folderId);
        });
      }
    },
    [uploadOne],
  );

  /** Remove finished/failed uploads from the panel. */
  const clearFinished = useCallback(
    () => setUploads((list) => list.filter((u) => u.status === "uploading" || u.status === "queued")),
    [],
  );

  return (
    <UploadContext.Provider value={{ uploads, uploadFiles, clearFinished }}>{children}</UploadContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUploads() {
  return useContext(UploadContext);
}
