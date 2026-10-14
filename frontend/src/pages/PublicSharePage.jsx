/**
 * The page anyone sees when they open a share link: /s/<token>.
 * No login needed. Handles the password step, expired/removed links, a
 * single shared file, and browsing a shared folder.
 */
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ChevronRight, Clock, Download, Eye, KeyRound, LinkIcon, LoaderCircle, LockKeyhole } from "lucide-react";

import { EmptyState } from "@/components/EmptyState";
import { FileIcon } from "@/components/FileIcon";
import { PreviewModal } from "@/components/files/PreviewModal";
import { Logo } from "@/components/Logo";
import { PasswordInput } from "@/components/PasswordInput";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, downloadUrl, errorMessage } from "@/lib/api";
import { formatBytes, formatDate, timeAgo } from "@/lib/format";
import { previewType } from "@/lib/fileTypes";
import { toItems } from "@/lib/items";

export default function PublicSharePage() {
  const { token } = useParams();
  const [access, setAccess] = useState(() => sessionStorage.getItem(`ov_share_${token}`));
  const [folderId, setFolderId] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-share", token, access, folderId],
    queryFn: () => api.get(`/public/s/${token}`, { params: { access: access ?? undefined, folder_id: folderId ?? undefined } }).then((r) => r.data),
    retry: false,
  });

  // Links to a file in this share (password-protected links need ?access=...).
  const linksFor = (item) => {
    const params = new URLSearchParams();
    if (access) params.set("access", access);
    const base = `/api/public/s/${token}/files/${item.id}/content?${params}`;
    return { preview_url: base, download_url: `${base}&download=1` };
  };
  const download = (item) => downloadUrl(linksFor(item).download_url);
  const open = (item) => (item.type === "folder" ? setFolderId(item.id) : previewType(item) ? setPreviewItem(item) : download(item));

  let body;
  if (isLoading) {
    body = <Skeleton className="h-72 rounded-3xl" />;
  } else if (error) {
    const expired = error.response?.status === 410;
    body = (
      <EmptyState
        icon={expired ? Clock : LinkIcon}
        title={expired ? "This link has expired" : "Link not found"}
        description={expired ? "Ask the person who shared it for a new link." : "The link may have been deleted, or the file was removed."}
      />
    );
  } else if (data.requires_password) {
    body = <PasswordStep token={token} ownerName={data.owner_name} onUnlock={(value) => {
      sessionStorage.setItem(`ov_share_${token}`, value);
      setAccess(value);
    }} />;
  } else if (data.type === "file") {
    body = <SharedFile file={{ ...data.file, type: "file" }} data={data} onPreview={setPreviewItem} onDownload={download} />;
  } else {
    body = <SharedFolder data={data} onOpen={open} onDownload={download} onCrumb={setFolderId} />;
  }

  const files = data?.contents ? toItems([], data.contents.files) : data?.file ? [{ ...data.file, type: "file" }] : [];

  return (
    <div className="relative isolate min-h-svh">
      <div className="absolute inset-x-0 top-0 -z-10 h-[28rem] bg-[radial-gradient(ellipse_70%_60%_at_50%_0%,color-mix(in_oklch,var(--gradient-via)_18%,transparent),transparent)]" aria-hidden="true" />
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-5xl px-4 pt-6 pb-16 sm:px-6 sm:pt-10">{body}</main>
      <footer className="pb-8 text-center text-xs text-muted-foreground">
        Shared securely with <a href="/" className="font-semibold text-foreground hover:underline">OpenVault</a> — open source, self-hosted file sharing.
      </footer>
      <PreviewModal
        item={previewItem}
        files={files}
        onClose={() => setPreviewItem(null)}
        onNavigate={setPreviewItem}
        getLinks={async (item) => linksFor(item)}
        onDownload={download}
      />
    </div>
  );
}

function PasswordStep({ token, ownerName, onUnlock }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post(`/public/s/${token}/unlock`, { password });
      onUnlock(data.access);
    } catch (err) {
      setError(errorMessage(err, "Wrong password"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={submit}
      className="mx-auto max-w-sm rounded-3xl border bg-card p-8 text-center shadow-xl shadow-primary/5"
    >
      <div className="bg-brand-gradient mx-auto flex size-14 items-center justify-center rounded-2xl text-white shadow-lg shadow-primary/30">
        <LockKeyhole className="size-6" />
      </div>
      <h1 className="mt-5 text-xl font-bold">This link is protected</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{ownerName} added a password. Enter it to continue.</p>
      <div className="mt-6 text-left">
        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" aria-label="Password" autoFocus className="h-11" aria-invalid={Boolean(error)} />
        {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}
      </div>
      <Button type="submit" variant="gradient" className="mt-4 h-11 w-full" disabled={!password || busy}>
        {busy ? <LoaderCircle className="animate-spin" /> : <KeyRound />}
        Unlock
      </Button>
    </motion.form>
  );
}

function SharedFile({ file, data, onPreview, onDownload }) {
  const canPreview = Boolean(previewType(file));
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-lg rounded-3xl border bg-card p-8 text-center shadow-xl shadow-primary/5"
    >
      <FileIcon item={file} size="lg" className="mx-auto size-20 rounded-3xl [&_svg]:size-10" />
      <h1 className="mt-5 text-xl font-bold break-words">{file.name}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {formatBytes(file.size)} · Shared by <span className="font-medium text-foreground">{data.owner_name}</span>
      </p>
      {data.expires_at && <p className="mt-1 text-xs text-muted-foreground">Link expires {formatDate(data.expires_at)}</p>}
      <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button variant="gradient" size="lg" onClick={() => onDownload(file)}>
          <Download /> Download
        </Button>
        {canPreview && (
          <Button variant="outline" size="lg" onClick={() => onPreview(file)}>
            <Eye /> Preview
          </Button>
        )}
      </div>
    </motion.div>
  );
}

function SharedFolder({ data, onOpen, onDownload, onCrumb }) {
  const { contents } = data;
  const items = toItems(contents.folders, contents.files);
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <p className="text-sm text-muted-foreground">
        Shared by <span className="font-medium text-foreground">{data.owner_name}</span>
        {data.expires_at && ` · expires ${formatDate(data.expires_at)}`}
      </p>
      <nav aria-label="Breadcrumb" className="mt-2 mb-6">
        <ol className="flex flex-wrap items-center gap-1">
          {contents.breadcrumbs.map((crumb, i) => {
            const last = i === contents.breadcrumbs.length - 1;
            return (
              <li key={crumb.id} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />}
                {last ? (
                  <h1 className="text-2xl font-bold tracking-tight">{crumb.name}</h1>
                ) : (
                  <button onClick={() => onCrumb(i === 0 ? null : crumb.id)} className="rounded-md px-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
                    {crumb.name}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">This folder is empty.</div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-xs">
          {items.map((item) => (
            <li key={`${item.type}-${item.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
              <button onClick={() => onOpen(item)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <FileIcon item={item} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{item.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {item.type === "folder" ? "Folder" : `${formatBytes(item.size)} · ${timeAgo(item.updated_at)}`}
                  </span>
                </span>
              </button>
              {item.type === "file" && (
                <Button variant="ghost" size="icon-sm" onClick={() => onDownload(item)} aria-label={`Download ${item.name}`}>
                  <Download />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}
