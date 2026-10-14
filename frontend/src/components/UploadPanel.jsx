import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, CircleAlert, CircleCheck, CloudUpload, LoaderCircle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useUploads } from "@/context/UploadContext";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Floating card (bottom-right) listing uploads with a progress bar each. */
export function UploadPanel() {
  const { uploads, clearFinished } = useUploads();
  const [minimized, setMinimized] = useState(false);

  const active = uploads.filter((u) => u.status === "uploading" || u.status === "queued").length;
  const failed = uploads.filter((u) => u.status === "error").length;
  const title = active
    ? `Uploading ${active} file${active === 1 ? "" : "s"}…`
    : failed
      ? `${failed} upload${failed === 1 ? "" : "s"} failed`
      : "Uploads complete";

  return (
    <AnimatePresence>
      {uploads.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          className="fixed right-4 bottom-4 z-40 w-[calc(100%-2rem)] max-w-sm overflow-hidden rounded-2xl border bg-popover shadow-2xl shadow-black/10 sm:right-6 sm:bottom-6"
          aria-label="Uploads"
        >
          <header className="flex items-center gap-3 border-b px-4 py-3">
            <span className="bg-brand-gradient flex size-8 items-center justify-center rounded-lg text-white">
              {active ? <LoaderCircle className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
            </span>
            <h2 className="flex-1 text-sm font-semibold" aria-live="polite">{title}</h2>
            <Button variant="ghost" size="icon-sm" onClick={() => setMinimized(!minimized)} aria-label={minimized ? "Expand uploads" : "Minimize uploads"}>
              <ChevronDown className={cn("transition-transform", minimized && "rotate-180")} />
            </Button>
            {!active && (
              <Button variant="ghost" size="icon-sm" onClick={clearFinished} aria-label="Close uploads">
                <X />
              </Button>
            )}
          </header>
          <AnimatePresence initial={false}>
            {!minimized && (
              <motion.ul
                initial={{ height: 0 }}
                animate={{ height: "auto" }}
                exit={{ height: 0 }}
                className="max-h-72 overflow-y-auto"
              >
                {uploads.map((u) => (
                  <li key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate font-medium">{u.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {u.status === "error" ? "Failed" : u.status === "queued" ? "Waiting" : u.status === "done" ? formatBytes(u.size) : `${u.progress}%`}
                        </span>
                      </div>
                      {u.status === "error" ? (
                        <p className="mt-0.5 truncate text-xs text-destructive">{u.error}</p>
                      ) : (
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                          <motion.div
                            className={cn("h-full rounded-full", u.status === "done" ? "bg-success" : "bg-brand-gradient")}
                            animate={{ width: `${u.progress}%` }}
                            transition={{ ease: "easeOut" }}
                          />
                        </div>
                      )}
                    </div>
                    {u.status === "done" && <CircleCheck className="size-4 shrink-0 text-success" aria-label="Done" />}
                    {u.status === "error" && <CircleAlert className="size-4 shrink-0 text-destructive" aria-label="Failed" />}
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
