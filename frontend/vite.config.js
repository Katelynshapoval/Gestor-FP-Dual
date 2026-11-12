import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API = "http://localhost:3001";
const PUBLIC_DIR = path.resolve(import.meta.dirname, "public");

// The API has no /api prefix and shares paths with the app's pages
// (/reservas, /documentos, /panel...). Same rule as deploy/nginx.conf and the
// old CRA proxy: a GET/HEAD that asks for HTML is a page load and gets the app;
// files in public/ are served as they are; every other request (fetch() calls,
// uploads, downloads) goes to the API. Vite's own URLs (/@vite, /src,
// /node_modules) never reach this rule.
function pageOrPublicFile(req) {
  const isPageLoad =
    (req.method === "GET" || req.method === "HEAD") && (req.headers.accept || "").includes("text/html");
  if (isPageLoad) return req.url;
  const pathname = decodeURIComponent(req.url.split("?")[0]);
  const file = path.join(PUBLIC_DIR, pathname);
  if (file.startsWith(PUBLIC_DIR + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) return req.url;
  return undefined;
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "^/(?!@|src/|node_modules/|__)": { target: API, bypass: pageOrPublicFile },
    },
  },
  build: {
    // Same folder as before: frontend/Dockerfile copies /app/build into nginx.
    outDir: "build",
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setupTests.js"],
    include: ["src/**/*.test.{js,jsx}"],
    css: false,
    // The multi-step form tests take 6–8 s with coverage on (default is 5 s).
    testTimeout: 20000,
    // react-scripts ran Jest with resetMocks; the tests are written for it.
    mockReset: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{js,jsx}"],
      exclude: ["src/**/*.test.{js,jsx}", "src/setupTests.js", "src/index.jsx"],
      reporter: ["text", "text-summary"],
      // Minimum coverage, carried over from the Jest setup; CI fails below it.
      thresholds: { lines: 66, statements: 64, functions: 55, branches: 52 },
    },
  },
});
