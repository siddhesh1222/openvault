import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { History, LoaderCircle } from "lucide-react";

import { ActivityList } from "@/components/ActivityList";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { ACTIVITY_FILTERS } from "@/lib/activity";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

/**
 * Activity log with filter chips and "Load more" paging.
 * `endpoint` is "/activity" (your own) or "/admin/activity" (everyone, admin only).
 */
export function ActivityFeed({ endpoint, showUser = false, filters = ACTIVITY_FILTERS }) {
  const [category, setCategory] = useState("");

  // useInfiniteQuery keeps every loaded page, so "Load more" appends the next one.
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["activity", endpoint, category],
    queryFn: ({ pageParam }) =>
      api.get(endpoint, { params: { category: category || undefined, limit: PAGE_SIZE, offset: pageParam } }).then((r) => r.data),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });
  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  return (
    <div className="rounded-2xl border bg-card shadow-xs">
      {/* Filters: one row above the content */}
      <div className="flex flex-wrap items-center gap-2 border-b p-3" role="group" aria-label="Filter activity">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setCategory(f.value)}
            aria-pressed={category === f.value}
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              category === f.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            {f.label}
          </button>
        ))}
        {data && <span className="ml-auto text-xs text-muted-foreground">{total.toLocaleString()} event{total === 1 ? "" : "s"}</span>}
      </div>

      <div className="p-3">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12 rounded-xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={History} title="No activity here" description="Actions like uploads, shares and backups show up in this log." className="py-10" />
        ) : (
          <>
            <ActivityList items={items} showUser={showUser} />
            {hasNextPage && (
              <div className="pt-3 text-center">
                <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                  {isFetchingNextPage && <LoaderCircle className="animate-spin" />}
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
