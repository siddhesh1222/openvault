import { fileKind, kindInfo } from "@/lib/fileTypes";
import { cn } from "@/lib/utils";

/** A coloured, rounded tile with the icon for a file or folder. */
export function FileIcon({ item, size = "md", className }) {
  const { icon: Icon, tint } = kindInfo(fileKind(item));
  const sizes = {
    sm: "size-8 rounded-lg [&_svg]:size-4",
    md: "size-10 rounded-xl [&_svg]:size-5",
    lg: "size-14 rounded-2xl [&_svg]:size-7",
  };
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center", tint, sizes[size], className)}>
      <Icon aria-hidden="true" strokeWidth={1.8} className={item.type === "folder" ? "fill-current/20" : ""} />
    </span>
  );
}
