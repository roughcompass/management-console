import { createProvenance } from "@adl/provenance";
import { federation } from "@module-federation/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { mockApi } from "./mock-api";

const root = fileURLToPath(new URL(".", import.meta.url)).replace(/\/$/, "");
const PORT = 5274;
const ORIGIN = process.env.PAYMENTS_ORIGIN ?? `http://localhost:${PORT}`;

const entryFor = (command: string) =>
  process.env.MF_ENTRY ??
  (command === "serve" ? "remoteEntry.js" : "mf-manifest.json");

const provenanceFor = (ENTRY: string) =>
  createProvenance({
    // Scoped: the shell merges this manifest with every other remote's.
    scope: "payments-dash",
    repo: "roughcompass/management-console",
    commit: process.env.GIT_COMMIT ?? "dev-payments",
    root,
    artifacts: [
      { kind: "remote", name: "payments_dash", value: `${ORIGIN}/${ENTRY}` },
      { kind: "dependency", name: "@salt-ds/core", value: "1.67.0" },
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
        name: "payments_dash",
        filename: "remoteEntry.js",
        exposes: {
          "./PaymentsDash": "./src/v1/PaymentsDash.tsx",
          // The next version of the same MFE. In a real preview this is a
          // separately deployed remote; the shell pins which one it loads.
          "./PaymentsDashNext": "./src/v2/PaymentsDash.tsx",
        },
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
