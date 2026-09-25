import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    // *.db.test.ts talk to a real Supabase project: `npm run test:db`.
    exclude: ["**/node_modules/**", "**/*.db.test.ts"],
  },
});
