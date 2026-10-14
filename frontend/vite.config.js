import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Lets us write `import x from "@/lib/api"` instead of long "../../" paths.
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  build: {
    // The main chunk holds React, Radix UI and Framer Motion (~185 kB gzipped);
    // every page is already split into its own chunk, so this size is expected.
    chunkSizeWarningLimit: 700,
  },
  server: {
    port: 5173,
    // During development, forward API calls to the FastAPI server, so the
    // browser sees one origin (no CORS issues, cookies/links just work).
    proxy: { "/api": "http://localhost:8000" },
  },
});
