import { useDeferredValue, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { DatabaseBackup, EllipsisVertical, FileText, Gauge, HardDrive, LoaderCircle, Search, ShieldCheck, ShieldOff, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { ActivityFeed } from "@/components/ActivityFeed";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PageHeader } from "@/components/PageHeader";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/context/AuthContext";
import { api, errorMessage } from "@/lib/api";
import { ACTIVITY_FILTERS } from "@/lib/activity";
import { formatBytes, initials, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const MB = 1024 * 1024;
const ADMIN_FILTERS = [...ACTIVITY_FILTERS, { value: "admin", label: "Admin" }];

/** Admin panel: server totals, user management and the system-wide audit log. */
export default function AdminPage() {
  const { data: stats } = useQuery({ queryKey: ["admin", "stats"], queryFn: () => api.get("/admin/stats").then((r) => r.data) });

  return (
    <>
      <PageHeader title="Admin" description="Manage users, storage quotas and see everything happening on this server." />
      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi icon={Users} label="Users" value={stats?.user_count} hint={stats && `${stats.active_user_count} active · ${stats.admin_count} admin${stats.admin_count === 1 ? "" : "s"}`} />
        <Kpi icon={HardDrive} label="Storage used" value={stats && formatBytes(stats.total_used_bytes)} hint={stats && `of ${formatBytes(stats.total_quota_bytes)} allocated`} />
        <Kpi icon={FileText} label="Files" value={stats?.file_count.toLocaleString()} hint="across all users" />
        <Kpi icon={DatabaseBackup} label="Backups" value={stats?.backup_count.toLocaleString()} hint={stats && `${stats.share_link_count} share links`} />
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">
            <Users /> Users
          </TabsTrigger>
          <TabsTrigger value="activity">
            <Gauge /> System activity
          </TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-4">
          <UsersTab />
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <ActivityFeed endpoint="/admin/activity" showUser filters={ADMIN_FILTERS} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Kpi({ icon: Icon, label, value, hint }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-4.5" aria-hidden="true" />
        </span>
      </div>
      {value === undefined ? <Skeleton className="mt-2 h-8 w-20" /> : <div className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{value}</div>}
      <p className="mt-1 min-h-4 text-xs text-muted-foreground">{hint}</p>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Users tab
// ---------------------------------------------------------------------------

function UsersTab() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [quotaUser, setQuotaUser] = useState(null);
  const [deleteUser, setDeleteUser] = useState(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin", "users", q],
    queryFn: () => api.get("/admin/users", { params: { q: q || undefined } }).then((r) => r.data),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin"] });
    queryClient.invalidateQueries({ queryKey: ["activity"] });
    queryClient.invalidateQueries({ queryKey: ["me"] });
  };

  const update = useMutation({
    mutationFn: ({ user, changes }) => api.patch(`/admin/users/${user.id}`, changes),
    onSuccess: ({ data }, { message }) => {
      toast.success(message(data));
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  async function removeUser() {
    try {
      const { data } = await api.delete(`/admin/users/${deleteUser.id}`);
      toast.success(data.message);
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="rounded-2xl border bg-card shadow-xs">
      <div className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email" aria-label="Search users" className="pl-9" />
        </div>
        {users && <span className="text-xs text-muted-foreground sm:ml-auto">{users.length} user{users.length === 1 ? "" : "s"}</span>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="h-10 px-4 font-semibold">User</th>
              <th scope="col" className="h-10 px-4 font-semibold">Storage</th>
              <th scope="col" className="h-10 px-4 text-right font-semibold">Files</th>
              <th scope="col" className="h-10 px-4 font-semibold">Last sign-in</th>
              <th scope="col" className="h-10 px-4 font-semibold">Active</th>
              <th scope="col" className="h-10 w-12 px-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading &&
              Array.from({ length: 4 }, (_, i) => (
                <tr key={i}>
                  <td colSpan={6} className="px-4 py-3">
                    <Skeleton className="h-9 w-full" />
                  </td>
                </tr>
              ))}
            {users?.map((u) => {
              const isMe = u.id === me.id;
              const percent = Math.min(100, (u.used_bytes / Math.max(u.quota_bytes, 1)) * 100);
              return (
                <tr key={u.id} className={cn("transition-colors hover:bg-muted/40", !u.is_active && "opacity-60")}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-9">
                        <AvatarFallback className={cn("text-xs font-semibold", u.is_admin ? "bg-brand-gradient text-white" : "bg-primary/10 text-primary")}>
                          {initials(u.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-medium">
                          <span className="truncate">{u.name}</span>
                          {isMe && <Badge variant="outline" className="px-1.5 py-0 text-[10px]">You</Badge>}
                          {u.is_admin && <Badge className="bg-primary/10 px-1.5 py-0 text-[10px] text-primary">Admin</Badge>}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="w-56 px-4 py-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-primary/12" role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100} aria-label={`${u.name} storage used`}>
                      <div
                        className={cn("h-full rounded-full", percent > 95 ? "bg-destructive" : percent > 80 ? "bg-warning" : "bg-primary")}
                        style={{ width: `${Math.max(percent, 1.5)}%` }}
                      />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {formatBytes(u.used_bytes)} of {formatBytes(u.quota_bytes)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{u.file_count}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.last_login_at ? timeAgo(u.last_login_at) : "Never"}</td>
                  <td className="px-4 py-3">
                    <Switch
                      checked={u.is_active}
                      disabled={isMe}
                      onCheckedChange={(active) =>
                        update.mutate({
                          user: u,
                          changes: { is_active: active },
                          message: (d) => `${d.name} ${d.is_active ? "enabled" : "disabled"}`,
                        })
                      }
                      aria-label={isMe ? "You can't disable your own account" : `${u.is_active ? "Disable" : "Enable"} ${u.name}`}
                    />
                  </td>
                  <td className="px-2 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.name}`}>
                          <EllipsisVertical />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onSelect={() => setQuotaUser(u)}>
                          <HardDrive /> Change quota
                        </DropdownMenuItem>
                        {!isMe && (
                          <DropdownMenuItem
                            onSelect={() =>
                              update.mutate({
                                user: u,
                                changes: { is_admin: !u.is_admin },
                                message: (d) => (d.is_admin ? `${d.name} is now an admin` : `${d.name} is no longer an admin`),
                              })
                            }
                          >
                            {u.is_admin ? <ShieldOff /> : <ShieldCheck />}
                            {u.is_admin ? "Remove admin" : "Make admin"}
                          </DropdownMenuItem>
                        )}
                        {!isMe && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onSelect={() => setDeleteUser(u)}>
                              <Trash2 /> Delete user
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {users?.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No users match “{q}”.</p>}

      <QuotaDialog
        user={quotaUser}
        onClose={() => setQuotaUser(null)}
        onSave={(quotaBytes) =>
          update.mutateAsync({
            user: quotaUser,
            changes: { quota_bytes: quotaBytes },
            message: (d) => `${d.name}'s quota set to ${formatBytes(d.quota_bytes)}`,
          })
        }
      />
      <ConfirmDialog
        open={Boolean(deleteUser)}
        onOpenChange={(o) => !o && setDeleteUser(null)}
        title={`Delete ${deleteUser?.name}?`}
        description={`This permanently deletes ${deleteUser?.email} and ALL of their files, versions, shares and backups (${formatBytes(deleteUser?.used_bytes ?? 0)}). This cannot be undone.`}
        confirmLabel="Delete user"
        onConfirm={removeUser}
      />
    </div>
  );
}

const PRESETS_GB = [1, 5, 10, 50];

function QuotaDialog({ user, onClose, onSave }) {
  return (
    <Dialog open={Boolean(user)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">{user && <QuotaForm user={user} onSave={onSave} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function QuotaForm({ user, onSave, onClose }) {
  const [gb, setGb] = useState(String(+(user.quota_bytes / 1024 / MB).toFixed(2)));
  const [busy, setBusy] = useState(false);
  const bytes = Math.round(Number(gb) * 1024 * MB);
  const valid = gb !== "" && Number(gb) >= 0;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave(bytes);
      onClose();
    } catch {
      /* toast shown by the mutation */
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>Storage quota for {user.name}</DialogTitle>
        <DialogDescription>Currently using {formatBytes(user.used_bytes)}. Uploads that would go over the quota are refused.</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="quota-gb">Quota (GB)</Label>
        <Input id="quota-gb" type="number" min={0} step="0.5" value={gb} onChange={(e) => setGb(e.target.value)} autoFocus />
        <div className="flex flex-wrap gap-2 pt-1">
          {PRESETS_GB.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setGb(String(preset))}
              className={cn("rounded-full border px-3 py-1 text-xs font-medium hover:bg-accent", Number(gb) === preset && "border-primary bg-primary/10 text-primary")}
            >
              {preset} GB
            </button>
          ))}
        </div>
        {valid && bytes < user.used_bytes && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            This is less than they already use — they won't be able to upload until they free up space.
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!valid || busy}>
          {busy && <LoaderCircle className="animate-spin" />}
          Save quota
        </Button>
      </DialogFooter>
    </form>
  );
}
