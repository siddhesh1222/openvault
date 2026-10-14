import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CloudUpload,
  DatabaseBackup,
  FileImage,
  FileText,
  Folder,
  Gauge,
  History,
  Link2,
  LockKeyhole,
  Moon,
  Server,
  ShieldCheck,
  Users,
} from "lucide-react";

import { GithubIcon, Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

const REPO_URL = "https://github.com/";

const FEATURES = [
  { icon: LockKeyhole, title: "Encrypted at rest", text: "Every file is stored with AES-256-GCM. Even with disk access, nobody can read it without your key." },
  { icon: Link2, title: "Smart share links", text: "Share files or whole folders with a link — add a password and an expiry date in one click." },
  { icon: Users, title: "Share with people", text: "Give teammates view or edit access. Folder shares cover everything inside." },
  { icon: DatabaseBackup, title: "Automatic backups", text: "Daily or weekly snapshots of the folders that matter, with one-click restore." },
  { icon: History, title: "Version history", text: "Every upload is a new version. Roll back a file to any earlier state, safely." },
  { icon: Gauge, title: "Storage dashboard", text: "See what's using your space, by file type, plus a full activity log." },
  { icon: ShieldCheck, title: "Admin & quotas", text: "Manage users, disable accounts and set storage quotas from one panel." },
  { icon: Moon, title: "Light & dark", text: "A calm, modern interface that follows your system theme — on any device." },
];

const STEPS = [
  { icon: Server, title: "Deploy anywhere", text: "One docker compose command on a laptop, a Raspberry Pi or a cloud VM." },
  { icon: CloudUpload, title: "Drop in your files", text: "Drag & drop uploads with progress. Folders, previews and search built in." },
  { icon: ShieldCheck, title: "Sleep well", text: "Files encrypted, versioned and backed up on schedule. You own all of it." },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

export default function Landing() {
  const { user } = useAuth();
  const primaryCta = user ? { to: "/app/files", label: "Open my files" } : { to: "/register", label: "Get Started — it's free" };

  return (
    <div className="min-h-svh overflow-x-hidden">
      {/* ---------------- Navigation ---------------- */}
      <header className="fixed inset-x-0 top-0 z-40 border-b border-transparent bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6" aria-label="Main">
          <Logo />
          <div className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">Features</a>
            <a href="#how" className="transition-colors hover:text-foreground">How it works</a>
            <a href={REPO_URL} className="transition-colors hover:text-foreground" target="_blank" rel="noreferrer">Source</a>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            {!user && (
              <Button variant="ghost" asChild className="hidden sm:inline-flex">
                <Link to="/login">Sign in</Link>
              </Button>
            )}
            <Button variant="gradient" asChild>
              <Link to={user ? "/app/files" : "/register"}>{user ? "Open app" : "Get Started"}</Link>
            </Button>
          </div>
        </nav>
      </header>

      {/* ---------------- Hero ---------------- */}
      <section className="relative isolate pt-32 pb-12 sm:pt-40 sm:pb-16">
        <HeroBackground />
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.1 } } }}
          className="mx-auto max-w-4xl px-4 text-center sm:px-6"
        >
          <motion.div variants={fadeUp}>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/60 px-3.5 py-1.5 text-xs font-semibold text-primary shadow-sm backdrop-blur">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              Open source · GPL-3.0 · Self-hosted
            </span>
          </motion.div>
          <motion.h1
            variants={fadeUp}
            className="mt-7 text-4xl leading-[1.08] font-extrabold tracking-tight text-balance sm:text-6xl lg:text-7xl"
          >
            {/* The font leaves a wide gap before "." at this size, so the periods are pulled in slightly. */}
            Your files<Dot /> Your server<Dot />{" "}
            <span className="text-brand-gradient">
              Your rules<Dot />
            </span>
          </motion.h1>
          <motion.p variants={fadeUp} className="mx-auto mt-6 max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg">
            OpenVault is a private alternative to proprietary cloud storage. Share files securely, keep every version,
            and back up automatically — all encrypted, all on hardware you control.
          </motion.p>
          <motion.div variants={fadeUp} className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button variant="gradient" size="lg" asChild className="h-12 w-full px-7 text-base sm:w-auto">
              <Link to={primaryCta.to}>
                {primaryCta.label}
                <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild className="h-12 w-full bg-background/60 px-7 text-base backdrop-blur sm:w-auto">
              <a href={REPO_URL} target="_blank" rel="noreferrer">
                <GithubIcon className="size-4" />
                View on GitHub
              </a>
            </Button>
          </motion.div>
          <motion.ul variants={fadeUp} className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {["AES-256 encryption", "Docker ready", "No tracking, ever"].map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-success" aria-hidden="true" />
                {item}
              </li>
            ))}
          </motion.ul>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 48, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mt-16 max-w-5xl px-4 sm:mt-20 sm:px-6"
        >
          <ProductMockup />
        </motion.div>
      </section>

      {/* ---------------- Features ---------------- */}
      <section id="features" className="scroll-mt-20 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="Everything you need"
            title="Cloud storage features, without the cloud lock-in"
            text="All the essentials of Dropbox or Google Drive — in an app you can read, audit and run yourself."
          />
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: (i % 4) * 0.07 }}
                className="group relative flex gap-4 rounded-2xl border bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 sm:block sm:p-6 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5"
              >
                <div className="bg-brand-gradient inline-flex size-11 shrink-0 items-center sm:mb-5 justify-center rounded-xl text-white shadow-md shadow-primary/25 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                  <feature.icon className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-semibold">{feature.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground sm:mt-2">{feature.text}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- How it works ---------------- */}
      <section id="how" className="scroll-mt-20 border-y bg-muted/40 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading eyebrow="How it works" title="From zero to private cloud in minutes" />
          <ol className="relative mt-14 grid gap-8 md:grid-cols-3">
            <div className="absolute top-7 right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent md:block" aria-hidden="true" />
            {STEPS.map((step, i) => (
              <motion.li
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12 }}
                className="relative flex flex-col items-center text-center"
              >
                <div className="relative flex size-14 items-center justify-center rounded-2xl border bg-card shadow-sm">
                  <step.icon className="size-6 text-primary" aria-hidden="true" />
                  <span className="bg-brand-gradient absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full text-xs font-bold text-white shadow">
                    {i + 1}
                  </span>
                </div>
                <h3 className="mt-5 font-semibold">{step.title}</h3>
                <p className="mt-2 max-w-xs text-sm text-muted-foreground">{step.text}</p>
              </motion.li>
            ))}
          </ol>
          <div className="mx-auto mt-14 max-w-xl overflow-hidden rounded-2xl border bg-zinc-950 text-left shadow-xl">
            <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
              <span className="size-2.5 rounded-full bg-red-400/80" />
              <span className="size-2.5 rounded-full bg-amber-400/80" />
              <span className="size-2.5 rounded-full bg-emerald-400/80" />
              <span className="ml-2 text-xs text-zinc-500">terminal</span>
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-6 text-zinc-300">
              <span className="text-zinc-500">$</span> git clone &lt;your-fork&gt;/openvault && cd openvault{"\n"}
              <span className="text-zinc-500">$</span> cp .env.example .env{"\n"}
              <span className="text-zinc-500">$</span> docker compose up -d{"\n"}
              <span className="text-emerald-400">✔</span> OpenVault running on <span className="text-violet-300">http://localhost:8080</span>
            </pre>
          </div>
        </div>
      </section>

      {/* ---------------- Call to action ---------------- */}
      <section className="px-4 py-20 sm:px-6 sm:py-28">
        <div className="bg-brand-gradient relative mx-auto max-w-5xl overflow-hidden rounded-3xl px-6 py-14 text-center text-white shadow-2xl shadow-primary/30 sm:px-12 sm:py-20">
          <div className="bg-grid absolute inset-0 opacity-20 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" aria-hidden="true" />
          <div className="relative">
            <h2 className="text-3xl font-extrabold tracking-tight text-balance sm:text-5xl">Take back control of your files</h2>
            <p className="mx-auto mt-4 max-w-xl text-white/80">
              Free and open source forever. Create an account on this server and start uploading in seconds.
            </p>
            <Button size="lg" asChild className="mt-8 h-12 bg-white px-8 text-base text-primary shadow-lg hover:bg-white/90">
              <Link to={primaryCta.to}>
                {primaryCta.label}
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ---------------- Footer ---------------- */}
      <footer className="border-t py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <Logo className="text-foreground" />
          <p>© {new Date().getFullYear()} OpenVault contributors · Licensed under GPL-3.0</p>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-foreground">
            <GithubIcon className="size-4" /> Source code
          </a>
        </div>
      </footer>
    </div>
  );
}

function Dot() {
  return <span className="-ml-[0.07em]">.</span>;
}

function SectionHeading({ eyebrow, title, text }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold tracking-wide text-primary uppercase">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {text && <p className="mt-4 text-pretty text-muted-foreground">{text}</p>}
    </div>
  );
}

/** Soft blurred colour blobs + a fading grid behind the hero. */
function HeroBackground() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />
      <div className="absolute -top-40 left-1/2 h-[36rem] w-[60rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--gradient-from),transparent)] opacity-25 blur-3xl dark:opacity-35" />
      <div className="absolute top-20 -left-40 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(closest-side,var(--gradient-via),transparent)] opacity-20 blur-3xl dark:opacity-25" />
      <div className="absolute top-40 -right-40 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(closest-side,var(--gradient-to),transparent)] opacity-20 blur-3xl dark:opacity-25" />
    </div>
  );
}

/** A stylised picture of the app, built from plain elements (no screenshot needed). */
function ProductMockup() {
  const files = [
    { icon: Folder, name: "Semester 7", meta: "12 items", tint: "text-primary bg-primary/10" },
    { icon: Folder, name: "Mini Project", meta: "8 items", tint: "text-primary bg-primary/10" },
    { icon: FileImage, name: "poster.png", meta: "2.4 MB", tint: "text-pink-600 bg-pink-500/10 dark:text-pink-400" },
    { icon: FileText, name: "report.pdf", meta: "860 KB", tint: "text-red-600 bg-red-500/10 dark:text-red-400" },
  ];
  return (
    <div className="relative">
      <div className="bg-brand-gradient absolute -inset-1 rounded-[1.4rem] opacity-30 blur-2xl" aria-hidden="true" />
      <div className="relative overflow-hidden rounded-2xl border bg-card/90 shadow-2xl backdrop-blur" aria-hidden="true">
        <div className="flex items-center gap-1.5 border-b bg-muted/50 px-4 py-3">
          <span className="size-2.5 rounded-full bg-red-400" />
          <span className="size-2.5 rounded-full bg-amber-400" />
          <span className="size-2.5 rounded-full bg-emerald-400" />
          <div className="mx-auto hidden h-6 w-72 items-center justify-center rounded-md bg-background text-[11px] text-muted-foreground sm:flex">
            vault.your-college.edu
          </div>
        </div>
        <div className="flex">
          <div className="hidden w-48 shrink-0 flex-col gap-1 border-r p-3 text-sm sm:flex">
            {["My Files", "Shared with me", "Backups", "Trash"].map((label, i) => (
              <div key={label} className={`rounded-lg px-3 py-2 ${i === 0 ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground"}`}>
                {label}
              </div>
            ))}
            <div className="mt-auto rounded-lg border p-3">
              <div className="mb-2 text-xs text-muted-foreground">3.2 GB of 10 GB</div>
              <div className="h-1.5 rounded-full bg-muted">
                <div className="bg-brand-gradient h-1.5 w-1/3 rounded-full" />
              </div>
            </div>
          </div>
          <div className="flex-1 p-4 sm:p-6">
            <div className="mb-5 flex items-center justify-between">
              <div className="text-left">
                <div className="text-xs text-muted-foreground">My Files</div>
                <div className="font-bold">All files</div>
              </div>
              <div className="bg-brand-gradient rounded-lg px-3 py-1.5 text-xs font-semibold text-white">Upload</div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {files.map((f, i) => (
                <motion.div
                  key={f.name}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8 + i * 0.1 }}
                  className="rounded-xl border bg-background p-3 text-left"
                >
                  <div className={`mb-6 flex size-9 items-center justify-center rounded-lg ${f.tint}`}>
                    <f.icon className="size-4.5" />
                  </div>
                  <div className="truncate text-sm font-semibold">{f.name}</div>
                  <div className="text-xs text-muted-foreground">{f.meta}</div>
                </motion.div>
              ))}
            </div>
            <div className="mt-3 grid items-start gap-3 md:grid-cols-[1fr_18rem]">
            <motion.ul
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2 }}
              className="divide-y rounded-xl border bg-background text-left text-xs"
            >
              {[
                { icon: Link2, text: "You shared “report.pdf” with a link", time: "2m" },
                { icon: DatabaseBackup, text: "Backup “Semester 7” completed", time: "1h" },
                { icon: History, text: "Restored version 3 of “notes.md”", time: "3h" },
              ].map((row) => (
                <li key={row.text} className="flex items-center gap-3 px-3 py-2.5">
                  <row.icon className="size-3.5 shrink-0 text-primary" />
                  <span className="flex-1 truncate">{row.text}</span>
                  <span className="text-muted-foreground">{row.time}</span>
                </li>
              ))}
            </motion.ul>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.3 }}
              className="flex w-full items-center gap-3 rounded-xl border bg-popover p-3 text-left shadow-lg"
            >
              <CloudUpload className="size-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold">presentation.pptx</div>
                <div className="mt-1.5 h-1.5 rounded-full bg-muted">
                  <motion.div
                    className="bg-brand-gradient h-1.5 rounded-full"
                    initial={{ width: "8%" }}
                    animate={{ width: "78%" }}
                    transition={{ delay: 1.4, duration: 2.2, ease: "easeOut" }}
                  />
                </div>
              </div>
            </motion.div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
