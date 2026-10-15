import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { validateTenantIdOrThrow } from "./build-env";

export default defineConfig(({ mode, isPreview }) => {
  // Guard applies to the dev server and production build only.
  // - `mode === "test"` is Vitest; the server test suite does not need a
  //   frontend tenant id.
  // - `isPreview` serves an already-built bundle where VITE_* values are
  //   baked in; the live env is irrelevant.
  if (mode !== "test" && !isPreview) {
    const env = loadEnv(mode, process.cwd(), "VITE_");
    validateTenantIdOrThrow(env.VITE_TENANT_ID);
  }

  return {
    plugins: [react(), tailwind()],
    server: { port: 5173 }
  };
});
