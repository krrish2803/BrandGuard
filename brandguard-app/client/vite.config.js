import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: Vite serves the app on :5173 and proxies /api to the Express server.
// Build: output goes to ../public so Express serves the whole app on one URL.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
  build: {
    outDir: "../public",
    emptyOutDir: true,
  },
});
