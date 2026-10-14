import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { FileIcon } from "@/components/FileIcon";
import { api } from "@/lib/api";
import { fileKind, kindInfo, previewType } from "@/lib/fileTypes";
import { cn } from "@/lib/utils";

/**
 * Big preview area of a grid card. Images show a real thumbnail (loaded
 * through a short-lived link); everything else shows a large type icon.
 */
export function Thumbnail({ item, getLinks }) {
  const isImage = item.type === "file" && previewType(item) === "image";
  const [failed, setFailed] = useState(false);
  const { data: links } = useQuery({
    queryKey: ["links", item.id, item.updated_at],
    queryFn: () => (getLinks ? getLinks(item) : api.post(`/files/${item.id}/links`).then((r) => r.data)),
    enabled: isImage,
    staleTime: 4 * 60_000, // links are valid for 5 minutes
  });

  const tint = kindInfo(fileKind(item)).tint;
  const extension = item.name.includes(".") ? item.name.split(".").pop().slice(0, 5) : "";
  return (
    <div className={cn("relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl", tint.split(" ").filter((c) => c.startsWith("bg-")).join(" "))}>
      {isImage && links && !failed ? (
        <img
          src={links.preview_url}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="flex flex-col items-center gap-1.5 transition-transform duration-300 group-hover:scale-110">
          <FileIcon item={item} size="lg" className="bg-transparent [&_svg]:size-9" />
          {extension && <span className="text-[10px] font-bold tracking-widest uppercase opacity-60">{extension}</span>}
        </div>
      )}
    </div>
  );
}
