import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  CalendarClock,
  CircleCheck,
  CircleX,
  DatabaseBackup,
  Download,
  EllipsisVertical,
  FolderClosed,
  HardDrive,
  LoaderCircle,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { JobDialog } from "@/components/backups/JobDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api, downloadUrl, errorMessage } from "@/lib/api";
import { formatBytes, formatDateTime, timeAgo } from "@/lib/format";
import { describeSchedule } from "@/lib/schedule";
import { cn } from "@/lib/utils";

export default function BackupsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState({ open: false, job: null });
  const [deleteJob, setDeleteJob] = useState(null);
  const [deleteRun, setDeleteRun] = useState(null);

  const jobsQuery = useQuery({ queryKey: ["backups", "jobs"], queryFn: () => api.get("/backups/jobs").then((r) => r.data) });
  const runsQuery = useQuery({
    queryKey: ["backups", "runs"],
    queryFn: () => api.get("/backups/runs").then((r) => r.data),
    // While a backup is running, ask the server again every 2 seconds.
    refetchInterval: (query) => (query.state.data?.some((r) => r.status === "running") ? 2000 : false),
  });
  const jobs = jobsQuery.data ?? [];
  const runs = runsQuery.data ?? [];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["backups"] });
    queryClient.invalidateQueries({ queryKey: ["me"] });
  };
  const onError = (err) => toast.error(errorMessage(err));

  const saveJob = async (body) => {
    try {
      if (dialog.job) await api.patch(`/backups/jobs/${dialog.job.id}`, body);
      else await api.post("/backups/jobs", body);
      toast.success(dialog.job ? "Schedule updated" : "Backup schedule created");
      refresh();
    } catch (err) {
      onError(err);
      throw err;
    }
  };

  const toggleJob = useMutation({
    mutationFn: (job) => api.patch(`/backups/jobs/${job.id}`, { enabled: !job.enabled }),
    onSuccess: ({ data }) => {
      toast.success(data.enabled ? `“${data.name}” resumed` : `“${data.name}” paused`);
      refresh();
    },
    onError,
  });

  const runNow = useMutation({
    mutationFn: (job) => api.post(`/backups/jobs/${job.id}/run`),
    onSuccess: (_res, job) => {
      toast.info(`Backing up “${job.name}”…`, { description: "It will appear in the history when done." });
      refresh();
    },
    onError,
  });

  const restore = useMutation({
    mutationFn: (run) => api.post(`/backups/runs/${run.id}/restore`),
    onSuccess: ({ data: folder }) => {
      toast.success("Backup restored", {
        description: `Files were restored into “${folder.name}”.`,
        action: { label: "Open folder", onClick: () => navigate(`/app/files/${folder.id}`) },
      });
      queryClient.invalidateQueries({ queryKey: ["folder"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError,
  });

  async function removeThing(path, message) {
    try {
      await api.delete(path);
      toast.success(message);
      refresh();
    } catch (err) {
      onError(err);
    }
  }

  async function download(run) {
    try {
      const { data } = await api.post(`/backups/runs/${run.id}/links`);
      downloadUrl(data.download_url);
    } catch (err) {
      onError(err);
    }
  }

  const lastSuccess = runs.find((r) => r.status === "success");
  const backupBytes = runs.filter((r) => r.status === "success").reduce((sum, r) => sum + r.size, 0);
  const loading = jobsQuery.isLoading || runsQuery.isLoading;

  return (
    <>
      <PageHeader
        title="Backups"
        description="Automatic, encrypted snapshots of your folders. Times are shown in your local timezone."
        actions={
          <Button variant="gradient" onClick={() => setDialog({ open: true, job: null })}>
            <Plus /> New schedule
          </Button>
        }
      />

      {/* Summary cards */}
      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <StatCard icon={CalendarClock} label="Active schedules" value={loading ? null : `${jobs.filter((j) => j.enabled).length} of ${jobs.length}`} />
        <StatCard
          icon={CircleCheck}
          label="Last successful backup"
          value={loading ? null : lastSuccess ? timeAgo(lastSuccess.finished_at) : "Never"}
        />
        <StatCard icon={HardDrive} label="Space used by backups" value={loading ? null : formatBytes(backupBytes)} />
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={DatabaseBackup}
          title="No backups scheduled"
          description="Create a schedule to back up a folder (or everything) every day or week."
          action={
            <Button variant="gradient" onClick={() => setDialog({ open: true, job: null })}>
              <Plus /> Create your first schedule
            </Button>
          }
          className="rounded-3xl border-2 border-dashed"
        />
      ) : (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* ---------------- Schedules ---------------- */}
          <section aria-labelledby="schedules-heading">
            <h2 id="schedules-heading" className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Schedules
            </h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
              {jobs.map((job, i) => (
                <motion.article
                  key={job.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={cn("rounded-2xl border bg-card p-5 shadow-xs transition-shadow hover:shadow-md", !job.enabled && "opacity-70")}
                >
                  <div className="flex items-start gap-3">
                    <div className="bg-brand-gradient flex size-10 shrink-0 items-center justify-center rounded-xl text-white shadow-md shadow-primary/20">
                      <DatabaseBackup className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold">{job.name}</h3>
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <FolderClosed className="size-3.5" /> {job.folder_name}
                      </p>
                    </div>
                    <Switch
                      checked={job.enabled}
                      onCheckedChange={() => toggleJob.mutate(job)}
                      aria-label={job.enabled ? `Pause ${job.name}` : `Resume ${job.name}`}
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${job.name}`}>
                          <EllipsisVertical />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setDialog({ open: true, job })}>
                          <Pencil /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => setDeleteJob(job)}>
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Schedule</dt>
                      <dd className="font-medium">{describeSchedule(job)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Next run</dt>
                      <dd className="font-medium">{job.next_run_at ? formatDateTime(job.next_run_at) : "Paused"}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      Keeps last {job.retention} · {job.last_status ? <>Last run <StatusBadge status={job.last_status} small /></> : "Never run"}
                    </span>
                    <Button size="sm" variant="outline" onClick={() => runNow.mutate(job)} disabled={job.last_status === "running" || runNow.isPending}>
                      {job.last_status === "running" ? <LoaderCircle className="animate-spin" /> : <Play />}
                      Run now
                    </Button>
                  </div>
                </motion.article>
              ))}
            </div>
          </section>

          {/* ---------------- History timeline ---------------- */}
          <section aria-labelledby="history-heading">
            <h2 id="history-heading" className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              History
            </h2>
            {runs.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                No backups have run yet. Press <span className="font-semibold">Run now</span> to make the first one.
              </div>
            ) : (
              <ol className="relative space-y-3 pl-8">
                <div className="absolute top-4 bottom-4 left-[13px] w-px bg-border" aria-hidden="true" />
                {runs.map((run) => (
                  <motion.li key={run.id} layout initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="relative">
                    <TimelineDot status={run.status} />
                    <div className="rounded-2xl border bg-card p-4 shadow-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{run.job_name}</span>
                        <StatusBadge status={run.status} />
                        <Badge variant="outline" className="capitalize">
                          {run.trigger}
                        </Badge>
                        <span className="ml-auto text-xs text-muted-foreground" title={formatDateTime(run.started_at)}>
                          {timeAgo(run.started_at)}
                        </span>
                      </div>
                      {run.status === "failed" ? (
                        <p className="mt-2 text-sm text-destructive">{run.error}</p>
                      ) : run.status === "success" ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                          {run.file_count} file{run.file_count === 1 ? "" : "s"} · {formatBytes(run.size)} · took{" "}
                          {Math.max(1, Math.round((new Date(run.finished_at) - new Date(run.started_at)) / 1000))}s
                        </p>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">Collecting and encrypting files…</p>
                      )}
                      {run.status !== "running" && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {run.status === "success" && (
                            <>
                              <Button size="sm" onClick={() => restore.mutate(run)} disabled={restore.isPending}>
                                {restore.isPending && restore.variables?.id === run.id ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}
                                Restore
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => download(run)}>
                                <Download /> Download .zip
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setDeleteRun(run)}>
                            <Trash2 /> Delete
                          </Button>
                        </div>
                      )}
                    </div>
                  </motion.li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}

      <JobDialog open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} job={dialog.job} onSave={saveJob} />
      <ConfirmDialog
        open={Boolean(deleteJob)}
        onOpenChange={(o) => !o && setDeleteJob(null)}
        title={`Delete “${deleteJob?.name}”?`}
        description="The schedule and ALL of its stored backups will be deleted. Your files are not affected."
        confirmLabel="Delete schedule"
        onConfirm={() => removeThing(`/backups/jobs/${deleteJob.id}`, "Schedule deleted")}
      />
      <ConfirmDialog
        open={Boolean(deleteRun)}
        onOpenChange={(o) => !o && setDeleteRun(null)}
        title="Delete this backup?"
        description="The backup snapshot will be removed permanently. Your current files are not affected."
        confirmLabel="Delete backup"
        onConfirm={() => removeThing(`/backups/runs/${deleteRun.id}`, "Backup deleted")}
      />
    </>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-xs">
      <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        {value === null ? <Skeleton className="mt-1.5 h-5 w-20" /> : <div className="truncate text-lg font-bold">{value}</div>}
      </div>
    </div>
  );
}

const STATUS = {
  success: { label: "Success", icon: CircleCheck, className: "bg-success/12 text-success border-success/25" },
  failed: { label: "Failed", icon: CircleX, className: "bg-destructive/10 text-destructive border-destructive/25" },
  running: { label: "Running", icon: LoaderCircle, className: "bg-primary/10 text-primary border-primary/25" },
};

function StatusBadge({ status, small = false }) {
  const s = STATUS[status] ?? STATUS.failed;
  return (
    <Badge variant="outline" className={cn("gap-1", s.className, small && "px-1.5 py-0 text-[11px]")}>
      <s.icon className={cn("size-3", status === "running" && "animate-spin")} aria-hidden="true" />
      {s.label}
    </Badge>
  );
}

function TimelineDot({ status }) {
  const s = STATUS[status] ?? STATUS.failed;
  return (
    <span
      className={cn(
        "absolute top-4 -left-8 flex size-[27px] items-center justify-center rounded-full border-4 border-background",
        status === "success" && "bg-success text-white",
        status === "failed" && "bg-destructive text-white",
        status === "running" && "bg-brand-gradient text-white",
      )}
      aria-hidden="true"
    >
      <s.icon className={cn("size-3", status === "running" && "animate-spin")} />
    </span>
  );
}
