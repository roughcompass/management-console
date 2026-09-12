# The resolution chain

Every rebuild threatens every open comment. If a designer returns to a preview
and finds their comments floating, they stop using the tool and go back to Figma
and email. Everything below exists to make that rare, and to make it visible when
it happens anyway.

## Capture writes all five levels

When a comment is created, `captureAnchor` records every level it can, not just
the best one:

```ts
{
  capturedLevel: 'provenance',          // the best available at capture time
  contextLockId: 'b1689776775fd477',
  provenance: { file, line, column, component, element, instanceKey, ordinal },
  semantic:   { segments: [...] },      // Frame > Zone > MFE > components > tag
  tokens:     [{ token, property, value }],
  text:       { text, normalized, ordinal, tag },
  visual:     { rect, viewport, theme, devicePixelRatio, crop }
}
```

The `crop` is a small PNG of the node, rendered in the browser through an SVG
foreignObject. Nothing in the chain reads it. It exists so that a comment whose
anchor is in trouble can still show the reviewer what it was about — an orphan
nobody recognises is an orphan nobody triages. It is best-effort by design:
cross-origin images taint the canvas and web fonts do not load inside the SVG,
and both cases return no crop rather than throwing. Losing it must never cost
the comment.

The specific levels make re-anchoring accurate. The loose levels are what stop a
comment from orphaning when the specific ones are refactored away. Capturing them
later is impossible, because the build they describe is gone.

## Resolution walks the chain in fixed order

| Level | Matches on | Floor | Clean |
|---|---|---|---|
| `provenance` | exact token → same component in same file → component + instance key → sole instance of the component | 0.60 | 0.90 |
| `semantic` | path scored from the tail; an MFE version bump costs 10% | 0.55 | 0.80 |
| `token` | nodes bound to the same design tokens, disambiguated by text and position | 0.50 | 0.60 |
| `text` | normalised text, then tag, then ordinal | 0.45 | 0.55 |
| `visual` | box overlap ≥ 0.5, same tag, same theme, viewport within 5% | 0.40 | 0.50 |

**Floor**: below this, a match is noise and is discarded.
**Clean**: at or above this, the match is as good as that level gets.

The outcome is one of three states:

- `resolved` — matched at the level it was captured at, at or above that level's
  clean threshold.
- `degraded` — matched, but lower down the chain or with reduced confidence. The
  comment is still attached; the reviewer is told it moved.
- `orphaned` — nothing cleared its floor. The thread records every level tried
  and the reason each failed, because an orphan nobody can triage is an orphan
  nobody fixes.

## Four rules that cost matches on purpose

A wrong anchor is worse than a flagged orphan. A designer who finds their comment
pointing at the wrong component stops trusting every other comment on the page.

1. **A semantic path of nothing but a tag name is not a match.** It would match
   any node of that tag — a coin toss with a confidence score attached.
2. **The visual level requires the same tag.** A box on its own matches whatever
   happens to occupy that region now. The tag is the one cheap constraint left.
3. **The visual level refuses a different theme or a viewport more than 5% off.**
   Where a node sat on a 1440px dark render says nothing about a 768px light one.
4. **A semantic match that contradicts the node's own identity is discounted.**
   Two plain divs inside one component share a path exactly; what tells them
   apart is what each carries itself. If the anchor captured text or token
   bindings and the candidate has neither, the score is multiplied by 0.6 — so a
   full-path match lands as `degraded` with the contradiction named, and a
   partial one stops clearing the floor at all.

Candidates at the semantic level are selected by tag, not by the provenance
index. A node rendered inside a design-system component has no provenance of its
own but still sits on a path through the application component that placed it;
filtering by the index would make every such node unaddressable.

## Orphan rate is an output, not a report

`FeedbackStore.reanchor()` runs the whole open set against a new build in one
pass — the DOM is indexed once, then every anchor resolves against that index —
and returns the snapshot for that build:

```ts
{
  total: 3, resolved: 0, degraded: 2, orphaned: 1,
  orphanRate: 0.333, degradedRate: 0.667,
  byLevel: { provenance: 2, semantic: 0, token: 0, text: 0, visual: 0, none: 1 },
  meanConfidence: 0.6
}
```

A metered pass counts each open thread once per build, and measuring the same
build again replaces that thread's sample rather than adding to it. A federated
preview does not arrive at once — remotes resolve lazily, data lands after them
— so the toolbar waits for the preview DOM to go quiet before the metered pass;
if a remote still lands after that, the next metered pass corrects the number
instead of averaging a half-rendered page into it. Passes triggered by ordinary
DOM churn re-resolve anchors, keeping pins attached as content moves, but pass
`record: false` and are not counted.

`byLevel` is the interesting column over time. It says how much of the feedback
each level is actually carrying, which is the argument for or against the cost of
instrumentation, made with data instead of opinion.

## Staleness is separate from anchoring

An anchor can resolve perfectly against a build that has moved on underneath it.
Feedback written against version N and read at N+2 may be about code that no
longer exists, even though the node it points at still does.

So every thread carries the id of the lock it was written against, and a
re-anchor pass reports the difference as a diff:

```
designTokens:       4.2.1   → 4.3.0
mfes.payments-dash: 2.4.1   → 2.5.0
repo.commit:        a41c9ef → 7d20b13
```

Flag it, never silently carry it forward. In phase 2 this is the input that
decides whether a change intent can be generated from the comment at all.

## Anchors that are not DOM nodes

A developer's feedback usually targets something that is not on screen: a request
that should go through the entitlement-gated hook, a capability that resolved
from the wrong registry snapshot, a bundle that grew. Those anchor by their own
payload — request pattern, event channel and type, artifact name, source symbol —
and travel through the same thread machinery as a spacing correction. One model,
five anchor types.

A source-symbol anchor orphans when its file leaves the build. The others rebind
when the interaction recurs in the new preview, which is the instrumented panel's
job, not the DOM chain's.
