# Embedding the toolbar

The toolbar is mounted by the Frame in preview environments. It is not a
component the application renders, and the application is not modified to accept
it. That distinction is the whole point: a reviewer must be able to comment on an
MFE owned by a team they have never met.

## Mounting

```ts
import { mountFeedbackToolbar } from '@adl/feedback-ui'

const toolbar = await mountFeedbackToolbar({
  previewRoot: '#preview',   // element or selector bounding what is anchorable
  previewId: 'pr-1042-payments-dash',
  actor: currentReviewer,
  lock: build.lock,
  buildId: build.id,
  manifest,                  // merged provenance manifest, optional
  buildReport,               // optional, powers build-artifact anchors
  repository,                // optional, persistence
  recorder,                  // optional, share one with the Frame
  captureCrops: true,
  mode: 'dark',
})
```

It resolves once the persisted threads for this preview have loaded, so the
reviewer never sees an empty panel that fills in a moment later.

`previewRoot` is resolved live on every render, because the Frame mounts the
toolbar before its remotes have finished loading. Anchors never reach outside it,
so the Frame's own chrome is not commentable.

`toolbar.update({ lock, buildId, manifest, ... })` swaps the pinned inputs and
re-anchors the open set. `toolbar.destroy()` removes it.

## What it puts in the page

One `<div data-adl-overlay>` appended to `document.body`, holding a fixed dock,
the pin overlay and the panel. The overlay attribute is what keeps the anchor
index from indexing the toolbar: a comment must never anchor to the commenting
tool.

While the panel is open the toolbar sets `data-adl-panel="open"` and
`--adl-panel-width` on the document element. A host that wants to keep its own
content visible can inset on that; one that does not, ignores it.

## Style isolation, and its limit

The toolbar is built with Salt, and its own CSS is scoped under `.adl-root`,
which sets the properties a preview's global CSS is most likely to leak into it
(box-sizing, font, line-height, colour). Colour, type and spacing come from Salt
tokens, so the toolbar follows whatever theme the Frame is running.

It is **not** in a shadow root. Salt injects component CSS into the document at
runtime and has no way to target a shadow root in this version, so a shadow root
would leave every Salt component unstyled. The trade is deliberate: a preview
with aggressive global CSS (`* { font-family: ... }`, `button { ... }`) can still
reach the toolbar. If that turns out to bite, the fix is a shadow root plus a
build step that inlines Salt's CSS, not a pile of `!important`.

The toolbar needs Salt's theme CSS present in the page. Any Salt-based Frame
already has it.

## Persistence, and what is not shipped

`@adl/feedback-store` defines the model — users, preview versions, threads,
comments, anchors — behind one interface:

```ts
interface FeedbackRepository {
  listUsers(): Promise<Actor[]>
  currentUser(): Promise<Actor | undefined>
  listPreviewVersions(previewId): Promise<PreviewVersion[]>
  savePreviewVersion(version): Promise<PreviewVersion>
  listThreads(previewId): Promise<CommentThread[]>
  saveThreads(previewId, threads): Promise<void>
  deleteThread(previewId, threadId): Promise<void>
}
```

Two implementations ship: in-memory and localStorage. **The HTTP service is not
in scope for this deliverable.** It implements the same interface, and nothing
above the interface knows which implementation it has.

Two details in the model that are easy to get wrong:

- **A resolution holds a live DOM element.** It belongs to a build that is gone,
  and `JSON.stringify` would throw on it, so it is dropped on write and restored
  as `null` on read. The next re-anchor pass fills it back in.
- **Preview versions are stored, not just the current lock.** Without that
  history a thread written three versions ago can only report that it is stale,
  never what actually moved.

## Re-anchoring and when it is measured

A federated preview does not arrive at once: remotes resolve lazily, data lands
after them. Re-anchoring the instant the pinned inputs change would measure a
half-rendered page and report everything as orphaned.

So the toolbar watches the preview root and waits for the DOM to go quiet
(`settleMs`, default 250ms) before the metered pass for a new build. Passes
triggered by ordinary DOM churn afterwards re-resolve anchors — keeping pins
attached as content moves — but are not metered, so the orphan rate stays one
honest number per build rather than an average over half-rendered frames.

The dock's **Re-anchor** button is a diagnostic and is also unmetered.
