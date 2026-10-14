import { useDeferredValue, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, Check, Copy, Download, Globe, KeyRound, Link2, LoaderCircle, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import { FileIcon } from "@/components/FileIcon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, errorMessage } from "@/lib/api";
import { formatDate, initials } from "@/lib/format";

/** `{file_id: 3}` or `{folder_id: 3}`: which item the share endpoints are about. */
const targetOf = (item) => (item.type === "folder" ? { folder_id: item.id } : { file_id: item.id });

export function ShareDialog({ item, onClose }) {
  return (
    <Dialog open={Boolean(item)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-5 sm:max-w-lg">
        {item && (
          <>
            <DialogHeader className="flex-row items-center gap-3 space-y-0 text-left">
              <FileIcon item={item} />
              <div className="min-w-0">
                <DialogTitle className="truncate">Share “{item.name}”</DialogTitle>
                <DialogDescription>
                  {item.type === "folder" ? "Everything inside this folder is shared too." : "Choose how people can get to this file."}
                </DialogDescription>
              </div>
            </DialogHeader>
            <Tabs defaultValue="link">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="link">
                  <Link2 /> Public link
                </TabsTrigger>
                <TabsTrigger value="people">
                  <UserPlus /> People
                </TabsTrigger>
              </TabsList>
              <TabsContent value="link" className="mt-4">
                <LinkTab item={item} />
              </TabsContent>
              <TabsContent value="people" className="mt-4">
                <PeopleTab item={item} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Public link tab
// ---------------------------------------------------------------------------

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 0);
  return d.toISOString();
}

function LinkTab({ item }) {
  const queryKey = ["share-links", item.type, item.id];
  const { data: links, isLoading } = useQuery({
    queryKey,
    queryFn: () => api.get("/shares/links", { params: targetOf(item) }).then((r) => r.data),
  });
  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  const link = links?.[0];
  // The `key` remounts the form whenever the saved settings change, so the
  // switches always start from what is stored on the server.
  return <LinkSettings key={`${link?.id}-${link?.has_password}-${link?.expires_at}`} item={item} link={link} queryKey={queryKey} />;
}

function LinkSettings({ item, link, queryKey }) {
  const queryClient = useQueryClient();
  const target = targetOf(item);
  const [usePassword, setUsePassword] = useState(Boolean(link?.has_password));
  const [password, setPassword] = useState("");
  const [useExpiry, setUseExpiry] = useState(Boolean(link?.expires_at));
  const [expiry, setExpiry] = useState(link?.expires_at ? new Date(link.expires_at) : null);
  const [copied, setCopied] = useState(false);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["folder"] }); // "shared" badges
  };

  const save = useMutation({
    mutationFn: () => {
      const body = { expires_at: useExpiry && expiry ? endOfDay(expiry) : null };
      if (!usePassword) body.password = null;
      else if (password) body.password = password;
      return link ? api.patch(`/shares/links/${link.id}`, body) : api.post("/shares/links", { ...target, ...body });
    },
    onSuccess: () => {
      toast.success(link ? "Link settings saved" : "Link created — copy it below");
      setPassword("");
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/shares/links/${link.id}`),
    onSuccess: () => {
      toast.success("Link deleted. Anyone with it can no longer open it.");
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const url = link ? `${window.location.origin}${link.url}` : "";
  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  const needsNewPassword = usePassword && !link?.has_password && password.length < 4;

  return (
    <div className="space-y-5">
      {link ? (
        <div className="space-y-3 rounded-xl border bg-muted/40 p-3">
          <div className="flex gap-2">
            <Input value={url} readOnly aria-label="Share link" className="h-10 bg-background font-mono text-xs" onFocus={(e) => e.target.select()} />
            <Button onClick={copy} className="h-10 w-28 shrink-0" variant={copied ? "outline" : "default"}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={copied ? "y" : "n"} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="flex items-center gap-2">
                  {copied ? <Check className="text-success" /> : <Copy />}
                  {copied ? "Copied" : "Copy"}
                </motion.span>
              </AnimatePresence>
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="gap-1">
              <Globe className="size-3" /> Anyone with the link
            </Badge>
            {link.has_password && (
              <Badge variant="secondary" className="gap-1">
                <KeyRound className="size-3" /> Password
              </Badge>
            )}
            {link.expires_at && (
              <Badge variant={link.is_expired ? "destructive" : "secondary"} className="gap-1">
                <CalendarClock className="size-3" /> {link.is_expired ? "Expired" : `Until ${formatDate(link.expires_at)}`}
              </Badge>
            )}
            <Badge variant="outline" className="gap-1">
              <Download className="size-3" /> {link.download_count} download{link.download_count === 1 ? "" : "s"}
            </Badge>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-dashed p-4">
          <div className="bg-brand-gradient flex size-10 shrink-0 items-center justify-center rounded-xl text-white">
            <Link2 className="size-5" />
          </div>
          <p className="text-sm text-muted-foreground">No public link yet. Anyone with a link can open it without an account.</p>
        </div>
      )}

      <div className="space-y-4">
        <SettingRow icon={KeyRound} label="Require a password" checked={usePassword} onChange={setUsePassword}>
          <Input
            type="password"
            placeholder={link?.has_password ? "Leave empty to keep the current password" : "At least 4 characters"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="Link password"
            className="h-9"
          />
        </SettingRow>
        <SettingRow icon={CalendarClock} label="Expire the link" checked={useExpiry} onChange={setUseExpiry}>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-9 w-full justify-start font-normal">
                <CalendarClock className="text-muted-foreground" />
                {expiry ? formatDate(expiry) : <span className="text-muted-foreground">Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={expiry ?? undefined} onSelect={setExpiry} disabled={{ before: new Date() }} autoFocus />
            </PopoverContent>
          </Popover>
        </SettingRow>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
        {link && (
          <Button variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>
            <Trash2 /> Delete link
          </Button>
        )}
        <Button
          className="sm:ml-auto"
          variant={link ? "outline" : "gradient"}
          onClick={() => save.mutate()}
          disabled={save.isPending || needsNewPassword || (useExpiry && !expiry)}
        >
          {save.isPending && <LoaderCircle className="animate-spin" />}
          {link ? "Save settings" : "Create link"}
        </Button>
      </div>
    </div>
  );
}

function SettingRow({ icon: Icon, label, checked, onChange, children }) {
  const id = `setting-${label.replace(/\s+/g, "-")}`;
  return (
    <div className="rounded-xl border p-3">
      <div className="flex items-center gap-3">
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
        <Label htmlFor={id} className="flex-1 cursor-pointer">
          {label}
        </Label>
        <Switch id={id} checked={checked} onCheckedChange={onChange} />
      </div>
      <AnimatePresence initial={false}>
        {checked && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="pt-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// People tab
// ---------------------------------------------------------------------------

function PeopleTab({ item }) {
  const queryClient = useQueryClient();
  const target = targetOf(item);
  const queryKey = ["share-users", item.type, item.id];
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState("view");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const deferredEmail = useDeferredValue(email.trim());

  const { data: shares = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => api.get("/shares/users", { params: target }).then((r) => r.data),
  });
  const { data: suggestions = [] } = useQuery({
    queryKey: ["user-search", deferredEmail],
    queryFn: () => api.get("/users/search", { params: { q: deferredEmail } }).then((r) => r.data),
    enabled: deferredEmail.length >= 2,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["folder"] });
  };
  const onError = (err) => toast.error(errorMessage(err));

  const add = useMutation({
    mutationFn: () => api.post("/shares/users", { ...target, email: email.trim(), permission }),
    onSuccess: ({ data }) => {
      toast.success(`Shared with ${data.target_user.name}`);
      setEmail("");
      refresh();
    },
    onError,
  });
  const change = useMutation({
    mutationFn: ({ id, value }) => api.patch(`/shares/users/${id}`, { permission: value }),
    onSuccess: () => {
      toast.success("Permission updated");
      refresh();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (share) => api.delete(`/shares/users/${share.id}`),
    onSuccess: (_res, share) => {
      toast.success(`${share.target_user.name} no longer has access`);
      refresh();
    },
    onError,
  });

  const visibleSuggestions = showSuggestions ? suggestions.filter((u) => !shares.some((s) => s.target_user.id === u.id)) : [];

  return (
    <div className="space-y-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) add.mutate();
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <div className="relative flex-1">
          <Input
            type="email"
            placeholder="Add people by name or email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setShowSuggestions(true);
            }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            aria-label="Person to share with"
            autoComplete="off"
            className="h-10"
          />
          {visibleSuggestions.length > 0 && (
            <ul className="absolute top-full right-0 left-0 z-10 mt-1 overflow-hidden rounded-xl border bg-popover p-1 shadow-lg" role="listbox">
              {visibleSuggestions.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setEmail(u.email);
                      setShowSuggestions(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-accent"
                  >
                    <PersonAvatar name={u.name} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{u.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex gap-2">
          <PermissionSelect value={permission} onChange={setPermission} className="h-10 w-28" />
          <Button type="submit" className="h-10" disabled={!email.trim() || add.isPending}>
            {add.isPending ? <LoaderCircle className="animate-spin" /> : <UserPlus />}
            Share
          </Button>
        </div>
      </form>

      <div>
        <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">People with access</h3>
        {isLoading ? (
          <div className="h-16 animate-pulse rounded-xl bg-muted" />
        ) : shares.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">Only you can see this right now.</p>
        ) : (
          <ul className="max-h-60 divide-y overflow-y-auto rounded-xl border">
            <AnimatePresence initial={false}>
              {shares.map((share) => (
                <motion.li key={share.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3 p-2.5">
                  <PersonAvatar name={share.target_user.name} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{share.target_user.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{share.target_user.email}</div>
                  </div>
                  <PermissionSelect value={share.permission} onChange={(value) => change.mutate({ id: share.id, value })} className="h-8 w-24" />
                  <Button variant="ghost" size="icon-sm" onClick={() => remove.mutate(share)} aria-label={`Remove ${share.target_user.name}`}>
                    <X />
                  </Button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  );
}

function PermissionSelect({ value, onChange, className }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className} aria-label="Permission">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="view">Can view</SelectItem>
        <SelectItem value="edit">Can edit</SelectItem>
      </SelectContent>
    </Select>
  );
}

function PersonAvatar({ name }) {
  return (
    <Avatar className="size-8">
      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
