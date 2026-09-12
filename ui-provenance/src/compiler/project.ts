import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { UipError } from '../core/errors.js'
import type { ProvenanceConfig, ProvenanceManifest, Registry, SaltCatalog } from '../core/types.js'
import { parseFileElements } from './ast.js'
import type { ParsedFile, SourceElement } from './ast.js'
import { discoverSourceFiles } from './discover.js'
import { buildManifest } from './manifest.js'
import { hashRegistry, loadRegistry, saveRegistry, syncRegistry } from './registry.js'
import type { SyncCounts } from './registry.js'
import { loadCatalog, resolvePackageVersions } from './salt.js'
import { instrumentSource } from './transform.js'
import type { InjectionRecord, InstrumentResult } from './transform.js'

const run = promisify(execFile)

const TRACKED_PACKAGES = [
  'react',
  'react-dom',
  '@module-federation/runtime',
  '@module-federation/vite',
  '@module-federation/enhanced',
]

async function resolveCommitSha(root: string): Promise<string> {
  const fromEnv = process.env.GIT_COMMIT ?? process.env.GITHUB_SHA ?? process.env.BITBUCKET_COMMIT
  if (fromEnv) return fromEnv
  try {
    const { stdout } = await run('git', ['rev-parse', 'HEAD'], { cwd: root })
    return stdout.trim()
  } catch {
    return 'unknown'
  }
}

export type ProjectMode = 'sync' | 'check' | 'build'

export interface PrepareOptions {
  root: string
  config: ProvenanceConfig
  mode: ProjectMode
  /** Build mode only: write the registry instead of failing on drift. */
  autoSync?: boolean
  catalogPath?: string
  now?: () => string
}

export interface Project {
  root: string
  config: ProvenanceConfig
  registry: Registry
  registryHash: string
  files: ParsedFile[]
  counts: SyncCounts
  changed: boolean
  buildId: string
  commitSha: string
  packageVersions: Record<string, string>
  catalog: SaltCatalog
  elementsFor(file: string): readonly SourceElement[]
  idsFor(file: string): Map<number, string>
  instrument(code: string, file: string): InstrumentResult | null
  /** Marks a file as served by this build, for manifest notes. */
  noteServed(file: string): void
  manifest(): ProvenanceManifest
}

/**
 * One analysis pass shared by the CLI and both bundler adapters. Identity is
 * decided here, once, so a Vite build and a Webpack build of the same source
 * cannot disagree about what anything is called.
 */
export async function prepareProject(options: PrepareOptions): Promise<Project> {
  const { root, config, mode } = options
  const paths = await discoverSourceFiles({
    root,
    include: config.include,
    exclude: config.exclude,
  })

  const files: ParsedFile[] = []
  for (const file of paths) {
    const code = await readFile(join(root, file), 'utf8')
    files.push(parseFileElements(code, { file, saltPackages: config.saltPackages }))
  }

  const registryPath = join(root, config.registry)
  const existing = await loadRegistry(registryPath, config.applicationId)
  const sync = syncRegistry({
    registry: existing,
    files,
    ambiguousMatchThreshold: config.ambiguousMatchThreshold,
    tombstoneRetentionDays: config.tombstoneRetentionDays,
    now: options.now,
  })

  if (sync.changed) {
    if (mode === 'check') {
      throw new UipError('UIP_REGISTRY_OUT_OF_DATE', 'the registry does not match the source', {
        applicationId: config.applicationId,
        file: config.registry,
        remediation: 'run: ui-provenance sync, and commit the registry',
      })
    }
    if (mode === 'sync' || options.autoSync) await saveRegistry(registryPath, sync.registry)
    else {
      throw new UipError('UIP_REGISTRY_OUT_OF_DATE', 'the registry does not match the source', {
        applicationId: config.applicationId,
        file: config.registry,
        remediation: 'run: ui-provenance sync before building the preview',
      })
    }
  }

  const registryHash = hashRegistry(sync.registry)
  const commitSha = await resolveCommitSha(root)
  const buildId = `${config.applicationId}-${commitSha.slice(0, 7)}-${Date.now().toString(36)}`
  const packageVersions = await resolvePackageVersions(root, [
    ...TRACKED_PACKAGES,
    ...config.saltPackages,
  ])
  const catalog = await loadCatalog(
    options.catalogPath ?? join(root, '.ui-provenance/salt-catalog.json'),
  )

  const injections = new Map<string, InjectionRecord[]>()
  const byFile = new Map(files.map((file) => [file.file, file]))

  const idsFor = (file: string): Map<number, string> => {
    const parsed = byFile.get(file)
    const ids = new Map<number, string>()
    if (!parsed) return ids
    parsed.elements.forEach((_element, index) => {
      const sourceId = sync.assignments.get(`${file}#${index}`)
      if (sourceId) ids.set(index, sourceId)
    })
    return ids
  }

  return {
    root,
    config,
    registry: sync.registry,
    registryHash,
    files,
    counts: sync.counts,
    changed: sync.changed,
    buildId,
    commitSha,
    packageVersions,
    catalog,
    elementsFor: (file) => byFile.get(file)?.elements ?? [],
    idsFor,
    noteServed(file) {
      if (!byFile.has(file) || injections.has(file)) return
      injections.set(file, [])
    },
    instrument(code, file) {
      const parsed = byFile.get(file)
      if (!parsed) return null
      const result = instrumentSource({
        code,
        file,
        elements: parsed.elements,
        ids: idsFor(file),
        catalog,
      })
      injections.set(file, result.injections)
      return result
    },
    manifest() {
      return buildManifest({
        config,
        registry: sync.registry,
        registryHash,
        files,
        assignments: sync.assignments,
        injections,
        packageVersions,
        commitSha,
        buildId,
        catalog,
        now: options.now,
      })
    },
  }
}
