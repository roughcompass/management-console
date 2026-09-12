import { BUILDS } from './previews'
import type { PreviewBuild } from './previews'

/**
 * The only thing the application shares with the review layer: which preview is
 * pinned right now. It imports nothing from the review packages, so the shell
 * can carry it in a production build where `./review` is never loaded at all.
 */
type Listener = (build: PreviewBuild) => void

let selected: PreviewBuild = BUILDS[0]!
const listeners = new Set<Listener>()

export function selectedPreview(): PreviewBuild {
  return selected
}

export function selectPreview(build: PreviewBuild): void {
  if (build === selected) return
  selected = build
  for (const listener of listeners) listener(build)
}

export function onPreviewChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
