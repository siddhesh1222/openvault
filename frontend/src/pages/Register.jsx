import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { AuthLayout } from "@/components/AuthLayout";
import { PasswordInput } from "@/components/PasswordInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Rough password strength: 0 (empty) .. 4 (strong). */
function passwordScore(password) {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  return score;
}
const STRENGTH = [
  { label: "Too short", color: "bg-destructive" },
  { label: "Weak", color: "bg-destructive" },
  { label: "Fair", color: "bg-warning" },
  { label: "Good", color: "bg-success" },
  { label: "Strong", color: "bg-success" },
];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const score = form.password.length < 8 ? 0 : Math.max(1, passwordScore(form.password));
  const canSubmit = form.name.trim() && form.email && form.password.length >= 8;

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await register(form.name, form.email, form.password);
      toast.success("Account created — welcome to OpenVault!");
      navigate("/app/files", { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Could not create the account"));
    } finally {
      setBusy(false);
    }
  }

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start storing and sharing files privately."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" autoComplete="name" placeholder="Ada Lovelace" value={form.name} onChange={update("name")} required autoFocus className="h-11" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={update("email")} required className="h-11" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={form.password}
            onChange={update("password")}
            required
            className="h-11"
            aria-describedby="password-strength"
          />
          {form.password && (
            <div id="password-strength" className="flex items-center gap-3 pt-1" aria-live="polite">
              <div className="flex flex-1 gap-1.5">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className={cn("h-1.5 flex-1 rounded-full bg-muted transition-colors", i <= score && STRENGTH[score].color)} />
                ))}
              </div>
              <span className="w-16 text-right text-xs font-medium text-muted-foreground">{STRENGTH[score].label}</span>
            </div>
          )}
        </div>
        {error && (
          <p className="text-sm font-medium text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" variant="gradient" className="h-11 w-full text-base" disabled={busy || !canSubmit}>
          {busy && <LoaderCircle className="animate-spin" />}
          Create account
        </Button>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          {["Your files are encrypted on the server", "Free & open source (GPL-3.0)"].map((t) => (
            <li key={t} className="flex items-center gap-2">
              <Check className="size-3.5 text-success" aria-hidden="true" />
              {t}
            </li>
          ))}
        </ul>
      </form>
    </AuthLayout>
  );
}
