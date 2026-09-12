# Agentic UI Delivery Loop — Phase 1

An embeddable preview-review toolbar, and the anchoring SDK behind it.

Phase 1 is not a component library and not an application. It is a toolbar the
Frame mounts into a pinned preview — closer to the Vercel toolbar than to a
design system — that lets a reviewer attach persistent comments to UI elements
inside federated MFEs, and keeps those comments attached as the preview is
rebuilt.

It does not generate or modify code. It proves that feedback can be captured,
preserved across preview versions, and tied reliably to the component that
produced the pixel.

The metric that decides whether this works is the **orphan rate**: the share of
comments that lose their anchor between builds. It is computed on every metered
re-anchor pass and shown in the toolbar, not reconstructed from logs later.

## What is here

| Package | What it owns |
|---|---|
| `@adl/anchor-core` | The anchoring SDK: anchors, context locks, the re-anchor chain, crop capture, orphan metering. Framework-agnostic, no dependencies. |
| `@de/ui-provenance` | The UI Provenance Instrumenter: registry-backed element identity, build-time instrumentation for Vite and Webpack, the Module Federation 2 runtime integration, and the resolution SDK. |
| `@adl/feedback-store` | The datastore model — comments, threads, anchors, users, preview versions — behind one repository interface, with in-memory and localStorage implementations. |
| `@adl/feedback-ui` | The toolbar: `mountFeedbackToolbar()`, element picking, comment pins, and the panel for creating, viewing, resolving and replying to feedback. Depends on no design system; it styles itself from the Frame's Salt tokens with literal fallbacks. |

| App | What it is |
|---|---|
| `apps/shell` | The Frame. A Module Federation 2 host that loads the remotes, pins a preview version, and mounts the toolbar. |
| `apps/payments-mfe` | A federated remote built with Vite, exposing `PaymentsDash` at two versions so a rebuild can be watched happening. |
| `apps/limits-mfe` | A second federated remote, built with **Webpack** and `@module-federation/enhanced`, because that is what many teams use. Same identities, different bundler, different origin. |

The shell and both MFEs are built with
[Salt](https://www.saltdesignsystem.com/) and run under a `SaltProvider`, so
feedback on them is feedback about Salt decisions — a failed settlement showing
a warning `StatusIndicator` rather than an error one, say, not "this is the
wrong blue". The toolbar itself is not a Salt consumer: it is the tool looking at
the application, and it reads the Frame's tokens rather than importing its
components.

## Quickstart

```bash
pnpm install
pnpm build              # the apps consume the built packages
pnpm test               # unit, integration and stability suites
pnpm verify:requirements # every spec requirement traced to its evidence
pnpm demo               # shell on :5273, remotes on :5274 and :5275
```

Instrumentation is preview-only and off unless `DE_UI_PROVENANCE_ENABLED=true`;
`pnpm verify:production` proves a production artifact carries none of it.

Open it and you are in comment mode, because that is what you came for: click
anything on the page and say what should change. A numbered pin stays on it,
and the panel names it the way the page does ("Status badge "Failed" in
Payments"). **Comment on the whole page** covers anything wider than one thing
— spacing, form patterns, wording. **Browse** hands the page back when you want
to use it rather than talk about it.

When you have said enough, **Request changes** shows exactly what will go, lets
you hold anything back, and asks for the next version. Phase 1 has no agent
behind that, so the shell has the next version on the shelf — payments-dash
after a refactor: new file, restructured markup, the summary card deleted, the
version bumped — and reveals it a moment later. Your comments follow the page
into it, each saying whether it held, **Moved**, or is **Gone**. From
**Versions** you keep it, go back to the one before, or approve it for
deployment.

**Technical details** in the panel header shows the paths, source references,
anchor levels and the Network, Runtime and Build views behind all of it; see
`docs/embedding.md` for who sees what.

`pnpm test:e2e` runs that walkthrough in a real browser across the real
federation boundary (needs `npx playwright install chromium`, or
`PW_CHROMIUM_PATH` pointing at a Chromium binary). It starts the three dev
servers itself.

## Mounting it

The Frame mounts the toolbar. The MFEs below it are not modified, do not import
it, and do not know it is there — which is what makes it work over an MFE the
reviewer's team does not own. In the shell the whole review layer lives behind
one dynamic import (`apps/shell/src/review.ts`) that only a preview build
reaches, so a production build carries none of it.

```ts
import { mountFeedbackToolbar } from '@adl/feedback-ui'
import { createLocalStorageRepository } from '@adl/feedback-store'

const toolbar = await mountFeedbackToolbar({
  previewRoot: '#preview',
  previewId: 'pr-1042-payments-dash',
  actor: currentReviewer,
  lock: previewBuild.lock,
  buildId: previewBuild.id,
  manifest,                              // merged from every remote
  repository: createLocalStorageRepository(),
  captureCrops: true,
})

// A new pinned version: re-anchors the open set, records the version.
toolbar.update({ lock: next.lock, buildId: next.id, manifest })
```

See [docs/embedding.md](docs/embedding.md).

## The five-level anchor

A comment in Figma attaches to a frame, and the frame is the artifact. A comment
on a running MFE attaches to a DOM node, and that node is an emergent product of
component tree, data, runtime state, theme and viewport. It will not exist in the
same form after the next rebuild.

So an anchor is stored as a resolution chain, most specific first, and every
level is captured at once — along with a screenshot crop, which is never used
for matching and exists so an orphaned comment can still show what it was about.

| Level | Survives | Confidence ceiling |
|---|---|---|
| Provenance id | cosmetic refactors, file moves, component renames | 1.00 |
| Semantic path | DOM churn, class renames, MFE version bumps | 1.00 |
| Token reference | component restructuring | 0.80 |
| Text | layout changes | 0.65 |
| Visual box | nothing much; last resort, same theme and viewport only | 0.60 |

A thread that matches below the level it was captured at is marked `degraded`
rather than silently accepted, and one that matches nowhere is `orphaned` with
the full list of what was tried and why each level failed.

See [docs/anchor-resolution.md](docs/anchor-resolution.md).

## The provenance contract

Level 1 of the chain is supplied by the **UI Provenance Instrumenter**
(`ui-provenance/`), which is specified and tested in its own right.

Its central claim is that identity must survive ordinary work. A line number
cannot: it moves when the file is reformatted. So each JSX element is assigned
an opaque id once, recorded in a source-controlled registry, and preserved by
matching structure rather than position. Measured on a 151-element golden
fixture across a twelve-edit suite: 100% retention for formatting-only edits,
100% across the ordinary-edit suite including file moves and component renames,
and zero false reattachments.

Under federation each remote is built separately and publishes its own manifest;
the host registers them through the Module Federation 2 runtime plugin and the
toolbar reads them from there.

An MFE that has not adopted it still receives feedback — the chain starts at the
semantic level and confidence is lower.

See [ui-provenance/README.md](ui-provenance/README.md) and its
[architecture notes](ui-provenance/docs/architecture.md).

## Deliberately not built

**The API is not shipped.** `@adl/feedback-store` defines the model and the
repository interface, and ships two local implementations. The service that
implements the same interface over HTTP is the next piece of work, and nothing
above the interface knows which implementation it has.

Also not here, and not stubbed:

- Change intent, and any agent that writes code (phase 2).
- Revision sets, conflict detection, ordering (phase 3).
- L2 routing, preview matrix, blast radius policy (phase 4).
- Auto-apply of anything (phase 5).

Three things phase 1 does carry, because retrofitting them is expensive:

- **A named owner on every thread**, assigned at creation. Accountability for a
  change assembled from several people's comments is unresolvable after the fact.
- **The context lock on every anchor**, with staleness reported as a diff of the
  pinned inputs rather than a boolean.
- **Per-build orphan and confidence history**, so the trust gradient can later be
  raised on measured evidence instead of negotiation.
