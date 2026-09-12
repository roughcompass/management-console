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
  theme: 'dark',

  // The review loop. Without these the toolbar still collects feedback; it
  // just has nowhere to send it and one version to show.
  versions,                                        // oldest first; buildId is the one on screen
  onViewVersion: (id) => host.showBuild(id),
  onCreateVersion: async (request) => host.buildNext(request), // returns the new version's id
})
```

It resolves once the persisted threads for this preview have loaded, so the
reviewer never sees an empty panel that fills in a moment later.

`previewRoot` is resolved live on every render, because the Frame mounts the
toolbar before its remotes have finished loading. Anchors never reach outside it,
so the Frame's own chrome is not commentable.

`toolbar.update({ lock, buildId, manifest, ... })` swaps the pinned inputs and
re-anchors the open set. `toolbar.destroy()` removes it.

## The loop it is shaped around

Someone follows a link, sees an application, and wants it changed. That is the
whole product, and the toolbar is shaped around those four steps rather than
around the anchoring machinery underneath them:

1. **Collect feedback.** Comment mode is on when the page loads, because she
   came here to comment: a click on anything is a comment on it, and the
   composer opens where she clicked. **Browse** hands the page back when she
   wants to use it rather than talk about it. Feedback wider than one thing —
   spacing, form patterns, wording — goes in as a comment on the whole page.
   Every comment takes replies. A comment that should not exist at all — the
   wrong element, a duplicate, a change of mind — is deleted: only by whoever
   wrote it, and only after confirming, because there is no undo and nowhere
   for it to go. Deleting the opening comment deletes the thread and its pin;
   deleting a reply leaves the comment standing. A deleted comment also stops
   counting towards the orphan rate, which would otherwise report on feedback
   nobody has.
2. **Accept or reject it.** Saying something and deciding to act on it are
   different, so they are different steps. A new comment is `open` until
   somebody decides; **Accept** puts it in the next version, **Reject**
   declines it. Only accepted feedback builds anything, so nothing happens by
   default and undecided feedback blocks nothing.
3. **Create the next version.** **Create new version** shows exactly what will
   go and hands the host a `ChangeRequest` carrying the accepted comments.
   Building a version spends the feedback it was built from — those comments
   become `addressed`, so the next version is not built from them again — and
   they group together under the version that came from them, because whether
   it landed where she pointed is what she is about to check. **Reopen** puts
   one back in play when it did not.
4. **Move between versions.** Every version is listed with a button to put it
   back on screen, and the dock has a picker for the same thing. Back or
   forward, any of them.

Steps 3 and 4 need a host: `onCreateVersion` builds the next version and
resolves once it is on screen (returning its id lets each comment record which
version was built from it), and `onViewVersion` puts an existing one back up.
A host that passes neither gets a toolbar that collects feedback and has
nowhere to send it, which is a reasonable thing to want and the reason they are
optional.

**The tool ends at the version.** Whether a version ships, to whom, and when,
is a different system's concern: this one has no notion of approval,
environments or release, and should not grow one.

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
the section it sits in. Only trouble gets a status — **Moved** when the thing
changed and the toolbar found the closest match, **Gone** when it is not on the
page any more — and a comment that is still where it was left shows none. The
panel has two views, **Comments** and **Versions**, and nothing in it is
measured in anchors, locks or builds.

**Technical details**, in the panel header, turns on the engineering layer
everywhere at once and is remembered per reviewer: semantic paths, source file
and line, instance keys, anchor status and level with confidence, the context
lock and its diff, the orphan rate, re-anchoring, and the Network, Runtime and
Build views. Each comment also has a **Details** disclosure of its own, so an
engineer can look at one without changing the panel for everyone.

The packet that leaves carries both: each thread has a plain `label` and the
technical `where`, `provenance` and anchor fields, and the digest prints the
label first.

## What a change request carries

A version is built from the accepted comments and nothing else. She reads the
brief before it goes, and `onCreateVersion` receives a `ChangeRequest`:

- `comments` — the accepted feedback, each with a plain `label`, its anchor
  type, current anchor status and level, its location (semantic path, or the
  target for a network, runtime, build or whole-page anchor), the provenance
  reference when there is one, and every reply with its author's role;
- `rejected` — ids of feedback explicitly declined. A decision worth carrying,
  not an omission: it says these were considered and turned down;
- `fromVersion` and `lock` — the version the feedback was written against;
- `brief` — the same thing as text: feedback on parts of the page first with
  its location, then feedback about the whole page, then network, runtime and
  build.

A whole-page comment is one with a `general` anchor and a topic. It has no node
to pin to, resolves on every version, and sits in its own section of the brief,
because it is not asking for a change at one place.

Asking changes nothing about the comments themselves: they stay open, follow
the page into the next version, and the reviewer marks done the ones it fixed.

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
