import { defineConfig } from "vitest/config";
import path from "node:path";
import { config } from "dotenv";

// Database tests read the Supabase keys from .env.local.
config({ path: ".env.local", quiet: true });

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.db.test.ts"],
    exclude: ["**/node_modules/**"],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
