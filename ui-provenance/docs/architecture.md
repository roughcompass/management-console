# Architecture

Three stages, and one rule connecting them: identity is decided once, at build
time, and everything else refers to it.

```
source  ──sync──▶  registry (committed)  ──build──▶  manifest (per build)
                        │                                  │
                        └── data-de-provenance-id ──▶ rendered DOM ──▶ runtime
```

## Identity

`sync` parses every included file, compares each JSX element to the registry,
and resolves identity in a fixed order:

1. An explicit `data-de-provenance-key`.
2. An exact registry match: file, component, element type, parent, fingerprint.
3. One unique structural match inside the same component.
4. One unique file move or component rename.
5. A new id.

Where more than one prior identity is equally plausible, `sync` fails with
`UIP_AMBIGUOUS_IDENTITY` and names the candidates. It does not pick one.

### The fingerprint

Hashed: element type, semantic prop names, literal accessibility labels,
literal text, and the parent's fingerprint.

Not hashed, on purpose:

| Excluded | Because |
|---|---|
| Line and column | Every edit moves them |
| Whitespace and formatting | A formatter would re-identify the whole tree |
| `className`, `style` | Class names are churn, not identity |
| Prop order | Ordering is a style choice |
| Sibling element types | Adding an unrelated sibling would perturb every neighbour at once |

### Position, used narrowly

Two sibling `<ul>`s with different class names are identical under that
fingerprint, because class names are not identity. When several candidates are
otherwise indistinguishable, position decides — first by slot among same-type
siblings, then by file index:

- Slot before index, because wrapping a subtree shifts every absolute index by
  the same amount and would otherwise hand each element its neighbour's id.
- Only among candidates that already matched on everything else.
- A genuine tie is still `UIP_AMBIGUOUS_IDENTITY`.

This is measured, not assumed: the golden evaluation reports zero false
reattachments across the edit suite, and the wrap case is in it because an
earlier version of this rule failed it.

## Transformation

Host elements always carry the attribute. React documents custom `data-*`
attributes on built-in browser elements, so this is the one transport that
needs no cooperation from anyone.

Components only carry it when a browser test proved they forward it to exactly
one DOM node. Nothing wraps, nothing relies on `display: contents`, and no
internal node is guessed at.

The Vite adapter injects through the host's existing JSX pass rather than
regenerating modules. Regenerating works, but it hands other plugins a module
they did not produce — which is how the federation plugin came to mistake an
ordinary component for an application entry.

## Manifest

One immutable artifact per build: application id, federation name and role,
repository, commit, build id, package versions, registry hash, and one entry per
source id with its file, position, component and library.

The registry is the identity; the manifest is what one build knew about it.

## Runtime

Ownership of a selected element resolves in this order:

1. The attribute on the element itself.
2. The nearest attribute above it, crossing open shadow boundaries.
3. The registered MFE mount root.
4. Otherwise, unresolved.

The attribute outranks the mount root deliberately: a host's root encloses every
remote on the page, and a Salt dialog rendered through a portal is outside every
root but still belongs to the remote that rendered it.

### Confidence

| Confidence | When |
|---|---|
| `exact` | The id resolved in the build it was captured on, or the instance key matched too |
| `strong` | The id was preserved into a newer build |
| `weak` | Several instances share the id and no instance key distinguishes them, or only a semantic fallback matched |
| `unresolved` | The id is gone, the element is not on this screen, or the boundary is unsupported |

Weak needs human confirmation before a comment is shown as reattached.
Unresolved is never attached to the nearest visual element.

`UIP_ANCHOR_ORPHANED` ("the element left the build") is kept distinct from "it
exists but is not rendered in this view". The first is a triage item; the second
is a route change.

## What travels in an anchor

Hashes, never raw text. An anchor may travel further than the screen it came
from, so the accessible name, the text and the DOM shape are hashed and the
review application captures approved display context separately.

## Boundaries

Open shadow roots are traversed. An iframe, and a custom element exposing no
open root, return `UIP_UNSUPPORTED_BOUNDARY` — the honest answer, where guessing
at the host element would attach feedback to the wrong thing.
