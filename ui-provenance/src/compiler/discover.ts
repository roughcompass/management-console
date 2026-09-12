import { readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { matchesAny } from './glob.js'

const ALWAYS_SKIPPED = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.vite'])

export interface DiscoverOptions {
  root: string
  include: readonly string[]
  exclude: readonly string[]
}

/**
 * Repository-relative paths, always. A manifest that leaks a developer's home
 * directory is a manifest that cannot be published with a preview.
 */
export function toRepoRelative(root: string, absolute: string): string {
  return relative(root, absolute).split(sep).join('/')
}

/** Walks the tree once. node_modules is never entered, not merely filtered. */
export async function discoverSourceFiles(options: DiscoverOptions): Promise<string[]> {
  const found: string[] = []

  const walk = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.ui-provenance') continue
      const absolute = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (ALWAYS_SKIPPED.has(entry.name)) continue
        await walk(absolute)
        continue
      }
      const path = toRepoRelative(options.root, absolute)
      if (!matchesAny(path, options.include)) continue
      if (matchesAny(path, options.exclude)) continue
      found.push(path)
    }
  }

  await walk(options.root)
  return found.sort()
}
