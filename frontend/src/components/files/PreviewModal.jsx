import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Download, LoaderCircle, X } from "lucide-react";

import { FileIcon } from "@/components/FileIcon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatBytes, timeAgo } from "@/lib/format";
import { previewType } from "@/lib/fileTypes";

const MAX_TEXT_BYTES = 1024 * 1024; // don't try to show text files over 1 MB

/**
 * Full-screen-ish viewer for images, PDFs, videos, audio and text.
 * ← / → (or the side buttons) move between the files of the current folder.
 * `getLinks(item)` returns {preview_url, download_url} — it differs between
 * the logged-in app and public share pages.
 */
export function PreviewModal({ item, files = [], onClose, onNavigate, getLinks, onDownload }) {
  const open = Boolean(item);
  const previewable = files.filter((f) => previewType(f));
  const index = item ? previewable.findIndex((f) => f.id === item.id) : -1;
  const prev = index > 0 ? previewable[index - 1] : null;
  const next = index >= 0 && index < previewable.length - 1 ? previewable[index + 1] : null;

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "ArrowLeft" && prev) onNavigate(prev);
      if (e.key === "ArrowRight" && next) onNavigate(next);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, prev, next, onNavigate]);

  const { data: links, isLoading } = useQuery({
    queryKey: ["preview-links", item?.id, item?.updated_at],
    queryFn: () => getLinks(item),
    enabled: open,
    staleTime: 4 * 60_000,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[92svh] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl"
      >
        {item && (
          <>
            <header className="flex items-center gap-3 border-b px-4 py-3">
              <FileIcon item={item} size="sm" />
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-base">{item.name}</DialogTitle>
                <DialogDescription className="text-xs">
                  {formatBytes(item.size)} · Updated {timeAgo(item.updated_at)}
                  {previewable.length > 1 && index >= 0 && ` · ${index + 1} of ${previewable.length}`}
                </DialogDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => onDownload(item)}>
                <Download /> <span className="hidden sm:inline">Download</span>
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close preview">
                <X />
              </Button>
            </header>

            <div className="relative flex min-h-0 flex-1 items-center justify-center bg-muted/40">
              {isLoading || !links ? (
                <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex size-full items-center justify-center"
                  >
                    <PreviewBody item={item} url={links.preview_url} onDownload={() => onDownload(item)} />
                  </motion.div>
                </AnimatePresence>
              )}
              {prev && <NavButton side="left" onClick={() => onNavigate(prev)} label={`Previous: ${prev.name}`} />}
              {next && <NavButton side="right" onClick={() => onNavigate(next)} label={`Next: ${next.name}`} />}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NavButton({ side, onClick, label }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={onClick}
      aria-label={label}
      className={`absolute top-1/2 -translate-y-1/2 rounded-full bg-background/80 shadow-lg backdrop-blur ${side === "left" ? "left-3" : "right-3"}`}
    >
      <Icon />
    </Button>
  );
}

function PreviewBody({ item, url, onDownload }) {
  switch (previewType(item)) {
    case "image":
      return <img src={url} alt={item.name} className="max-h-full max-w-full object-contain p-4" />;
    case "video":
      return <video src={url} controls autoPlay className="max-h-full max-w-full bg-black" />;
    case "audio":
      return (
        <div className="flex flex-col items-center gap-6 p-6">
          <FileIcon item={item} size="lg" className="size-24 rounded-3xl [&_svg]:size-12" />
          <audio src={url} controls autoPlay className="w-80 max-w-full" />
        </div>
      );
    case "pdf":
      return <iframe src={url} title={item.name} className="size-full border-0 bg-white" />;
    case "text":
      return <TextPreview item={item} url={url} />;
    default:
      return <NoPreview item={item} onDownload={onDownload} />;
  }
}

function TextPreview({ item, url }) {
  const [text, setText] = useState(null);
  const tooBig = item.size > MAX_TEXT_BYTES;
  useEffect(() => {
    if (tooBig) return;
    let cancelled = false;
    fetch(url)
      .then((r) => r.text())
      .then((t) => !cancelled && setText(t));
    return () => {
      cancelled = true;
    };
  }, [url, tooBig]);

  if (tooBig) return <p className="text-sm text-muted-foreground">This file is too large to preview. Download it instead.</p>;
  if (text === null) return <LoaderCircle className="size-6 animate-spin text-muted-foreground" />;
  return (
    <pre className="size-full overflow-auto bg-card p-6 font-mono text-[13px] leading-relaxed whitespace-pre-wrap">{text}</pre>
  );
}

function NoPreview({ item, onDownload }) {
  return (
    <div className="flex flex-col items-center gap-4 p-6 text-center">
      <FileIcon item={item} size="lg" />
      <p className="text-sm text-muted-foreground">No preview available for this file type.</p>
      <Button onClick={onDownload}>
        <Download /> Download
      </Button>
    </div>
  );
}
