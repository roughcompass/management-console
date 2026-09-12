# Troubleshooting

## `UIP_AMBIGUOUS_IDENTITY`

Two prior identities could equally claim one element. The diagnostic names the
candidates.

Add `data-de-provenance-key` to the elements involved and re-run `sync`. The key
outranks everything else, and follows the element through moves and rewrites.

This is deliberately a failure rather than a guess: silently choosing one is how
a comment ends up on the wrong control.

## `UIP_REGISTRY_OUT_OF_DATE`

The source and the committed registry disagree, and `check` will not write.

```bash
ui-provenance sync && git add .ui-provenance/registry.json
```

In dev, the Vite adapter syncs for you. In CI it does not, on purpose: identity
belongs in the diff.

## `UIP_DUPLICATE_EXPLICIT_KEY`

Two elements in one component use the same key. Keys are unique per component,
not per file — the same key in two components is legal.

## `UIP_REMOTE_UNREGISTERED`

The selected element belongs to no registered build. Usually one of:

- The MFE was built without `DE_UI_PROVENANCE_ENABLED=true`.
- The host is not loading the runtime plugin, so the remote never registered.
- The remote's manifest is not reachable from the host's origin. It is served
  with `Access-Control-Allow-Origin: *` in dev; check the network tab.

## `UIP_MANIFEST_MISMATCH`

The manifest at that URL describes a different application or build than the
registration claimed. A stale asset on a CDN path is the usual cause. The
manifest is immutable per build, so the fix is to point at the right one, never
to relax the check.

## `UIP_UNSUPPORTED_BOUNDARY`

An iframe, or a custom element with no open shadow root. Phase 1 does not reach
through either. An instrumented iframe can participate through a separately
versioned postMessage protocol; that is not built.

## `UIP_INSTANCE_AMBIGUOUS`

Several rendered instances share one source id and nothing tells them apart. Add
`data-de-instance-key` to the repeated element. Until then the anchor is capped
at `weak` and needs confirmation before it is shown as reattached.

## `UIP_PRODUCTION_GUARD`

A production build was asked for instrumentation. Unset
`DE_UI_PROVENANCE_ENABLED`, or build with `--mode preview`.

## A Salt component resolves to its parent, not itself

It is not in the compatibility catalog, so the compiler would not guess which
internal node represents it. Run the compatibility suite for your installed Salt
version; if the component renders several roots or a slot, it stays uninstrumented
and the anchor resolves to the nearest instrumented ancestor.

## Comments orphan after a refactor

Check `sync` output. `moved` counts identities carried through a file move or
rename; `added` plus `tombstoned` in the same run usually means the matcher could
not connect the two, and an explicit key on the element would have.
