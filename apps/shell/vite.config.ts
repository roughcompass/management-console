import { createProvenance } from "@adl/provenance";
import { federation } from "@module-federation/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url)).replace(/\/$/, "");
const PAYMENTS_ORIGIN =
  process.env.VITE_PAYMENTS_ORIGIN ?? "http://localhost:5274";
const LIMITS_ORIGIN = process.env.VITE_LIMITS_ORIGIN ?? "http://localhost:5275";

// The shell is instrumented too: its own chrome is part of the semantic path,
// and its manifest merges with every remote's.
// A Vite dev server serves the remote entry directly; the manifest only exists
// once a remote has been built.
const entryFor = (command: string) =>
  process.env.MF_ENTRY ??
  (command === "serve" ? "remoteEntry.js" : "mf-manifest.json");

const provenanceFor = (ENTRY: string) =>
  createProvenance({
    scope: "shell",
    repo: "roughcompass/management-console",
    commit: process.env.GIT_COMMIT ?? "dev-shell",
    root,
    contextLock: {
      frame: "3.1.0",
      frameContracts: "3.1",
      designTokens: "salt-1.45.0",
      capabilityRegistry: "2026-09-11T00:00:00Z",
      lobConventions: "markets-1.4",
      mfes: { "payments-dash": "2.4.1", "limits-panel": "1.2.0" },
    },
    artifacts: [
      { kind: "env-var", name: "PREVIEW_TTL_MINUTES", value: "90" },
      // The entry the preview actually loads, not the one it would load in prod:
      // a build-artifact anchor pointing at an unused URL is misleading feedback.
      {
        kind: "remote",
        name: "payments_dash",
        value: `${PAYMENTS_ORIGIN}/${ENTRY}`,
      },
      {
        kind: "remote",
        name: "limits_panel",
        value: `${LIMITS_ORIGIN}/${ENTRY}`,
      },
      { kind: "dependency", name: "@salt-ds/theme", value: "1.45.0" },
    ],
  });

export default defineConfig(({ command }) => {
  const ENTRY = entryFor(command);
  const provenance = provenanceFor(ENTRY);
  return {
    server: { port: 5273, cors: true },
    build: { target: "chrome89", modulePreload: false, cssCodeSplit: false },
    plugins: [
      react({ babel: { plugins: [provenance.babelPlugin] } }),
      federation({
        name: "shell",
        remotes: {
          payments_dash: {
            type: "module",
            name: "payments_dash",
            entry: `${PAYMENTS_ORIGIN}/${ENTRY}`,
            entryGlobalName: "payments_dash",
            shareScope: "default",
          },
          limits_panel: {
            type: "module",
            name: "limits_panel",
            entry: `${LIMITS_ORIGIN}/${ENTRY}`,
            entryGlobalName: "limits_panel",
            shareScope: "default",
          },
        },
        shared: {
          react: { singleton: true, requiredVersion: false },
          "react-dom": { singleton: true, requiredVersion: false },
          "@salt-ds/core": { singleton: true, requiredVersion: false },
        },
      }),
      provenance.vitePlugin as never,
    ],
  };
});
