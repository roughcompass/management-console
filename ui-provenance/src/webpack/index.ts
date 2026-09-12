import { resolve } from 'node:path'
import { loadConfig } from '../compiler/config.js'
import { assertNoProductionInstrumentation } from '../compiler/manifest.js'
import { prepareProject } from '../compiler/project.js'
import type { ProvenanceConfig } from '../core/types.js'
import { clearProject, getProject, setProject, setStripOnly } from './state.js'

export const MANIFEST_FILE = 'ui-provenance-manifest.json'

/** Structural subset of the Webpack API this plugin uses. */
interface CompilerLike {
  context: string
  options?: { mode?: string; context?: string }
  hooks: {
    beforeCompile: { tapPromise(name: string, fn: () => Promise<void>): void }
    thisCompilation: { tap(name: string, fn: (compilation: CompilationLike) => void): void }
    done: { tap(name: string, fn: () => void): void }
  }
  webpack?: { sources?: { RawSource: new (value: string) => unknown } }
}

interface CompilationLike {
  hooks: {
    processAssets: {
      tap(options: { name: string; stage?: number }, fn: () => void): void
    }
  }
  emitAsset(name: string, source: unknown): void
}

export interface UiProvenanceWebpackOptions {
  root?: string
  config?: ProvenanceConfig
  enabled?: boolean
  autoSync?: boolean
  manifestPath?: string
}

/** The module path to add to the rule for JSX and TSX files. */
export const loaderPath = new URL('./loader.js', import.meta.url).pathname

function isEnabled(explicit: boolean | undefined): boolean {
  if (explicit !== undefined) return explicit
  return process.env.DE_UI_PROVENANCE_ENABLED === 'true'
}

export class UiProvenanceWebpackPlugin {
  constructor(private options: UiProvenanceWebpackOptions = {}) {}

  apply(compiler: CompilerLike): void {
    const name = 'UiProvenanceWebpackPlugin'
    const root = resolve(this.options.root ?? compiler.options?.context ?? compiler.context)
    const manifestPath = this.options.manifestPath ?? MANIFEST_FILE
    const enabled = isEnabled(this.options.enabled)
    const mode = compiler.options?.mode ?? 'development'

    // Same guard as the Vite adapter, at the same point in the build.
    assertNoProductionInstrumentation(mode, enabled && mode === 'production')
    if (!enabled) {
      // The loader stays in the rule either way: with no project to inject
      // from, it strips the authored keys so they never reach the artifact.
      setStripOnly(root)
      compiler.hooks.done.tap(name, () => clearProject(root))
      return
    }

    compiler.hooks.beforeCompile.tapPromise(name, async () => {
      const loaded = this.options.config
        ? { config: this.options.config }
        : await loadConfig(root)
      const project = await prepareProject({
        root,
        config: loaded.config,
        mode: 'build',
        autoSync: this.options.autoSync ?? mode !== 'production',
      })
      setProject(root, project)
    })

    compiler.hooks.thisCompilation.tap(name, (compilation) => {
      compilation.hooks.processAssets.tap({ name }, () => {
        const project = getProject(root)
        if (!project) return
        const RawSource = compiler.webpack?.sources?.RawSource
        const json = JSON.stringify(project.manifest(), null, 2)
        compilation.emitAsset(manifestPath, RawSource ? new RawSource(json) : json)
      })
    })

    compiler.hooks.done.tap(name, () => clearProject(root))
  }
}

export { getProject, setProject } from './state.js'
export { default as uiProvenanceLoader } from './loader.js'
