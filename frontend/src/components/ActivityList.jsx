import { motion } from "framer-motion";

import { describeActivity } from "@/lib/activity";
import { formatDateTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const TONES = {
  default: "bg-primary/10 text-primary",
  good: "bg-success/12 text-success",
  bad: "bg-destructive/10 text-destructive",
};

/**
 * A feed of activity-log entries. `showUser` adds who did it (admin view).
 * `compact` is used in the dashboard card.
 */
export function ActivityList({ items, showUser = false, compact = false }) {
  return (
    <ol className="space-y-1">
      {items.map((entry, i) => {
        const { icon: Icon, text, details, tone } = describeActivity(entry);
        return (
          <motion.li
            key={entry.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.02, 0.2) }}
            className={cn("flex items-start gap-3 rounded-xl px-2 transition-colors hover:bg-muted/50", compact ? "py-2" : "py-2.5")}
          >
            <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", TONES[tone])}>
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                {showUser && <span className="font-semibold">{entry.user_name ?? "Deleted user"} · </span>}
                <span className="break-words">{text}</span>
              </p>
              {details && !compact && <p className="truncate text-xs text-muted-foreground">{details}</p>}
            </div>
            <time
              dateTime={entry.created_at}
              title={formatDateTime(entry.created_at)}
              className="shrink-0 pt-0.5 text-xs whitespace-nowrap text-muted-foreground"
            >
              {timeAgo(entry.created_at)}
            </time>
          </motion.li>
        );
      })}
    </ol>
  );
}
