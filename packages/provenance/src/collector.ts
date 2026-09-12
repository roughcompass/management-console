import { fnv1a } from '@adl/anchor-core'
import type { ProvenanceManifest, ProvenanceNodeEntry } from '@adl/anchor-core'

export interface CollectorOptions {
  repo: string
  commit: string
  buildId?: string
}

export interface RecordInput {
  file: string
  component: string
  element: string
  line: number
  column: number
}

/**
 * Accumulates the manifest as the build transforms modules. Held outside the
 * babel plugin so the bundler plugin can serve the same object in dev and emit
 * it as an asset in build.
 */
export class ManifestCollector {
  private manifest: ProvenanceManifest

  constructor(options: CollectorOptions) {
    this.manifest = {
      version: 1,
      repo: options.repo,
      commit: options.commit,
      buildId: options.buildId ?? `${options.commit}-${Date.now().toString(36)}`,
      modules: {},
      nodes: {},
    }
  }

  /** Short, stable, path-derived. Same file always yields the same module id. */
  moduleId(file: string): string {
    return fnv1a(file).slice(0, 8)
  }

  record(input: RecordInput): { token: string; moduleId: string } {
    const moduleId = this.moduleId(input.file)
    const token = `${moduleId}:${input.line}:${input.column}`
    this.manifest.modules[moduleId] = { file: input.file }
    const entry: ProvenanceNodeEntry = {
      module: moduleId,
      component: input.component,
      element: input.element,
      line: input.line,
      column: input.column,
    }
    this.manifest.nodes[token] = entry
    return { token, moduleId }
  }

  /** Drop a module's nodes before re-transforming it, so HMR cannot leave stale entries. */
  forget(file: string): void {
    const moduleId = this.moduleId(file)
    delete this.manifest.modules[moduleId]
    for (const token of Object.keys(this.manifest.nodes)) {
      if (this.manifest.nodes[token]?.module === moduleId) delete this.manifest.nodes[token]
    }
  }

  toJSON(): ProvenanceManifest {
    return this.manifest
  }

  get size(): number {
    return Object.keys(this.manifest.nodes).length
  }
}
