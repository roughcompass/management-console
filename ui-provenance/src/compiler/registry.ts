import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { UipError } from '../core/errors.js'
import { assertSchemaVersion, validateAgainst } from '../core/validate.js'
import type { Registry, RegistryEntry } from '../core/types.js'
import { createSourceId } from '../core/ids.js'
import registrySchema from '../../schemas/registry.schema.json' with { type: 'json' }
import type { ParsedFile, SourceElement } from './ast.js'
import { humanNameOf } from './ast.js'

const SCHEMA = { name: 'registry-1.0', schema: registrySchema as Record<string, unknown> }

export function emptyRegistry(applicationId: string): Registry {
  return { schemaVersion: '1.0', applicationId, entries: [] }
}

/** Stable serialization: two runs over the same registry produce one hash. */
export function serializeRegistry(registry: Registry): string {
  const entries = [...registry.entries].sort((a, b) => (a.sourceId < b.sourceId ? -1 : 1))
  return `${JSON.stringify({ ...registry, entries }, orderedKeys, 2)}\n`
}

function orderedKeys(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
  const record = value as Record<string, unknown>
  return Object.fromEntries(Object.keys(record).sort().map((key) => [key, record[key]]))
}

export function hashRegistry(registry: Registry): string {
  return `sha256:${createHash('sha256').update(serializeRegistry(registry)).digest('hex')}`
}

export async function loadRegistry(path: string, applicationId: string): Promise<Registry> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch {
    return emptyRegistry(applicationId)
  }
  const parsed = JSON.parse(raw) as unknown
  assertSchemaVersion(parsed, '1.0', 'UIP_REGISTRY_OUT_OF_DATE')
  return validateAgainst<Registry>(SCHEMA, parsed, 'UIP_REGISTRY_OUT_OF_DATE')
}

export async function saveRegistry(path: string, registry: Registry): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, serializeRegistry(registry), 'utf8')
}

export interface SyncCounts {
  added: number
  preserved: number
  moved: number
  tombstoned: number
}

export interface SyncResult {
  registry: Registry
  counts: SyncCounts
  /** sourceId assigned to each element, keyed by `${file}#${index}`. */
  assignments: Map<string, string>
  changed: boolean
}

export interface SyncOptions {
  registry: Registry
  files: readonly ParsedFile[]
  ambiguousMatchThreshold: number
  tombstoneRetentionDays: number
  now?: () => string
}

interface Candidate {
  entry: RegistryEntry
  consumed: boolean
}

function keyOf(file: string, index: number): string {
  return `${file}#${index}`
}

function assertNoDuplicateExplicitKeys(files: readonly ParsedFile[]): void {
  const seen = new Map<string, SourceElement>()
  for (const file of files) {
    for (const element of file.elements) {
      if (!element.explicitKey) continue
      const scope = `${file.file}::${element.enclosingComponent}::${element.explicitKey}`
      const previous = seen.get(scope)
      if (previous) {
        throw new UipError(
          'UIP_DUPLICATE_EXPLICIT_KEY',
          `explicit key "${element.explicitKey}" is used twice in ${element.enclosingComponent}`,
          {
            file: file.file,
            component: element.enclosingComponent,
            elementType: element.elementType,
            remediation: 'give each element a distinct data-de-provenance-key',
          },
        )
      }
      seen.set(scope, element)
    }
  }
}

/**
 * The matching order is fixed and runs in phases, not per element: "unique"
 * only means something once every stronger match has already taken its entry.
 *
 * Phase 1 explicit key. Phase 2 exact registry match. Phase 3 one unique
 * structural match inside the same component. Phase 4 one unique move or
 * rename. Anything left is new.
 */
export function syncRegistry(options: SyncOptions): SyncResult {
  const now = options.now ?? (() => new Date().toISOString())
  assertNoDuplicateExplicitKeys(options.files)

  const candidates: Candidate[] = options.registry.entries
    .filter((entry) => entry.status === 'active')
    .map((entry) => ({ entry, consumed: false }))

  const assignments = new Map<string, string>()
  const counts: SyncCounts = { added: 0, preserved: 0, moved: 0, tombstoned: 0 }
  const parentIdOf = (file: ParsedFile, element: SourceElement): string | null =>
    element.parentIndex === null
      ? null
      : (assignments.get(keyOf(file.file, element.parentIndex)) ?? null)

  const ambiguity = (file: string, element: SourceElement, found: Candidate[]): UipError =>
    new UipError(
      'UIP_AMBIGUOUS_IDENTITY',
      `more than one previous identity could match <${element.elementType}> in ${element.enclosingComponent}`,
      {
        file,
        component: element.enclosingComponent,
        elementType: element.elementType,
        candidates: found.map((candidate) => candidate.entry.sourceId),
        remediation: 'add a data-de-provenance-key to the elements involved',
      },
    )

  const take = (candidate: Candidate, file: ParsedFile, element: SourceElement, index: number) => {
    candidate.consumed = true
    const entry = candidate.entry
    entry.order = index
    entry.siblingOrder = element.siblingOrder
    entry.file = file.file
    entry.enclosingComponent = element.enclosingComponent
    entry.elementType = element.elementType
    entry.elementKind = element.elementKind
    entry.explicitKey = element.explicitKey
    entry.astFingerprint = element.fingerprint
    entry.parentSourceId = parentIdOf(file, element)
    entry.humanName = humanNameOf(element)
    assignments.set(keyOf(file.file, index), entry.sourceId)
  }

  /**
   * Among candidates that are otherwise indistinguishable, position decides.
   * Two cells in one row differ by nothing this registry records, so the Nth
   * element takes the Nth identity; a genuine tie is an ambiguity and fails.
   */
  const pickClosest = (
    matches: Candidate[],
    index: number,
    file: ParsedFile,
    element: SourceElement,
  ): Candidate => {
    if (matches.length === 1) return matches[0]!

    // Position among same-type siblings first: wrapping a subtree or adding an
    // element above shifts every absolute index by the same amount, which would
    // otherwise hand each element its neighbour's identity.
    const sameSlot = matches.filter(
      (candidate) => candidate.entry.siblingOrder === element.siblingOrder,
    )
    if (sameSlot.length === 1) return sameSlot[0]!

    const pool = sameSlot.length > 1 ? sameSlot : matches
    const distance = (candidate: Candidate) => Math.abs(candidate.entry.order - index)
    const closest = pool.reduce((best, candidate) =>
      distance(candidate) < distance(best) ? candidate : best,
    )
    const tied = pool.filter((candidate) => distance(candidate) === distance(closest))
    if (tied.length > 1) throw ambiguity(file.file, element, tied)
    return closest
  }

  const unresolved: Array<{ file: ParsedFile; element: SourceElement; index: number }> = []
  for (const file of options.files) {
    file.elements.forEach((element, index) => unresolved.push({ file, element, index }))
  }

  const remaining = () => unresolved.filter((item) => !assignments.has(keyOf(item.file.file, item.index)))

  // Phase 1: explicit key. The authored escape hatch outranks everything.
  for (const { file, element, index } of remaining()) {
    if (!element.explicitKey) continue
    const matches = candidates.filter(
      (candidate) => !candidate.consumed && candidate.entry.explicitKey === element.explicitKey,
    )
    if (matches.length === 0) continue
    const scoped = matches.filter(
      (candidate) => candidate.entry.enclosingComponent === element.enclosingComponent,
    )
    const pool = scoped.length > 0 ? scoped : matches
    if (pool.length > 1) throw ambiguity(file.file, element, pool)
    take(pool[0]!, file, element, index)
    counts.preserved += 1
  }

  // Phase 2: exact match on everything the registry records. Several entries
  // can match exactly - two sibling <ul>s with different class names are
  // identical here, because class names are not identity - so position breaks
  // the tie. Without it the two swap on every run and their children's parent
  // ids churn.
  for (const { file, element, index } of remaining()) {
    const parentSourceId = parentIdOf(file, element)
    const matches = candidates.filter(
      (candidate) =>
        !candidate.consumed &&
        candidate.entry.file === file.file &&
        candidate.entry.enclosingComponent === element.enclosingComponent &&
        candidate.entry.elementType === element.elementType &&
        candidate.entry.parentSourceId === parentSourceId &&
        candidate.entry.astFingerprint === element.fingerprint,
    )
    if (matches.length === 0) continue
    take(pickClosest(matches, index, file, element), file, element, index)
    counts.preserved += 1
  }

  // Phase 3: one unique structural match inside the same component. This is
  // what carries an element whose literal text or props were edited. Where more
  // than one candidate remains, the parent narrows it: two divs in one
  // component are told apart by what encloses them, not by their class names.
  for (const { file, element, index } of remaining()) {
    const sameShape = candidates.filter(
      (candidate) =>
        !candidate.consumed &&
        candidate.entry.file === file.file &&
        candidate.entry.enclosingComponent === element.enclosingComponent &&
        candidate.entry.elementType === element.elementType,
    )
    if (sameShape.length === 0) continue

    const parentSourceId = parentIdOf(file, element)
    const sameParent = sameShape.filter(
      (candidate) => candidate.entry.parentSourceId === parentSourceId,
    )
    const matches = sameShape.length > 1 && sameParent.length > 0 ? sameParent : sameShape
    take(pickClosest(matches, index, file, element), file, element, index)
    counts.preserved += 1
  }

  // Phase 4: a file move or a component rename. Neither changes the
  // fingerprint, which is why the fingerprint excludes both.
  if (options.ambiguousMatchThreshold <= 1) {
    for (const { file, element, index } of remaining()) {
      const matches = candidates.filter(
        (candidate) =>
          !candidate.consumed &&
          candidate.entry.elementType === element.elementType &&
          candidate.entry.astFingerprint === element.fingerprint,
      )
      if (matches.length === 0) continue
      // A move preserves order within the file, so identical siblings keep
      // their relative positions; the evaluation measures whether that ever
      // reattaches an id to the wrong element.
      take(pickClosest(matches, index, file, element), file, element, index)
      counts.moved += 1
    }
  }

  // Phase 5: genuinely new.
  const entries = [...options.registry.entries]
  for (const { file, element, index } of remaining()) {
    const entry: RegistryEntry = {
      sourceId: createSourceId(),
      humanName: humanNameOf(element),
      file: file.file,
      enclosingComponent: element.enclosingComponent,
      elementType: element.elementType,
      elementKind: element.elementKind,
      explicitKey: element.explicitKey,
      astFingerprint: element.fingerprint,
      parentSourceId: parentIdOf(file, element),
      order: index,
      siblingOrder: element.siblingOrder,
      firstSeen: now(),
      status: 'active',
    }
    entries.push(entry)
    assignments.set(keyOf(file.file, index), entry.sourceId)
    counts.added += 1
  }

  // Anything an element no longer claims is tombstoned, never deleted: an
  // anchor pointing at it must resolve to "gone", not to "unknown".
  const timestamp = now()
  for (const candidate of candidates) {
    if (candidate.consumed) continue
    candidate.entry.status = 'tombstoned'
    candidate.entry.tombstonedAt = timestamp
    counts.tombstoned += 1
  }

  const cutoff = Date.parse(timestamp) - options.tombstoneRetentionDays * 86_400_000
  const kept = entries.filter((entry) => {
    if (entry.status !== 'tombstoned' || !entry.tombstonedAt) return true
    return Date.parse(entry.tombstonedAt) >= cutoff
  })

  const registry: Registry = { ...options.registry, entries: kept }
  const changed =
    counts.added + counts.moved + counts.tombstoned > 0 ||
    serializeRegistry(registry) !== serializeRegistry(options.registry)

  return { registry, counts, assignments, changed }
}
