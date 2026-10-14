import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { SearchX } from "lucide-react";

import { EmptyState } from "@/components/EmptyState";
import { FileList, FileListSkeleton } from "@/components/files/FileList";
import { PageHeader } from "@/components/PageHeader";
import { useItemActions } from "@/hooks/useItemActions";
import { api } from "@/lib/api";
import { toItems } from "@/lib/items";

/** Results for the search box in the top bar (/app/search?q=...). */
export default function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";

  const { data, isLoading } = useQuery({
    queryKey: ["search", q],
    queryFn: () => api.get("/files/search", { params: { q } }).then((r) => r.data),
    enabled: q.length > 0,
  });
  const items = toItems(data?.folders, data?.files);
  const { actions, dialogs } = useItemActions({ files: items.filter((i) => i.type === "file") });

  return (
    <>
      <PageHeader
        title={<>Results for “{q}”</>}
        description={data ? `${items.length} match${items.length === 1 ? "" : "es"} in your files` : "Searching…"}
      />
      {isLoading ? (
        <FileListSkeleton rows={4} />
      ) : items.length === 0 ? (
        <EmptyState icon={SearchX} title="No matches" description="Try a shorter or different search term. Items in the Trash are not searched." />
      ) : (
        <FileList items={items} permissionFor={() => "owner"} actions={actions} onOpen={actions.open} />
      )}
      {dialogs}
    </>
  );
}
