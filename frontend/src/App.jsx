import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import AppLayout from "@/components/AppLayout";
import { FullPageLoader, RedirectIfAuthed, RequireAdmin, RequireAuth } from "@/components/RouteGuards";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";

// Pages loaded on demand (code splitting): the browser only downloads the
// code for a page when the user first visits it, so the first load is faster.
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const FilesPage = lazy(() => import("@/pages/FilesPage"));
const ActivityPage = lazy(() => import("@/pages/ActivityPage"));
const AdminPage = lazy(() => import("@/pages/AdminPage"));
const SharedPage = lazy(() => import("@/pages/SharedPage"));
const BackupsPage = lazy(() => import("@/pages/BackupsPage"));
const TrashPage = lazy(() => import("@/pages/TrashPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const SearchPage = lazy(() => import("@/pages/SearchPage"));
const PublicSharePage = lazy(() => import("@/pages/PublicSharePage"));
const NotFound = lazy(() => import("@/pages/NotFound"));

/** All pages of the app and the URL each one lives at. */
export default function App() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Routes>
        {/* Public pages */}
        <Route path="/" element={<Landing />} />
        <Route path="/s/:token" element={<PublicSharePage />} />
        <Route element={<RedirectIfAuthed />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>

        {/* Logged-in app */}
        <Route element={<RequireAuth />}>
          <Route path="/app" element={<AppLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="files" element={<FilesPage />} />
            <Route path="files/:folderId" element={<FilesPage />} />
            <Route path="shared" element={<SharedPage />} />
            <Route path="backups" element={<BackupsPage />} />
            <Route path="trash" element={<TrashPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="activity" element={<ActivityPage />} />
            <Route element={<RequireAdmin />}>
              <Route path="admin" element={<AdminPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
