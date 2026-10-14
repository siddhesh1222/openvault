import { Fragment } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

/**
 * "My Files › Documents › College" — every part except the last is a link.
 * `root` is the first crumb (e.g. My Files, or Shared with me for guests).
 */
export function Breadcrumbs({ root, crumbs = [], onCrumb }) {
  const all = [root, ...crumbs.map((c) => ({ label: c.name, to: `/app/files/${c.id}`, id: c.id }))];
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-sm">
        {all.map((crumb, i) => {
          const last = i === all.length - 1;
          return (
            <Fragment key={crumb.to ?? crumb.label}>
              {i > 0 && <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />}
              <li className="min-w-0">
                {last ? (
                  <span className="block truncate text-2xl font-bold tracking-tight sm:text-[1.7rem]" aria-current="page">
                    {crumb.label}
                  </span>
                ) : onCrumb ? (
                  <button onClick={() => onCrumb(crumb)} className="rounded-md px-1.5 py-0.5 font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground">
                    {crumb.label}
                  </button>
                ) : (
                  <Link to={crumb.to} className="block truncate rounded-md px-1.5 py-0.5 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
                    {crumb.label}
                  </Link>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
