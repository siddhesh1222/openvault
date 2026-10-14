import { HardDrive } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

/** "1.2 GB of 5 GB used" with a progress bar; turns amber/red when nearly full. */
export function StorageBar({ collapsed = false }) {
  const { user } = useAuth();
  if (!user) return null;
  const percent = Math.min(100, (user.used_bytes / user.quota_bytes) * 100);
  const color = percent > 95 ? "bg-destructive" : percent > 80 ? "bg-warning" : "bg-brand-gradient";

  if (collapsed) {
    return (
      <div className="mx-auto h-16 w-1.5 overflow-hidden rounded-full bg-muted" title={`${Math.round(percent)}% of storage used`}>
        <div className={cn("w-full rounded-full transition-all", color)} style={{ height: `${Math.max(percent, 3)}%`, marginTop: `${100 - Math.max(percent, 3)}%` }} />
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-3.5 shadow-xs">
      <div className="mb-2.5 flex items-center gap-2 text-sm font-semibold">
        <HardDrive className="size-4 text-primary" aria-hidden="true" />
        Storage
        <span className="ml-auto text-xs font-medium text-muted-foreground">{Math.round(percent)}%</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Storage used"
      >
        <div className={cn("h-full rounded-full transition-all duration-700", color)} style={{ width: `${Math.max(percent, 1.5)}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {formatBytes(user.used_bytes)} of {formatBytes(user.quota_bytes)} used
      </p>
    </div>
  );
}
