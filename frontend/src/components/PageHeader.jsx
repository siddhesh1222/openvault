import { cn } from "@/lib/utils";

/** Title row at the top of every app page, with optional actions on the right. */
export function PageHeader({ title, description, actions, children, className }) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {children ?? <h1 className="text-2xl font-bold tracking-tight sm:text-[1.7rem]">{title}</h1>}
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
