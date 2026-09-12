import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import type { SaltCatalog, SaltCatalogEntry } from '../core/types.js'

/**
 * Versions are read from the MFE's own resolved dependencies. Hard-coding one
 * Salt version would mean the compiler and the preview disagree the first time
 * a team upgrades, and @salt-ds/lab moves on a different cadence from core.
 */
export async function resolvePackageVersions(
  root: string,
  packages: readonly string[],
): Promise<Record<string, string>> {
  const require = createRequire(`${root}/package.json`)
  const versions: Record<string, string> = {}
  for (const name of packages) {
    try {
      const manifestPath = require.resolve(`${name}/package.json`)
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { version?: string }
      if (manifest.version) versions[name] = manifest.version
    } catch {
      // Not installed in this MFE. Absence is recorded by omission.
    }
  }
  return versions
}

export function emptyCatalog(): SaltCatalog {
  return { schemaVersion: '1.0', generatedAt: new Date().toISOString(), entries: [] }
}

export async function loadCatalog(path: string): Promise<SaltCatalog> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as SaltCatalog
  } catch {
    return emptyCatalog()
  }
}

export function lookupCatalog(
  catalog: SaltCatalog | undefined,
  pkg: string,
  component: string,
): SaltCatalogEntry | undefined {
  return catalog?.entries.find((entry) => entry.package === pkg && entry.component === component)
}

/**
 * The rendered DOM is the contract. A TypeScript prop definition saying a
 * component spreads its rest props is not evidence that the attribute reaches
 * an unambiguous DOM root, so an untested component is never injected into.
 */
export function mayInject(entry: SaltCatalogEntry | undefined): boolean {
  return entry?.compatibility === 'forwards-data-attributes'
}

export function injectionNote(entry: SaltCatalogEntry | undefined): string | undefined {
  if (!entry) return 'no browser-tested compatibility entry for this component'
  switch (entry.compatibility) {
    case 'forwards-data-attributes':
      return undefined
    case 'requires-slot-target':
      return `renders through a slot; documented target ${entry.slotTarget ?? 'unknown'}`
    case 'composite-no-single-root':
      return 'renders multiple roots, so no single node represents the component'
    case 'unsupported':
      return 'does not forward data attributes to any stable DOM root'
  }
}
