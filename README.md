# Agentic UI Delivery Loop — Phase 1

Anchored feedback on pinned previews.

Phase 1 replaces screenshot-and-email. A reviewer opens a running preview, clicks
the thing that is wrong, and the comment stays attached to that thing across
rebuilds. No agent generates anything yet. The point is to prove the anchor model
holds before anything expensive is built on top of it.

The metric that decides whether this works is the **orphan rate**: the share of
comments that lose their anchor between builds. It is computed on every
re-anchor pass and shown in the panel, not reconstructed from logs later.

## What is here

| Package | What it owns |
|---|---|
| `@adl/anchor-core` | The four primitives: anchor, context lock, comment thread, and the re-anchor chain. Framework-agnostic, no dependencies. |
| `@adl/provenance` | The build-time half of the provenance contract: a babel plugin that marks host elements, and a bundler plugin that publishes the manifest, the context lock and the build report. |
| `@adl/feedback-ui` | React: click-to-anchor overlay, pins, thread panel, and the instrumented preview panel for network, runtime-event and build-artifact anchors. |
| `apps/preview-demo` | A pinned preview — one Frame, two MFEs — with a second build you can switch to, so the re-anchor behaviour is visible rather than asserted. |

## Quickstart

```bash
pnpm install
pnpm build          # the demo consumes the built packages
pnpm test           # 43 unit and integration tests
pnpm demo           # http://localhost:5273
```

In the demo: press **Comment on a node**, click something, write a comment. Then
press **B · payments-dash 2.5.0 (rebuilt)**. Build B is the same MFE after a
refactor — components moved to a new file, markup restructured, the summary card
deleted, the version bumped. Watch what each comment does.

`pnpm test:e2e` runs the same walkthrough in a real browser (requires
`npx playwright install chromium`, or `PW_CHROMIUM_PATH` pointing at a Chromium
binary). jsdom reports every box as zero, so the visual level of the chain can
only be exercised here.

## The five-level anchor

A comment in Figma attaches to a frame, and the frame is the artifact. A comment
on a running MFE attaches to a DOM node, and that node is an emergent product of
component tree, data, runtime state, theme and viewport. It will not exist in the
same form after the next rebuild.

So an anchor is stored as a resolution chain, most specific first, and every
level is captured at once:

| Level | Survives | Confidence ceiling |
|---|---|---|
| Provenance id | cosmetic refactors, file moves (with an instance key) | 1.00 |
| Semantic path | DOM churn, class renames, MFE version bumps | 1.00 |
| Token reference | component restructuring | 0.80 |
| Text | layout changes | 0.65 |
| Visual box | nothing much; last resort, same theme and viewport only | 0.60 |

After every rebuild the chain is walked in order and the first level that clears
its floor wins. A thread that matches below the level it was captured at is
marked `degraded` rather than silently accepted, and one that matches nowhere is
`orphaned` with the full list of what was tried and why each level failed.

See [docs/anchor-resolution.md](docs/anchor-resolution.md).

## The provenance contract

Level 1 needs a build-time instrumentation step in every participating MFE. It is
a platform contract change, not an application change, and it is additive: an MFE
adds the babel plugin and nothing else about it changes. An MFE that has not
adopted it still receives feedback — the chain simply starts at the semantic
level and confidence is lower.

See [docs/provenance-contract.md](docs/provenance-contract.md).

## Deliberately not built

Phase 1 stops where it stops. Not here, and not stubbed:

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
