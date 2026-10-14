import { Fragment } from "react";
import { Download, Eye, FolderInput, FolderOpen, History, Pencil, Share2, Trash2 } from "lucide-react";

import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { previewType } from "@/lib/fileTypes";
import { can } from "@/lib/items";

/**
 * The list of actions for one item, depending on what it is and what the
 * current user may do with it. `actions.xxx(item)` are provided by the page.
 */
function getItemActions(item, permission, actions) {
  const list = [];
  if (item.type === "folder") {
    list.push({ key: "open", label: "Open", icon: FolderOpen, run: actions.open });
  } else {
    if (previewType(item)) list.push({ key: "preview", label: "Preview", icon: Eye, run: actions.preview });
    list.push({ key: "download", label: "Download", icon: Download, run: actions.download });
  }
  if (can(permission, "owner") && actions.share) list.push({ key: "share", label: "Share", icon: Share2, run: actions.share });
  if (item.type === "file" && actions.versions) list.push({ key: "versions", label: "Version history", icon: History, run: actions.versions });
  if (can(permission, "edit") && actions.rename) list.push({ key: "rename", label: "Rename", icon: Pencil, run: actions.rename, separator: true });
  if (can(permission, "owner") && actions.move) list.push({ key: "move", label: "Move to…", icon: FolderInput, run: actions.move });
  if (can(permission, "owner") && actions.trash) {
    list.push({ key: "trash", label: "Move to Trash", icon: Trash2, run: actions.trash, destructive: true, separator: true });
  }
  return list;
}

/** Render the actions as menu items, for a right-click menu or a "⋯" dropdown. */
export function ItemMenuItems({ item, permission, actions, kind = "dropdown" }) {
  const Item = kind === "context" ? ContextMenuItem : DropdownMenuItem;
  const Separator = kind === "context" ? ContextMenuSeparator : DropdownMenuSeparator;
  return getItemActions(item, permission, actions).map((action) => (
    <Fragment key={action.key}>
      {action.separator && <Separator />}
      <Item onSelect={() => action.run(item)} variant={action.destructive ? "destructive" : "default"}>
        <action.icon />
        {action.label}
      </Item>
    </Fragment>
  ));
}
