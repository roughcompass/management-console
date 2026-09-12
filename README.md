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
| `@adl/provenance` | Build-time instrumentation: a babel plugin that marks host elements, and a bundler plugin that publishes each participant's manifest, context lock and build report. |
| `@adl/feedback-store` | The datastore model — comments, threads, anchors, users, preview versions — behind one repository interface, with in-memory and localStorage implementations. |
| `@adl/feedback-ui` | The toolbar: `mountFeedbackToolbar()`, element picking, comment pins, and the panel for creating, viewing, resolving and replying to feedback. Built with Salt. |

| App | What it is |
|---|---|
| `apps/shell` | The Frame. A Module Federation 2 host that loads the remotes, pins a preview version, and mounts the toolbar. |
| `apps/payments-mfe` | A federated remote, exposing `PaymentsDash` at two versions so a rebuild can be watched happening. |
| `apps/limits-mfe` | A second federated remote, so paths and manifests have to survive more than one origin. |

Shell and MFEs are built with [Salt](https://www.saltdesignsystem.com/), and the
toolbar is too — its chrome follows whatever Salt theme the Frame is running.

## Quickstart

```bash
pnpm install
pnpm build          # the apps consume the built packages
pnpm test           # 57 unit and integration tests
pnpm demo           # shell on :5273, remotes on :5274 and :5275
```

In the preview: press **Comment on a node**, click something inside an MFE,
write a comment. Then press **B · payments-dash 2.5.0 (rebuilt)**. Build B loads
a different federated module: the same components after a refactor — new file,
restructured markup, the summary card deleted, the version bumped. Watch what
each comment does.

`pnpm test:e2e` runs that walkthrough in a real browser across the real
federation boundary (needs `npx playwright install chromium`, or
`PW_CHROMIUM_PATH` pointing at a Chromium binary). It starts the three dev
servers itself.

## Mounting it

The Frame mounts the toolbar. The MFEs below it are not modified, do not import
it, and do not know it is there — which is what makes it work over an MFE the
reviewer's team does not own.

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
| Provenance id | cosmetic refactors, file moves (with an instance key) | 1.00 |
| Semantic path | DOM churn, class renames, MFE version bumps | 1.00 |
| Token reference | component restructuring | 0.80 |
| Text | layout changes | 0.65 |
| Visual box | nothing much; last resort, same theme and viewport only | 0.60 |

A thread that matches below the level it was captured at is marked `degraded`
rather than silently accepted, and one that matches nowhere is `orphaned` with
the full list of what was tried and why each level failed.

See [docs/anchor-resolution.md](docs/anchor-resolution.md).

## The provenance contract

Level 1 needs a build-time step in every participating MFE. It is a platform
contract change, not an application change, and it is additive: an MFE adds the
babel plugin and nothing else about it changes. Under federation each remote is
built separately and publishes its own manifest, scoped by MFE name; the shell
merges them.

An MFE that has not adopted it still receives feedback — the chain starts at the
semantic level and confidence is lower.

See [docs/provenance-contract.md](docs/provenance-contract.md).

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
