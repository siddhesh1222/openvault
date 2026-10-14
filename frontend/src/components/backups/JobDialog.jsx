import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { localToUtc, toTimeInput, utcToLocal, WEEKDAYS } from "@/lib/schedule";

/** Create or edit a backup schedule. `job` = null creates a new one. */
export function JobDialog({ open, onOpenChange, job, onSave }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && <JobForm job={job} onSave={onSave} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function JobForm({ job, onSave, onClose }) {
  // Start from the job's schedule converted to local time, or sensible defaults.
  const local = job ? utcToLocal(job) : { hour: 2, minute: 0, weekday: 6 };
  const [form, setForm] = useState({
    name: job?.name ?? "",
    folder: job ? String(job.folder_id ?? "all") : "all",
    frequency: job?.frequency ?? "daily",
    time: toTimeInput(local.hour, local.minute),
    weekday: String(local.weekday ?? 6),
    retention: job?.retention ?? 7,
  });
  const [busy, setBusy] = useState(false);
  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));

  // Folders that can be backed up: everything, or one top-level folder.
  const { data: root } = useQuery({
    queryKey: ["folder", null],
    queryFn: () => api.get("/folders/contents").then((r) => r.data),
  });

  async function handleSubmit(e) {
    e.preventDefault();
    const [hour, minute] = form.time.split(":").map(Number);
    const weekly = form.frequency === "weekly";
    const utc = localToUtc({ hour, minute, weekday: weekly ? Number(form.weekday) : null });
    const body = {
      name: form.name.trim(),
      frequency: form.frequency,
      hour: utc.hour,
      minute: utc.minute,
      weekday: weekly ? utc.weekday : null,
      retention: Number(form.retention),
    };
    if (!job) body.folder_id = form.folder === "all" ? null : Number(form.folder);
    setBusy(true);
    try {
      await onSave(body);
      onClose();
    } catch {
      /* toast shown by caller */
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{job ? "Edit backup schedule" : "New backup schedule"}</DialogTitle>
        <DialogDescription>Backups are encrypted snapshots you can restore with one click.</DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <Label htmlFor="job-name">Name</Label>
        <Input id="job-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Nightly project backup" maxLength={100} autoFocus />
      </div>

      <div className="space-y-2">
        <Label>What to back up</Label>
        <Select value={form.folder} onValueChange={set("folder")} disabled={Boolean(job)}>
          <SelectTrigger className="w-full" aria-label="Folder to back up">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All of My Files</SelectItem>
            {job?.folder_id && <SelectItem value={String(job.folder_id)}>{job.folder_name}</SelectItem>}
            {root?.folders
              .filter((f) => f.id !== job?.folder_id)
              .map((f) => (
                <SelectItem key={f.id} value={String(f.id)}>
                  {f.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        {job && <p className="text-xs text-muted-foreground">The folder can't be changed — create a new schedule instead.</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>How often</Label>
          <Select value={form.frequency} onValueChange={set("frequency")}>
            <SelectTrigger className="w-full" aria-label="Frequency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {form.frequency === "weekly" && (
          <div className="space-y-2">
            <Label>Day</Label>
            <Select value={form.weekday} onValueChange={set("weekday")}>
              <SelectTrigger className="w-full" aria-label="Day of the week">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map((day, i) => (
                  <SelectItem key={day} value={String(i)}>
                    {day}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="job-time">Time</Label>
          <Input id="job-time" type="time" value={form.time} onChange={(e) => set("time")(e.target.value)} required />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="job-retention">Keep the last</Label>
        <div className="flex items-center gap-3">
          <Input
            id="job-retention"
            type="number"
            min={1}
            max={30}
            value={form.retention}
            onChange={(e) => set("retention")(e.target.value)}
            className="w-24"
          />
          <span className="text-sm text-muted-foreground">successful backups (older ones are deleted automatically)</span>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="gradient" disabled={busy || !form.name.trim() || !form.time}>
          {busy && <LoaderCircle className="animate-spin" />}
          {job ? "Save changes" : "Create schedule"}
        </Button>
      </DialogFooter>
    </form>
  );
}
