import { motion } from "framer-motion";
import { DatabaseBackup, FileImage, History, LockKeyhole, Link2 } from "lucide-react";

import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

const POINTS = [
  { icon: LockKeyhole, text: "AES-256 encryption for every file" },
  { icon: DatabaseBackup, text: "Scheduled backups with one-click restore" },
  { icon: History, text: "Full version history" },
];

/**
 * Split-screen layout for the login and register pages:
 * a brand panel on the left (hidden on small screens) and the form on the right.
 */
export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.05fr_1fr]">
      {/* ---------- Brand panel ---------- */}
      <aside className="bg-brand-gradient relative hidden overflow-hidden p-10 text-white lg:flex lg:flex-col">
        <div className="bg-grid absolute inset-0 opacity-25 [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_70%)]" aria-hidden="true" />
        <div className="absolute -right-32 -bottom-32 size-[30rem] rounded-full bg-white/10 blur-3xl" aria-hidden="true" />
        {/* In dark mode, dim the panel so it doesn't glare next to the dark form */}
        <div className="absolute inset-0 hidden bg-black/30 dark:block" aria-hidden="true" />
        <Logo className="relative text-white [&_span:first-child]:bg-white/15 [&_span:first-child]:bg-none [&_span:first-child]:shadow-none" />

        <div className="relative my-auto max-w-md">
          <h2 className="text-4xl leading-tight font-extrabold tracking-tight text-balance">
            The private cloud you actually own.
          </h2>
          <p className="mt-4 text-white/80">
            Share and back up your files on your own server — open source, encrypted and free.
          </p>
          <ul className="mt-8 space-y-3">
            {POINTS.map(({ icon: Icon, text }, i) => (
              <motion.li
                key={text}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                className="flex items-center gap-3"
              >
                <span className="flex size-9 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 backdrop-blur">
                  <Icon className="size-4.5" aria-hidden="true" />
                </span>
                <span className="text-sm font-medium">{text}</span>
              </motion.li>
            ))}
          </ul>
        </div>

        {/* Floating "file cards" for a bit of depth */}
        <div className="relative h-36" aria-hidden="true">
          <FloatingCard className="left-0 bottom-6" delay={0} icon={FileImage} title="trip-photos.zip" meta="Shared with 3 people" />
          <FloatingCard className="left-56 bottom-0" delay={0.6} icon={Link2} title="Link copied" meta="Expires in 7 days" />
        </div>
      </aside>

      {/* ---------- Form side ---------- */}
      <main className="relative isolate flex flex-col px-4 py-6 sm:px-8">
        {/* Soft brand glow on small screens, where the brand panel is hidden */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(ellipse_80%_70%_at_50%_0%,color-mix(in_oklch,var(--gradient-via)_22%,transparent),transparent)] lg:hidden"
          aria-hidden="true"
        />
        <div className="flex items-center justify-between">
          <Logo className="lg:invisible" />
          <ThemeToggle />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mx-auto my-auto w-full max-w-sm py-10"
        >
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-center text-sm text-muted-foreground">{footer}</div>}
        </motion.div>
      </main>
    </div>
  );
}

function FloatingCard({ className, delay, icon: Icon, title, meta }) {
  return (
    <motion.div
      className={`absolute flex items-center gap-3 rounded-2xl bg-white/15 p-3 pr-5 shadow-xl ring-1 ring-white/25 backdrop-blur-md ${className}`}
      animate={{ y: [0, -8, 0] }}
      transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay }}
    >
      <span className="flex size-10 items-center justify-center rounded-xl bg-white/20">
        <Icon className="size-5" />
      </span>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-white/70">{meta}</div>
      </div>
    </motion.div>
  );
}
