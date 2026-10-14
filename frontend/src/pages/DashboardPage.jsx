import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowRight, ChartColumn, FileText, FolderClosed, HardDrive, Inbox, Users } from "lucide-react";

import { ActivityList } from "@/components/ActivityList";
import { ChartCard, DataTable } from "@/components/charts/ChartCard";
import { StorageByTypeChart } from "@/components/charts/StorageByTypeChart";
import { UploadsChart } from "@/components/charts/UploadsChart";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { formatBytes, shortDay } from "@/lib/format";
import { cn } from "@/lib/utils";

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: stats } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get("/dashboard").then((r) => r.data),
  });
  const { data: activity } = useQuery({
    queryKey: ["activity", "recent"],
    queryFn: () => api.get("/activity", { params: { limit: 7 } }).then((r) => r.data),
  });

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user.name.split(" ")[0]}`}
        description="Here's what's happening in your vault."
        actions={
          <Button variant="outline" asChild>
            <Link to="/app/files">
              Open My Files <ArrowRight />
            </Link>
          </Button>
        }
      />

      {/* ---------- KPI row ---------- */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StorageTile stats={stats} />
        <StatTile icon={FileText} label="Files" value={stats?.file_count} hint={stats && `${formatBytes(stats.trash_bytes)} in Trash`} />
        <StatTile icon={FolderClosed} label="Folders" value={stats?.folder_count} hint={stats && `${formatBytes(stats.backup_bytes)} used by backups`} />
        <StatTile icon={Users} label="Shared items" value={stats?.shared_count} hint={stats && `${stats.shared_with_me_count} shared with you`} />
      </div>

      {/* ---------- Charts ---------- */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Storage by file type"
          description="Current versions of files not in the Trash"
          empty={
            !stats ? <Skeleton className="h-48 rounded-xl" /> : stats.by_kind.length === 0 ? <ChartEmpty text="Upload files to see the breakdown." /> : null
          }
          table={
            stats && (
              <DataTable
                columns={[
                  { key: "label", label: "Type" },
                  { key: "count", label: "Files", align: "right" },
                  { key: "bytes", label: "Size", align: "right", format: formatBytes },
                ]}
                rows={stats.by_kind}
              />
            )
          }
        >
          {stats && <StorageByTypeChart data={stats.by_kind} />}
        </ChartCard>

        <ChartCard
          title="Uploads"
          description="New files and new versions, last 14 days"
          empty={!stats ? <Skeleton className="h-56 rounded-xl" /> : null}
          table={
            stats && (
              <DataTable
                columns={[
                  { key: "date", label: "Day", format: shortDay },
                  { key: "count", label: "Uploads", align: "right" },
                  { key: "bytes", label: "Size", align: "right", format: formatBytes },
                ]}
                rows={[...stats.uploads_per_day].reverse()}
              />
            )
          }
        >
          {stats && <UploadsChart data={stats.uploads_per_day} />}
        </ChartCard>
      </div>

      {/* ---------- Recent activity ---------- */}
      <section className="mt-6 rounded-2xl border bg-card p-5 shadow-xs">
        <header className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Recent activity</h2>
            <p className="text-sm text-muted-foreground">Everything you did recently, newest first</p>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/app/activity">
              View all <ArrowRight />
            </Link>
          </Button>
        </header>
        {!activity ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 rounded-xl" />
            ))}
          </div>
        ) : activity.items.length === 0 ? (
          <ChartEmpty text="No activity yet." icon={Inbox} />
        ) : (
          <ActivityList items={activity.items} compact />
        )}
      </section>
    </>
  );
}

function TileShell({ children, index = 0, className }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn("rounded-2xl border bg-card p-4 shadow-xs sm:p-5", className)}
    >
      {children}
    </motion.div>
  );
}

/** label · value · hint  (the stat-tile pattern) */
function StatTile({ icon: Icon, label, value, hint }) {
  return (
    <TileShell>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-4.5" aria-hidden="true" />
        </span>
      </div>
      {value === undefined ? (
        <Skeleton className="mt-2 h-8 w-16" />
      ) : (
        <div className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{value.toLocaleString()}</div>
      )}
      <p className="mt-1 min-h-4 text-xs text-muted-foreground">{hint}</p>
    </TileShell>
  );
}

/** Storage used, with a meter against the quota (the dashboard's hero card). */
function StorageTile({ stats }) {
  const percent = stats ? Math.min(100, (stats.used_bytes / stats.quota_bytes) * 100) : 0;
  const tone = percent > 95 ? "bg-destructive" : percent > 80 ? "bg-warning" : "bg-brand-gradient";
  return (
    <TileShell className="relative overflow-hidden">
      <div className="bg-brand-gradient absolute -top-10 -right-10 size-32 rounded-full opacity-10 blur-2xl" aria-hidden="true" />
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Storage used</span>
        <span className="bg-brand-gradient flex size-9 items-center justify-center rounded-xl text-white shadow-md shadow-primary/25">
          <HardDrive className="size-4.5" aria-hidden="true" />
        </span>
      </div>
      {stats ? (
        <>
          <div className="mt-1 text-3xl font-bold tracking-tight">{formatBytes(stats.used_bytes)}</div>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-primary/12"
            role="progressbar"
            aria-valuenow={Math.round(percent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Storage used"
          >
            <div className={cn("h-full rounded-full transition-all duration-700", tone)} style={{ width: `${Math.max(percent, 1.5)}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {Math.round(percent)}% of {formatBytes(stats.quota_bytes)}
          </p>
        </>
      ) : (
        <Skeleton className="mt-2 h-14 w-full" />
      )}
    </TileShell>
  );
}

function ChartEmpty({ text, icon: Icon = ChartColumn }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground">
      <Icon className="size-6" aria-hidden="true" />
      {text}
    </div>
  );
}
