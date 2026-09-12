# Installation

## 1. Configure

```bash
pnpm add -D @de/ui-provenance
npx ui-provenance init
```

`init` writes a config and an empty registry, and overwrites neither if they
already exist.

```ts
// ui-provenance.config.ts
import { defineProvenanceConfig } from '@de/ui-provenance/compiler'

export default defineProvenanceConfig({
  applicationId: 'payments-web',        // firm-controlled, not the remote name
  repository: 'bitbucket/project/payments-web',
  include: ['src/**/*.{jsx,tsx}'],
  exclude: ['**/*.test.*', '**/*.stories.*', '**/generated/**'],
  registry: '.ui-provenance/registry.json',
  saltPackages: ['@salt-ds/core', '@salt-ds/lab', '@salt-ds/icons'],
  ambiguousMatchThreshold: 0.9,
  tombstoneRetentionDays: 90,
  productionDisabled: true,
  federation: { name: 'payments_dash', role: 'remote', exposes: ['./PaymentsDash'] },
})
```

`applicationId` is deliberately not inferred from the Module Federation remote
name. Remote names are a build concern and repeat across environments.

## 2. Wire the build

Instrumentation is off unless `DE_UI_PROVENANCE_ENABLED=true`, and a production
build refuses it outright.

### Vite

```ts
import { createUiProvenanceVite } from '@de/ui-provenance/vite'
import react from '@vitejs/plugin-react'

const provenance = createUiProvenanceVite()

export default defineConfig({
  plugins: [
    provenance.vitePlugin,
    // Injection rides the existing JSX pass rather than regenerating modules.
    react({ babel: { plugins: [provenance.babelPlugin] } }),
  ],
})
```

```jsonc
// package.json
{
  "scripts": {
    "dev": "DE_UI_PROVENANCE_ENABLED=true vite",
    "build": "vite build",
    "build:preview": "DE_UI_PROVENANCE_ENABLED=true vite build --mode preview"
  }
}
```

### Webpack

```js
import { UiProvenanceWebpackPlugin, loaderPath } from '@de/ui-provenance/webpack'

export default {
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        exclude: /node_modules/,
        // Loaders run right to left: provenance sees the author's JSX first,
        // before the JSX itself is compiled away.
        use: [babelLoader, loaderPath],
      },
    ],
  },
  plugins: [new UiProvenanceWebpackPlugin({ root: __dirname })],
}
```

Leave the loader in the rule for every build, including production. With
instrumentation off the plugin registers no project and the loader switches from
injecting to stripping, so an authored `data-de-instance-key` never reaches a
production artifact. The plugin emits `ui-provenance-manifest.json` as a build
asset, next to the remote entry.

`apps/limits-mfe` in this repository is a working example: Webpack,
`@module-federation/enhanced`, a module-type remote entry consumed by a Vite
host. Both adapters share one analysis pass, so equivalent source produces
equivalent identities and the same manifest schema - the host resolves an
element in the Webpack remote through exactly the same chain it uses for the
Vite one.

## 3. Wire the host

The host registers builds through the Module Federation runtime plugin. Nothing
reads `window.__FEDERATION__`.

```ts
federation({
  name: 'shell',
  remotes: { /* ... */ },
  runtimePlugins: [
    ['@de/ui-provenance/module-federation',
     { host: { manifestUrl: '/ui-provenance-manifest.json', rootSelector: '#preview' } }],
  ],
})
```

## 4. Everyday commands

```bash
ui-provenance sync     # assign and preserve ids, write the registry
ui-provenance check    # the same analysis without writing; fails when stale
```

Commit `.ui-provenance/registry.json`. Run `check` in CI before the preview
build: a stale registry is a build failure, never a silent re-identification.

## 5. Repeated elements

One JSX element renders many rows. They share a source id, so the application
says which row a comment belongs to:

```tsx
<TR data-de-instance-key={position.id}>
```

Nothing infers this. The instrumenter will not read an account number out of
rendered content and call it an identifier.

Where two elements are genuinely indistinguishable, pin one:

```tsx
<Button data-de-provenance-key="submit-payment">Submit</Button>
```

## 6. Salt

Run the compatibility suite once per Salt upgrade. It renders each component in
a real browser and asks the DOM what happened to the attribute; a prop
definition is not evidence. The result is written to
`.ui-provenance/salt-catalog.json`, and the compiler injects only into
components the suite classified as `forwards-data-attributes`.
