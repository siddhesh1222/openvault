import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/** Friendly placeholder for empty lists: big soft icon, title, hint and an optional action. */
export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}
    >
      <div className="relative mb-5">
        <div className="bg-brand-gradient absolute inset-0 rounded-3xl opacity-20 blur-2xl" />
        <div className="relative flex size-20 items-center justify-center rounded-3xl border bg-card shadow-sm">
          <Icon className="size-9 text-primary" strokeWidth={1.6} aria-hidden="true" />
        </div>
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </motion.div>
  );
}
