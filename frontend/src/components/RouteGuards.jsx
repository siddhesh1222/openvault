import { Navigate, Outlet, useLocation } from "react-router-dom";
import { LoaderCircle } from "lucide-react";

import { LogoMark } from "@/components/Logo";
import { useAuth } from "@/context/AuthContext";

export function FullPageLoader() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4" role="status" aria-label="Loading">
      <LogoMark className="size-12 animate-pulse" />
      <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}

/** Only logged-in users may see the nested routes; others go to /login. */
export function RequireAuth() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Login/register pages: logged-in users are sent straight to their files. */
export function RedirectIfAuthed() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullPageLoader />;
  if (user) return <Navigate to="/app/files" replace />;
  return <Outlet />;
}
