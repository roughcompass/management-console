import { relative, resolve, sep } from 'node:path'
import { createInjectorBabelPlugin } from '../compiler/babel.js'
import { loadConfig } from '../compiler/config.js'
import { assertNoProductionInstrumentation } from '../compiler/manifest.js'
import { prepareProject } from '../compiler/project.js'
import type { Project } from '../compiler/project.js'
import { isUipError } from '../core/errors.js'
import type { ProvenanceConfig } from '../core/types.js'

/** Structural subset of the Vite plugin surface this uses. */
export interface VitePluginLike {
  name: string
  enforce?: 'pre' | 'post'
  configResolved?(config: {
    root: string
    command: 'serve' | 'build'
    mode?: string
  }): Promise<void> | void
  transform?(
    code: string,
    id: string,
  ): Promise<{ code: string; map?: unknown } | null> | { code: string; map?: unknown } | null
  configureServer?(server: {
    middlewares: {
      use(
        path: string,
        handler: (req: unknown, res: ServerResponseLike, next: () => void) => void,
      ): void
    }
  }): void
  generateBundle?(this: {
    emitFile(file: { type: 'asset'; fileName: string; source: string }): void
  }): void
}

interface ServerResponseLike {
  statusCode: number
  setHeader(name: string, value: string): void
  end(body?: string): void
}

export const MANIFEST_FILE = 'ui-provenance-manifest.json'

export interface ProvenanceViteOptions {
  root?: string
  config?: ProvenanceConfig
  /** Defaults to DE_UI_PROVENANCE_ENABLED === 'true'. */
  enabled?: boolean
  /** Write the registry during a preview build instead of failing on drift. */
  autoSync?: boolean
  manifestPath?: string
  /** A federated host reads every remote's manifest cross-origin. */
  allowOrigin?: string | false
}

export interface UiProvenanceVite {
  /** Add to the Vite plugins array. */
  vitePlugin: VitePluginLike
  /** Pass to @vitejs/plugin-react as babel.plugins[]. */
  babelPlugin: ReturnType<typeof createInjectorBabelPlugin>
}

const INSTRUMENTABLE = /\.(jsx|tsx)$/

function isEnabled(explicit: boolean | undefined): boolean {
  if (explicit !== undefined) return explicit
  return process.env.DE_UI_PROVENANCE_ENABLED === 'true'
}

/**
 * Identity is resolved once in `configResolved`, before any module is
 * transformed, and the manifest is published through `configureServer` in dev
 * and `generateBundle` in build. Injection itself rides the host's JSX pass.
 */
export function createUiProvenanceVite(options: ProvenanceViteOptions = {}): UiProvenanceVite {
  const manifestPath = options.manifestPath ?? MANIFEST_FILE
  const allowOrigin = options.allowOrigin ?? '*'
  let project: Project | null = null
  let root = options.root ?? process.cwd()
  let enabled = false

  const source = {
    elementsFor: (file: string) => project?.elementsFor(file) ?? [],
    idsFor: (file: string) => project?.idsFor(file) ?? new Map<number, string>(),
    get catalog() {
      return project?.catalog
    },
    get enabled() {
      return enabled
    },
  }

  const vitePlugin: VitePluginLike = {
    name: 'de-ui-provenance',

    async configResolved(config) {
      root = resolve(options.root ?? config.root)
      const mode = config.mode ?? (config.command === 'build' ? 'production' : 'development')
      enabled = isEnabled(options.enabled)

      // Runs before anything is loaded, so a production build with a stray
      // flag fails rather than shipping attributes.
      assertNoProductionInstrumentation(mode, enabled && mode === 'production')
      if (!enabled) return

      const loaded = options.config ? { config: options.config } : await loadConfig(root)
      project = await prepareProject({
        root,
        config: loaded.config,
        mode: 'build',
        autoSync: options.autoSync ?? config.command === 'serve',
      })
    },

    // Records which modules the preview actually served, for the manifest's
    // instrumentation notes. Injection happens in the babel pass.
    transform(code, id) {
      if (!enabled || !project) return null
      const [path] = id.split('?')
      if (!path || !INSTRUMENTABLE.test(path)) return null
      const file = relative(root, path).split(sep).join('/')
      if (file.startsWith('..')) return null
      try {
        project.noteServed(file)
      } catch (error) {
        if (isUipError(error)) throw new Error(error.message)
        throw error
      }
      return null
    },

    configureServer(server) {
      server.middlewares.use(`/${manifestPath}`, (_request, response) => {
        if (!project) {
          response.statusCode = 404
          response.end('{}')
          return
        }
        if (allowOrigin !== false) response.setHeader('Access-Control-Allow-Origin', allowOrigin)
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify(project.manifest(), null, 2))
      })
    },

    generateBundle() {
      if (!enabled || !project) return
      this.emitFile({
        type: 'asset',
        fileName: manifestPath,
        source: JSON.stringify(project.manifest(), null, 2),
      })
    },
  }

  return {
    vitePlugin,
    babelPlugin: createInjectorBabelPlugin(source, root),
  }
}

export default createUiProvenanceVite
