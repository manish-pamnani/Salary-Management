import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// In development the UI runs on Vite and forwards /api to the local API.
// In production Fastify serves the built files from the same origin (D11).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": process.env.API_URL ?? "http://localhost:3000" },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
  },
});
