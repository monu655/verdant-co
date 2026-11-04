import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In dev, /api and /webhook are proxied to the Express server so the browser sees one origin (cookies just work).
const target = process.env.VITE_DEV_API ?? "http://localhost:8080";
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": target, "/webhook": target } },
});
