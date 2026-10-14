import { NavLink } from "react-router-dom";
import { DatabaseBackup, FolderClosed, PanelLeftClose, PanelLeftOpen, Settings, Trash2, Users } from "lucide-react";

import { Logo } from "@/components/Logo";
import { StorageBar } from "@/components/StorageBar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/app/files", label: "My Files", icon: FolderClosed },
  { to: "/app/shared", label: "Shared with me", icon: Users },
  { to: "/app/backups", label: "Backups", icon: DatabaseBackup },
  { to: "/app/trash", label: "Trash", icon: Trash2 },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

/**
 * Left navigation. On desktop it can be collapsed to icons only;
 * on mobile the same content is shown inside a slide-out sheet (see AppLayout).
 */
export function SidebarContent({ collapsed = false, onToggle, onNavigate }) {
  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className={cn("flex h-12 items-center", collapsed ? "justify-center" : "justify-between pl-2")}>
        <Logo to="/app/files" collapsed={collapsed} />
        {onToggle && !collapsed && (
          <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label="Collapse sidebar" className="text-muted-foreground">
            <PanelLeftClose />
          </Button>
        )}
      </div>

      <nav className="flex flex-col gap-1" aria-label="Sections">
        {NAV_ITEMS.map((item) => (
          <SidebarLink key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <StorageBar collapsed={collapsed} />
        {onToggle && collapsed && (
          <Button variant="ghost" size="icon" onClick={onToggle} aria-label="Expand sidebar" className="mx-auto text-muted-foreground">
            <PanelLeftOpen />
          </Button>
        )}
      </div>
    </div>
  );
}

function SidebarLink({ item, collapsed, onNavigate }) {
  const link = (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
          collapsed && "justify-center px-0",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="bg-brand-gradient absolute top-2 bottom-2 left-0 w-[3px] rounded-full" aria-hidden="true" />}
          <item.icon className={cn("size-[18px] shrink-0", isActive && "text-primary")} aria-hidden="true" />
          {!collapsed && <span className="truncate">{item.label}</span>}
          {collapsed && <span className="sr-only">{item.label}</span>}
        </>
      )}
    </NavLink>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}
