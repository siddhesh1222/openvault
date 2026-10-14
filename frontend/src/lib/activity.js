/**
 * Turn activity-log rows ({action: "file.upload", target_name: "a.pdf", ...})
 * into an icon + a readable sentence for the dashboard and activity pages.
 */
import {
  CalendarClock,
  CalendarX,
  CircleCheck,
  CircleX,
  Download,
  FolderInput,
  FolderPlus,
  History,
  KeyRound,
  Link2,
  Link2Off,
  LogIn,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
  UserMinus,
  UserPlus,
  UserX,
} from "lucide-react";

// tone: "default" | "good" | "bad" (status colours always come with an icon + words)
const ACTIONS = {
  "file.upload": { icon: Upload, verb: "Uploaded" },
  "file.new_version": { icon: History, verb: "Uploaded a new version of" },
  "file.version_restore": { icon: History, verb: "Restored an older version of" },
  "file.rename": { icon: Pencil, verb: "Renamed a file to" },
  "file.move": { icon: FolderInput, verb: "Moved" },
  "file.trash": { icon: Trash2, verb: "Moved to Trash:" },
  "file.restore": { icon: RotateCcw, verb: "Restored from Trash:" },
  "file.delete": { icon: Trash2, verb: "Permanently deleted", tone: "bad" },
  "file.download": { icon: Download, verb: "Downloaded" },
  "folder.create": { icon: FolderPlus, verb: "Created folder" },
  "folder.rename": { icon: Pencil, verb: "Renamed a folder to" },
  "folder.move": { icon: FolderInput, verb: "Moved folder" },
  "folder.trash": { icon: Trash2, verb: "Moved folder to Trash:" },
  "folder.restore": { icon: RotateCcw, verb: "Restored folder" },
  "folder.delete": { icon: Trash2, verb: "Permanently deleted folder", tone: "bad" },
  "trash.empty": { icon: Trash2, verb: "Emptied the Trash", tone: "bad" },
  "share.link_create": { icon: Link2, verb: "Created a share link for" },
  "share.link_delete": { icon: Link2Off, verb: "Deleted the share link for" },
  "share.user_add": { icon: UserPlus, verb: "Shared" },
  "share.user_remove": { icon: UserMinus, verb: "Stopped sharing" },
  "share.download": { icon: Download, verb: "Someone downloaded" },
  "backup.job_create": { icon: CalendarClock, verb: "Created backup schedule" },
  "backup.job_delete": { icon: CalendarX, verb: "Deleted backup schedule" },
  "backup.success": { icon: CircleCheck, verb: "Backup completed:", tone: "good" },
  "backup.failed": { icon: CircleX, verb: "Backup failed:", tone: "bad" },
  "backup.restore": { icon: RotateCcw, verb: "Restored backup" },
  "user.register": { icon: UserPlus, verb: "Created the account" },
  "user.login": { icon: LogIn, verb: "Signed in" },
  "user.password_change": { icon: KeyRound, verb: "Changed the password" },
  "admin.user_update": { icon: ShieldCheck, verb: "Updated user" },
  "admin.user_delete": { icon: UserX, verb: "Deleted user", tone: "bad" },
};

/** {icon, text, details, tone} for one activity row. */
export function describeActivity(entry) {
  const info = ACTIONS[entry.action] ?? { icon: History, verb: entry.action };
  // Account events already name the user, so the target (their email) is not repeated.
  const showTarget = entry.target_name && !entry.action.startsWith("user.");
  return {
    icon: info.icon,
    tone: info.tone ?? "default",
    text: showTarget ? `${info.verb} “${entry.target_name}”` : info.verb,
    details: entry.details,
  };
}

/** Filter chips on the activity pages: value = action prefix on the server. */
export const ACTIVITY_FILTERS = [
  { value: "", label: "All" },
  { value: "file", label: "Files" },
  { value: "folder", label: "Folders" },
  { value: "share", label: "Sharing" },
  { value: "backup", label: "Backups" },
  { value: "user", label: "Account" },
];
