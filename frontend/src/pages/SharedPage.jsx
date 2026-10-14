import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";

import { EmptyState } from "@/components/EmptyState";
import { FileList, FileListSkeleton } from "@/components/files/FileList";
import { PageHeader } from "@/components/PageHeader";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useItemActions } from "@/hooks/useItemActions";
import { api } from "@/lib/api";
import { initials } from "@/lib/format";
import { sortItems } from "@/lib/items";

/** Files and folders that other people shared with the current user. */
export default function SharedPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["shared-with-me"],
    queryFn: () => api.get("/shares/with-me").then((r) => r.data.items),
  });

  // Turn each share into an "item" that remembers who shared it and how.
  const items = useMemo(
    () =>
      sortItems((data ?? []).map((share) => {
        const base = share.folder ? { ...share.folder, type: "folder" } : { ...share.file, type: "file" };
        return { ...base, shared: false, owner: share.owner, permission: share.permission, shared_at: share.shared_at };
      }), { key: "name", dir: "asc" }),
    [data],
  );
  const { actions, dialogs } = useItemActions({
    files: items.filter((i) => i.type === "file"),
    permissionFor: (item) => item.permission,
  });

  return (
    <>
      <PageHeader title="Shared with me" description="Files and folders other people have shared with you." />
      {isLoading ? (
        <FileListSkeleton rows={5} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nothing shared with you yet"
          description="When someone shares a file or folder with your email, it will show up here."
        />
      ) : (
        <FileList
          items={items}
          permissionFor={(item) => item.permission}
          actions={actions}
          onOpen={actions.open}
          extraColumn={{
            label: "Shared by",
            render: (item) => (
              <span className="flex items-center gap-2">
                <Avatar className="size-6">
                  <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">{initials(item.owner.name)}</AvatarFallback>
                </Avatar>
                <span className="truncate">{item.owner.name}</span>
                <Badge variant="secondary" className="ml-1">
                  {item.permission === "edit" ? "Can edit" : "Can view"}
                </Badge>
              </span>
            ),
          }}
        />
      )}
      {dialogs}
    </>
  );
}
