import { createContextLock } from '@adl/anchor-core'
import type { BuildArtifactEntry, BuildReport, ContextLockInput } from '@adl/anchor-core'
import { createBabelPlugin } from './babel-plugin.js'
import type { CollectorOptions } from './collector.js'
import { ManifestCollector } from './collector.js'

/** Structural subset of the Vite plugin surface this uses. */
export interface VitePluginLike {
  name: string
  enforce?: 'pre' | 'post'
  configResolved?(config: { root: string }): void
  configureServer?(server: {
    middlewares: {
      use(path: string, handler: (req: unknown, res: ServerResponseLike, next: () => void) => void): void
    }
  }): void
  generateBundle?(
    this: { emitFile(file: { type: 'asset'; fileName: string; source: string }): void },
    options: unknown,
    bundle: Record<string, { type: string; code?: string; source?: string | Uint8Array }>,
  ): void
  handleHotUpdate?(ctx: { file: string }): void
}

interface ServerResponseLike {
  statusCode: number
  setHeader(name: string, value: string): void
  end(body?: string): void
}

export interface ProvenanceViteOptions extends CollectorOptions {
  /** Served in dev and emitted in build under this path. */
  manifestPath?: string
  root?: string
  enabled?: boolean
  /**
   * Pinned inputs for this preview. Emitted next to the manifest so the
   * preview, its feedback and its audit record all name the same lock.
   */
  contextLock?: Omit<ContextLockInput, 'repo'> & { repo?: ContextLockInput['repo'] }
  /** Extra build artifacts to expose for build-artifact anchors. */
  artifacts?: BuildArtifactEntry[]
  /**
   * Origin allowed to read the published files in dev. A federated shell reads
   * every remote's manifest cross-origin, so this defaults to open: these are
   * build metadata for a preview, not application data.
   */
  allowOrigin?: string | false
}

export interface ProvenanceBundle {
  collector: ManifestCollector
  /** Pass to @vitejs/plugin-react as babel.plugins[]. */
  babelPlugin: ReturnType<typeof createBabelPlugin>
  /** Add to the Vite plugins array. */
  vitePlugin: VitePluginLike
}

const DEFAULT_MANIFEST_PATH = '__provenance/manifest.json'

function json(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function serve(res: ServerResponseLike, body: string, allowOrigin: string | false): void {
  if (allowOrigin !== false) res.setHeader('Access-Control-Allow-Origin', allowOrigin)
  res.setHeader('Content-Type', 'application/json')
  res.end(body)
}

/**
 * Wires the build-time half of the provenance contract: the babel plugin that
 * marks host elements, and the bundler plugin that publishes the manifest,
 * the context lock and the build report next to the preview.
 */
export function createProvenance(options: ProvenanceViteOptions): ProvenanceBundle {
  const collector = new ManifestCollector(options)
  const manifestPath = options.manifestPath ?? DEFAULT_MANIFEST_PATH
  const lockPath = manifestPath.replace(/manifest\.json$/, 'context-lock.json')
  const reportPath = manifestPath.replace(/manifest\.json$/, 'build-report.json')
  let root = options.root
  const allowOrigin = options.allowOrigin ?? '*'

  const babelPlugin = createBabelPlugin({
    collector,
    root: options.root,
    enabled: options.enabled ?? true,
  })

  const lockOf = () => {
    if (!options.contextLock) return undefined
    return createContextLock({
      ...options.contextLock,
      repo: options.contextLock.repo ?? { name: options.repo, commit: options.commit },
    })
  }

  const reportOf = (extra: BuildArtifactEntry[] = []): BuildReport => ({
    buildId: collector.buildId,
    commit: options.commit,
    generatedAt: new Date().toISOString(),
    artifacts: [...(options.artifacts ?? []), ...extra],
  })

  const vitePlugin: VitePluginLike = {
    name: 'adl-provenance',
    configResolved(config) {
      root ??= config.root
    },
    configureServer(server) {
      // In dev the manifest grows as modules are transformed, so it is served
      // live rather than written once.
      server.middlewares.use(`/${manifestPath}`, (_req, res) => {
        serve(res, json(collector.toJSON()), allowOrigin)
      })
      server.middlewares.use(`/${lockPath}`, (_req, res) => {
        const lock = lockOf()
        if (!lock) {
          res.statusCode = 404
          res.end('{}')
          return
        }
        serve(res, json(lock), allowOrigin)
      })
      server.middlewares.use(`/${reportPath}`, (_req, res) => {
        serve(res, json(reportOf()), allowOrigin)
      })
    },
    handleHotUpdate(ctx) {
      const file = root && ctx.file.startsWith(root) ? ctx.file.slice(root.length + 1) : ctx.file
      collector.forget(file)
    },
    generateBundle(_options, bundle) {
      const sizes: BuildArtifactEntry[] = Object.entries(bundle)
        .filter(([, chunk]) => chunk.type === 'chunk')
        .map(([fileName, chunk]) => ({
          kind: 'bundle-size' as const,
          name: fileName,
          bytes: chunk.code ? Buffer.byteLength(chunk.code) : 0,
        }))
      this.emitFile({ type: 'asset', fileName: manifestPath, source: json(collector.toJSON()) })
      this.emitFile({ type: 'asset', fileName: reportPath, source: json(reportOf(sizes)) })
      const lock = lockOf()
      if (lock) this.emitFile({ type: 'asset', fileName: lockPath, source: json(lock) })
    },
  }

  return { collector, babelPlugin, vitePlugin }
}
