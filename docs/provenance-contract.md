# The provenance instrumentation contract

Level 1 of the anchor chain needs to know which component, in which file, at
which line, produced a given DOM node. Nothing at runtime can reconstruct that,
so it is emitted at build time.

This is a platform contract change, not an application change. It is additive in
the same way the shell event hub was: an MFE adds a babel plugin to its build and
nothing else about it changes.

## Three parts

### 1. Build time — the babel plugin

`@adl/provenance` marks every **host** element (`div`, `span`, `button`, …) with
a compact token:

```jsx
<span className="badge">settled</span>
// becomes
<span className="badge" data-prov="e875795e:9:5">settled</span>
```

Component elements (`<StatusBadge />`) are not marked: an attribute on a
component is a prop, and props do not reliably reach the DOM.

The token is `<moduleId>:<line>:<column>`, roughly a dozen bytes. Everything else
lives in a manifest published next to the preview, so the DOM does not carry the
weight of the file path and component name on every node.

```ts
import { createProvenance } from '@adl/provenance'
import react from '@vitejs/plugin-react'

const provenance = createProvenance({
  // The federated participant this build belongs to: an MFE name, or the shell.
  scope: 'payments-dash',
  repo: 'roughcompass/management-console',
  commit: process.env.GIT_COMMIT,
  root: __dirname,
  contextLock: { /* pinned inputs for this preview */ },
})

export default defineConfig({
  plugins: [
    react({ babel: { plugins: [provenance.babelPlugin] } }),
    provenance.vitePlugin,
  ],
})
```

The element is attributed to the nearest enclosing component-shaped name, walking
up through helpers: a `<tr>` returned from a `renderRow` helper belongs to the
component that defines the helper, which is the name a reviewer recognises.

### 2. Build time — the manifest and the lock

The bundler plugin publishes three files alongside the preview:

| Path | Contents |
|---|---|
| `__provenance/manifest.json` | per-scope repo/commit/build id, module ids to file paths, tokens to component/element/line/column |
| `__provenance/context-lock.json` | the pinned inputs this preview was built against, and their content hash |
| `__provenance/build-report.json` | env vars, bundle sizes, federation remotes, dependency versions — the targets for build-artifact anchors |

In dev they are served live, because the manifest grows as modules are
transformed. In a build they are emitted as assets. A hot update forgets that
module's nodes first, so a stale entry cannot survive an edit.

They are served with `Access-Control-Allow-Origin: *` by default: a federated
shell reads every remote's manifest cross-origin. These are build metadata for a
preview, not application data. `allowOrigin` narrows or disables it.

### Federation

Under Module Federation each remote is built separately, by a different pipeline,
at a different commit. So there is no single repo or commit for a page, and the
manifest is keyed by scope:

```json
{
  "version": 1,
  "scopes": {
    "payments-dash": { "repo": "...", "commit": "a41c9ef", "buildId": "..." },
    "limits-panel":  { "repo": "...", "commit": "7d20b13", "buildId": "..." }
  },
  "modules": { "3e9f5dc9": { "file": "src/v2/PaymentsDash.tsx", "scope": "payments-dash" } },
  "nodes":   { "3e9f5dc9:19:5": { "module": "3e9f5dc9", "component": "StatusBadge", ... } }
}
```

Module ids are hashed with their scope, so two remotes that both ship a
`src/App.tsx` do not collide and `mergeProvenanceManifests()` can take the union.
The shell loads every participant's manifest with `loadProvenanceManifests()`; a
remote that is unreachable is skipped rather than failing the preview.

In dev a remote's manifest only lists the modules it has actually served, so the
shell re-reads them whenever a remote finishes loading.

### 3. Runtime — the host contract

The Frame and each MFE declare their own boundaries. This is what turns a chain
of component names into an address that means something across LOBs:

| Attribute | Set by | Example |
|---|---|---|
| `data-frame`, `data-frame-version` | the host Frame | `cib-frame`, `3.1` |
| `data-zone` | the Frame, per zone | `main` |
| `data-mfe`, `data-mfe-version` | each MFE root | `payments-dash`, `2.4.1` |
| `data-theme` | the preview host | `dark` |
| `data-tokens` | components, per styled node | `color.action.primary.background=background-color` |
| `data-prov-key` | authored, on repeated instances | the row id |

Together they produce:

```
Frame[cib-frame]@3.1 > Zone[main] > MFE[payments-dash]@2.4.1 > PaymentsDash > PositionsTable > StatusBadge
```

Components above the innermost boundary are dropped. The app shell that renders
the Frame, and the Frame that renders the zone, are plumbing; the address starts
at the boundary the host contract owns.

## Two attributes worth arguing about

**`data-prov-key`** is authored, not generated, and it is the single highest
-value line an MFE team can add. It is what lets a comment on the third row of a
table survive the component moving to a different file. Without it, a repeated
instance falls back to ordinal position, which is wrong as soon as the list
reorders. Put it on rows, cards, list items — anything rendered from data.

**`data-tokens`** binds a node to the design tokens that produce its styling.
With Salt these are the CSS custom properties themselves
(`--salt-status-success-foreground=color`), so the binding is checkable against
the running theme rather than an agreed-upon name.
It is what keeps a comment alive through a component restructure, and in phase 2
it is what makes the token-versus-instance decision reviewable instead of a model
judgement call.

## Partial adoption

Coverage does not have to be complete for the loop to be useful, and it will not
be complete on day one.

- **Instrumented MFE**: the chain starts at level 1. A comment survives a file
  move at confidence 0.80, and an exact rebuild at 1.00.
- **Uninstrumented MFE**: level 1 is skipped entirely. The chain starts at the
  semantic level using only the host contract, and falls to tokens and text.
  Comments still work; they orphan more often.

The orphan rate is reported per build, so the difference between an instrumented
MFE and an uninstrumented one is measurable rather than argued. That is the
evidence to bring to the question of whether instrumentation should be mandatory
for participating MFEs or opt-in per team.

## What does not get instrumented

The plugin only marks elements written in application code. A node rendered
inside a design-system component — a Salt `Card`, the `<td>` inside a Salt
`Table` — carries no provenance of its own, because the component's source is in
`node_modules` and is not instrumented.

Those nodes are still addressable: the semantic path walks up to the application
component that placed them, so a Salt `Card` inside `PaymentsDash` resolves as
`... > PaymentsDash > div`. It anchors one level down the chain, at lower
confidence, which is the honest answer.

The lever that improves it is `data-prov-key` on anything repeated, and
`data-tokens` on anything styled.

## Cost

One babel visitor, one attribute per host element, one JSON file per build. The
attribute is stripped from any build that sets `enabled: false`, so a production
bundle with no preview attached carries none of it.
