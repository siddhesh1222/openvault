/**
 * Decide how to show a file: which icon, which colours, and whether we can
 * preview it in the browser.
 */
import {
  FileArchive,
  FileChartColumn,
  FileCode,
  FileImage,
  FileMusic,
  FilePlay,
  FileText,
  FileType,
  File as FileIcon,
  Folder,
  Presentation,
} from "lucide-react";

const KINDS = {
  folder: { label: "Folder", icon: Folder, tint: "text-primary bg-primary/10" },
  image: { label: "Image", icon: FileImage, tint: "text-pink-600 bg-pink-500/10 dark:text-pink-400" },
  video: { label: "Video", icon: FilePlay, tint: "text-violet-600 bg-violet-500/10 dark:text-violet-400" },
  audio: { label: "Audio", icon: FileMusic, tint: "text-amber-600 bg-amber-500/10 dark:text-amber-400" },
  pdf: { label: "PDF", icon: FileType, tint: "text-red-600 bg-red-500/10 dark:text-red-400" },
  document: { label: "Document", icon: FileText, tint: "text-blue-600 bg-blue-500/10 dark:text-blue-400" },
  sheet: { label: "Spreadsheet", icon: FileChartColumn, tint: "text-emerald-600 bg-emerald-500/10 dark:text-emerald-400" },
  slides: { label: "Presentation", icon: Presentation, tint: "text-orange-600 bg-orange-500/10 dark:text-orange-400" },
  archive: { label: "Archive", icon: FileArchive, tint: "text-yellow-700 bg-yellow-500/10 dark:text-yellow-400" },
  code: { label: "Code", icon: FileCode, tint: "text-cyan-600 bg-cyan-500/10 dark:text-cyan-400" },
  text: { label: "Text", icon: FileText, tint: "text-slate-600 bg-slate-500/10 dark:text-slate-300" },
  other: { label: "File", icon: FileIcon, tint: "text-muted-foreground bg-muted" },
};

const CODE_EXT = /\.(js|jsx|ts|tsx|py|java|c|cpp|h|cs|go|rs|rb|php|html|css|scss|json|xml|yml|yaml|sh|sql)$/i;

/** Work out the kind of a file from its MIME type and name. */
export function fileKind(item) {
  if (item.type === "folder") return "folder";
  const mime = item.mime_type || "";
  const name = item.name || "";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  if (/\.(zip|rar|7z|tar|gz|bz2)$/i.test(name)) return "archive";
  if (/\.(xlsx?|csv|ods)$/i.test(name)) return "sheet";
  if (/\.(pptx?|odp|key)$/i.test(name)) return "slides";
  if (/\.(docx?|odt|rtf)$/i.test(name)) return "document";
  if (CODE_EXT.test(name)) return "code";
  if (mime.startsWith("text/")) return "text";
  return "other";
}

export function kindInfo(kind) {
  return KINDS[kind] ?? KINDS.other;
}

/** Which kind of preview the PreviewModal can show (or null for "download only"). */
export function previewType(item) {
  const kind = fileKind(item);
  if (kind === "image" && item.mime_type !== "image/svg+xml") return "image";
  if (kind === "video") return "video";
  if (kind === "audio") return "audio";
  if (kind === "pdf") return "pdf";
  if (kind === "text" || kind === "code" || item.mime_type === "application/json") return "text";
  return null;
}
