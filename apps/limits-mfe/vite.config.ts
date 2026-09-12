import { createProvenance } from "@adl/provenance";
import { federation } from "@module-federation/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { mockApi } from "./mock-api";

const root = fileURLToPath(new URL(".", import.meta.url)).replace(/\/$/, "");
const PORT = 5275;
const ORIGIN = process.env.LIMITS_ORIGIN ?? `http://localhost:${PORT}`;

const entryFor = (command: string) =>
  process.env.MF_ENTRY ??
  (command === "serve" ? "remoteEntry.js" : "mf-manifest.json");

const provenanceFor = (ENTRY: string) =>
  createProvenance({
    scope: "limits-panel",
    repo: "roughcompass/management-console",
    commit: process.env.GIT_COMMIT ?? "dev-limits",
    root,
    artifacts: [
      { kind: "remote", name: "limits_panel", value: `${ORIGIN}/${ENTRY}` },
    ],
  });

export default defineConfig(({ command }) => {
  const provenance = provenanceFor(entryFor(command));
  return {
    base: `${ORIGIN}/`,
    server: { port: PORT, cors: true, origin: ORIGIN },
    build: { target: "chrome89", modulePreload: false, cssCodeSplit: false },
    plugins: [
      react({ babel: { plugins: [provenance.babelPlugin] } }),
      federation({
        name: "limits_panel",
        filename: "remoteEntry.js",
        exposes: { "./LimitsPanel": "./src/LimitsPanel.tsx" },
        shared: {
          react: { singleton: true, requiredVersion: false },
          "react-dom": { singleton: true, requiredVersion: false },
          "@salt-ds/core": { singleton: true, requiredVersion: false },
        },
      }),
      provenance.vitePlugin as never,
      mockApi(),
    ],
  };
});
