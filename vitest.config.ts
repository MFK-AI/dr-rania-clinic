import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
    // JWT_SECRET must be present before auth.ts module loads (it throws on import if missing)
    env: {
      JWT_SECRET: "test-secret-for-vitest-only-not-used-in-production",
      NODE_ENV: "test",
    },
  },
});
