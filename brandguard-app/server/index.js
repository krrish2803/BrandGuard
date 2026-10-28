/** Server entry: node server/index.js (or via `npm start`). */

// Load .env before anything reads process.env. Kept here (the entry point) so
// tests that import app.js directly stay hermetic and never pick up real keys.
import "dotenv/config";

import { boot } from "./app.js";
import { initDb, closeDb } from "./db.js";

const PORT = Number(process.env.PORT ?? 4000);

const { mode } = await initDb();
const app = await boot();

const server = app.listen(PORT, () => {
  console.log(`[brandguard] listening on http://localhost:${PORT} (db: ${mode})`);
  console.log(`[brandguard] health: http://localhost:${PORT}/api/health`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    server.close();
    await closeDb();
    process.exit(0);
  });
}
