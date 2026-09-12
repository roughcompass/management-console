import { UipError } from '../core/errors.js'
import { assertSchemaVersion, validateAgainst } from '../core/validate.js'
import type { ManifestSourceEntry, ProvenanceConfig, ProvenanceManifest, Registry } from '../core/types.js'
import manifestSchema from '../../schemas/manifest.schema.json' with { type: 'json' }
import type { ParsedFile } from './ast.js'
import { decideInjection } from './transform.js'
import type { InjectionRecord } from './transform.js'

const SCHEMA = { name: 'manifest-1.0', schema: manifestSchema as Record<string, unknown> }

export interface BuildManifestOptions {
  config: ProvenanceConfig
  registry: Registry
  registryHash: string
  files: readonly ParsedFile[]
  assignments: ReadonlyMap<string, string>
  injections: ReadonlyMap<string, InjectionRecord[]>
  packageVersions: Record<string, string>
  commitSha: string
  buildId: string
  catalog?: import('../core/types.js').SaltCatalog
  now?: () => string
}

/**
 * One manifest per build, immutable once emitted. It is the only thing the
 * runtime trusts to turn a source id into a file, a component and a library
 * version.
 */
export function buildManifest(options: BuildManifestOptions): ProvenanceManifest {
  const sources: Record<string, ManifestSourceEntry> = {}

  for (const file of options.files) {
    const records = options.injections.get(file.file) ?? []
    file.elements.forEach((element, index) => {
      const sourceId = options.assignments.get(`${file.file}#${index}`)
      if (!sourceId) return
      const record = records.find((candidate) => candidate.index === index)
      // The decision is a property of the element and the catalog, not of
      // whether this module has been transformed yet.
      const decision = decideInjection(element, options.catalog)
      sources[sourceId] = {
        sourceId,
        humanName: `${element.enclosingComponent}.${element.elementType}`,
        file: element.file,
        line: element.line,
        column: element.column,
        enclosingComponent: element.enclosingComponent,
        elementType: element.elementType,
        elementKind: element.elementKind,
        parentSourceId:
          element.parentIndex === null
            ? null
            : (options.assignments.get(`${file.file}#${element.parentIndex}`) ?? null),
        library: element.library
          ? {
              name: element.library.name,
              version: options.packageVersions[element.library.name] ?? 'unknown',
              component: element.library.component,
            }
          : undefined,
        instrumented: record?.instrumented ?? decision.inject,
        instrumentationNote: record?.note ?? decision.note,
      }
    })
  }

  const manifest: ProvenanceManifest = {
    schemaVersion: '1.0',
    applicationId: options.config.applicationId,
    federation: {
      name: options.config.federation?.name ?? options.config.applicationId,
      role: options.config.federation?.role ?? 'remote',
      exposes: options.config.federation?.exposes ?? [],
    },
    repository: options.config.repository,
    commitSha: options.commitSha,
    buildId: options.buildId,
    packageVersions: options.packageVersions,
    registryHash: options.registryHash,
    generatedAt: (options.now ?? (() => new Date().toISOString()))(),
    sources,
  }

  return validateAgainst<ProvenanceManifest>(SCHEMA, manifest, 'UIP_MANIFEST_MISMATCH')
}

export function parseManifest(raw: unknown): ProvenanceManifest {
  assertSchemaVersion(raw, '1.0', 'UIP_MANIFEST_MISMATCH')
  return validateAgainst<ProvenanceManifest>(SCHEMA, raw, 'UIP_MANIFEST_MISMATCH')
}

export function assertNoProductionInstrumentation(mode: string, enabled: boolean): void {
  if (!enabled) return
  if (mode === 'production') {
    throw new UipError('UIP_PRODUCTION_GUARD', 'instrumentation was requested for a production build', {
      remediation: 'unset DE_UI_PROVENANCE_ENABLED, or build in preview mode',
    })
  }
}
