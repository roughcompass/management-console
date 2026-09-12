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
  onSubmit: (submission) => sendToYourAgent(submission), // optional
})
```

It resolves once the persisted threads for this preview have loaded, so the
reviewer never sees an empty panel that fills in a moment later.

`previewRoot` is resolved live on every render, because the Frame mounts the
toolbar before its remotes have finished loading. Anchors never reach outside it,
so the Frame's own chrome is not commentable.

`toolbar.update({ lock, buildId, manifest, ... })` swaps the pinned inputs and
re-anchors the open set. `toolbar.destroy()` removes it.

## Two people read it

The person leaving comments is usually not an engineer: a designer, a product
owner, someone from operations. The person acting on them usually is. The
toolbar is written for the first and reveals the second on request, following
the pattern design tools settled on for the same split (a design surface with a
"dev mode" behind one switch) and the usual rule for progressive disclosure:
show what the current task needs, put the rest one deliberate step away, in the
same place every time.

By default the toolbar names things the way the page does. A comment is on
**Status badge "Failed" in Payments**, not on
`MFE[payments-dash] > PositionsTable > StatusBadge`; the label is captured with
the anchor from the component name, the node's visible text and the heading of
the section it sits in. Only trouble gets a status — **Best match** when the
thing moved and the toolbar found the closest match, **Not in this build** when
it could not — and a comment that is where it was left shows none. The panel
has two views, **Comments** and **Send**, and the numbers in its header are the
ones a reviewer acts on: open, and to send.

**Technical details**, in the panel header, turns on the engineering layer
everywhere at once and is remembered per reviewer: semantic paths, source file
and line, instance keys, anchor status and level with confidence, the context
lock and its diff, the orphan rate, re-anchoring, and the Network, Runtime and
Build views. Each comment also has a **Details** disclosure of its own, so an
engineer can look at one without changing the panel for everyone.

The packet that leaves carries both: each thread has a plain `label` and the
technical `where`, `provenance` and anchor fields, and the digest prints the
label first.

## What leaves it

Comments accumulate until a reviewer decides what the next build should act on.
Every open thread is in the next submission unless the reviewer unticks
**send to agent** on it; a closed thread never is. The **Submit** tab shows the
packet before it goes — as text, because that is what the reviewer reads and
what an agent reads — and sending it calls `onSubmit` with a
`FeedbackSubmission`:

- `threads` — the threads being sent, each with its anchor type, current
  anchor status and level, its location (semantic path, or the target for a
  network, runtime, build or general anchor), the provenance reference when
  there is one, and every comment with its author's role;
- `leftOut` — ids of open threads the reviewer chose not to send, so whatever
  is on the other end does not go looking for them;
- `lock` and `buildId` — what the feedback was written against;
- `digest` — the same thing as text, element feedback first with its location,
  then feedback about the preview as a whole, then network, runtime and build.

General feedback (**General feedback** in the dock) is a thread with a
`general` anchor and a topic — spacing, forms, navigation, content,
accessibility, other. It has no node to pin to, resolves on every build, and
sits in its own section of the digest, because it is not asking for a change
at one place.

Sending changes nothing about the threads: they stay open until the next build
is pinned, re-anchor against it, and the reviewer closes what it fixed. Without
an `onSubmit`, sending records the packet in the panel and goes no further.

## What it puts in the page

One `<div data-adl-overlay>` appended to `document.body`, holding a fixed dock,
the pin overlay and the panel. The overlay attribute is what keeps the anchor
index from indexing the toolbar: a comment must never anchor to the commenting
tool.

While the panel is open the toolbar sets `data-adl-panel="open"` and
`--adl-panel-width` on the document element. A host that wants to keep its own
content visible can inset on that; one that does not, ignores it.

## Style isolation, and its limit

The toolbar is **not** built with the host's design system, and that is
deliberate. The application under review is a Salt application; the toolbar is
the tool looking at it. Building the tool out of the same components would make
a reviewer's "this button is wrong" ambiguous about which button, put a second
`SaltProvider` in the page (Salt warns about exactly that), and tie the review
layer's release to the application's design-system version.

Its own CSS is scoped under `.adl-root`, which sets the properties a preview's
global CSS is most likely to leak into it (box-sizing, font, line-height,
colour). Every value is a Salt token with a literal fallback:

```css
.adl-root { background: var(--salt-container-primary-background, #1a1d21); }
```

So over a Salt Frame the toolbar picks up that Frame's theme, and over a Frame
built with something else it still renders. It needs no design-system package of
its own and declares none.

It is not in a shadow root. A preview with aggressive global CSS
(`* { font-family: ... }`, `button { ... }`) can still reach it. If that turns
out to bite, the fix is a shadow root, not a pile of `!important`.

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
