import { useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/PageHeader";
import { PasswordInput } from "@/components/PasswordInput";
import { StorageBar } from "@/components/StorageBar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { THEMES, useSaveTheme } from "@/hooks/useSaveTheme";
import { api, errorMessage } from "@/lib/api";
import { formatDate, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader title="Settings" description="Manage your profile, appearance and security." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <ProfileCard key={user.name} user={user} />
          <AppearanceCard />
          <PasswordCard />
        </div>
        <aside className="space-y-6">
          <section className="rounded-2xl border bg-card p-6 shadow-xs">
            <div className="flex flex-col items-center text-center">
              <Avatar className="size-20">
                <AvatarFallback className="bg-brand-gradient text-2xl font-bold text-white">{initials(user.name)}</AvatarFallback>
              </Avatar>
              <h2 className="mt-4 text-lg font-semibold">{user.name}</h2>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <div className="mt-3 flex gap-2">
                {user.is_admin && <Badge className="bg-primary/10 text-primary">Admin</Badge>}
                <Badge variant="secondary">Member since {formatDate(user.created_at)}</Badge>
              </div>
            </div>
            <div className="mt-6">
              <StorageBar />
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

function Card({ title, description, children }) {
  return (
    <section className="rounded-2xl border bg-card shadow-xs">
      <header className="border-b px-6 py-4">
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </header>
      <div className="p-6">{children}</div>
    </section>
  );
}

function ProfileCard({ user }) {
  const { refreshUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch("/users/me", { name: name.trim() });
      await refreshUser();
      toast.success("Profile updated");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Profile" description="This name is shown to people you share files with.">
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="profile-name">Full name</Label>
          <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-email">Email</Label>
          <Input id="profile-email" value={user.email} disabled />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy || !name.trim() || name.trim() === user.name}>
            {busy && <LoaderCircle className="animate-spin" />}
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  );
}

function AppearanceCard() {
  const { theme } = useTheme();
  const saveTheme = useSaveTheme();
  return (
    <Card title="Appearance" description="Your choice is saved to your account and follows you to other devices.">
      <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Theme">
        {THEMES.map(({ value, label, icon: Icon }) => {
          const active = theme === value;
          return (
            <button
              key={value}
              role="radio"
              aria-checked={active}
              onClick={() => saveTheme(value)}
              className={cn(
                "group relative overflow-hidden rounded-xl border-2 text-left transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                active ? "border-primary shadow-md shadow-primary/10" : "border-border hover:border-primary/40",
              )}
            >
              <ThemePreview value={value} />
              <div className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium">
                <Icon className="size-4 text-muted-foreground" />
                {label}
                {active && <Check className="ml-auto size-4 text-primary" />}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

const LIGHT_PREVIEW = "bg-zinc-100 [&_.bar]:bg-zinc-300 [&_.card]:bg-white";
const DARK_PREVIEW = "bg-zinc-900 [&_.bar]:bg-zinc-700 [&_.card]:bg-zinc-800";

/** A miniature app window (sidebar + header + two cards). */
function Mini({ className }) {
  return (
    <div className={cn("flex h-full gap-1.5 p-2", className)}>
      <div className="bar w-1/4 rounded" />
      <div className="flex flex-1 flex-col gap-1.5">
        <div className="bar h-2 w-2/3 rounded" />
        <div className="grid flex-1 grid-cols-2 gap-1.5">
          <div className="card rounded" />
          <div className="card rounded" />
        </div>
      </div>
    </div>
  );
}

/** Tiny drawing of the app in light, dark or split (system) colours. */
function ThemePreview({ value }) {
  const light = LIGHT_PREVIEW;
  const dark = DARK_PREVIEW;
  return (
    <div className="h-20 border-b" aria-hidden="true">
      {value === "system" ? (
        <div className="relative h-full">
          <Mini className={cn("absolute inset-0", light)} />
          <Mini className={cn("absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]", dark)} />
        </div>
      ) : (
        <Mini className={value === "dark" ? dark : light} />
      )}
    </div>
  );
}

function PasswordCard() {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const mismatch = form.confirm && form.next !== form.confirm;

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/users/me/password", { current_password: form.current, new_password: form.next });
      toast.success("Password changed");
      setForm({ current: "", next: "", confirm: "" });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });
  return (
    <Card title="Password" description="Use at least 8 characters. You'll stay signed in on this device.">
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="pw-current">Current password</Label>
          <PasswordInput id="pw-current" autoComplete="current-password" value={form.current} onChange={update("current")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pw-new">New password</Label>
          <PasswordInput id="pw-new" autoComplete="new-password" value={form.next} onChange={update("next")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pw-confirm">Confirm new password</Label>
          <PasswordInput id="pw-confirm" autoComplete="new-password" value={form.confirm} onChange={update("confirm")} aria-invalid={Boolean(mismatch)} />
          {mismatch && <p className="text-xs text-destructive">Passwords don't match</p>}
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy || !form.current || form.next.length < 8 || form.next !== form.confirm}>
            {busy && <LoaderCircle className="animate-spin" />}
            Change password
          </Button>
        </div>
      </form>
    </Card>
  );
}
