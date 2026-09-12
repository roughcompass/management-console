import type { ProvenanceManifest } from '../core/types.js'
import { getProvenanceRuntime } from '../runtime/index.js'
import type { ProvenanceRuntime } from '../runtime/index.js'

export const DEFAULT_MANIFEST_PATH = 'ui-provenance-manifest.json'

export interface ProvenanceFederationOptions {
  /** Defaults to the page-wide runtime. */
  runtime?: ProvenanceRuntime
  /** Where each participant publishes its manifest, relative to its origin. */
  manifestPath?: string
  /** The host's own build. Registered as soon as the plugin initialises. */
  host?: { manifestUrl: string; rootSelector?: string }
  onError?: (error: unknown) => void
}

/** Minimal structural shape of the hook arguments this plugin reads. */
interface RemoteInfoLike {
  name?: string
  entry?: string
}

interface HookArgs {
  remoteInfo?: RemoteInfoLike
  origin?: unknown
  id?: string
  [key: string]: unknown
}

export function manifestUrlForEntry(entry: string, manifestPath = DEFAULT_MANIFEST_PATH): string {
  try {
    return new URL(manifestPath, entry).href
  } catch {
    return `${entry.replace(/\/[^/]*$/, '')}/${manifestPath}`
  }
}

/**
 * Registers a build from its own manifest. Identity comes from the manifest,
 * not from the federation name: two remotes can share a federation name across
 * environments, and the application id is firm-controlled.
 */
export async function registerFromManifestUrl(
  runtime: ProvenanceRuntime,
  manifestUrl: string,
  rootSelector?: string,
): Promise<void> {
  const response = await fetch(manifestUrl)
  if (!response.ok) throw new Error(`${manifestUrl} -> ${response.status}`)
  const manifest = (await response.json()) as ProvenanceManifest
  const root = rootSelector ? (document.querySelector(rootSelector) ?? undefined) : undefined

  await runtime.registerBuild({
    applicationId: manifest.applicationId,
    federationName: manifest.federation.name,
    federationRole: manifest.federation.role,
    buildId: manifest.buildId,
    commitSha: manifest.commitSha,
    manifestUrl,
    root,
  })
}

/**
 * Module Federation 2 runtime plugin. Registration happens on the documented
 * lifecycle hooks - never by reading `window.__FEDERATION__`, which is a
 * debugging surface with no compatibility promise.
 *
 * Pass it through the bundler's `runtimePlugins` option, or register it with
 * `registerPlugins()` from @module-federation/runtime.
 */
export function createProvenanceFederationPlugin(options: ProvenanceFederationOptions = {}) {
  const runtime = options.runtime ?? getProvenanceRuntime()
  const manifestPath = options.manifestPath ?? DEFAULT_MANIFEST_PATH
  const seen = new Set<string>()
  const onError = options.onError ?? (() => {})

  const registerEntry = (entry: string | undefined): void => {
    if (!entry) return
    const url = manifestUrlForEntry(entry, manifestPath)
    if (seen.has(url)) return
    seen.add(url)
    void registerFromManifestUrl(runtime, url).catch((error) => {
      // A remote without an instrumented build is normal: it simply cannot be
      // reviewed, and must not break the host that loaded it.
      seen.delete(url)
      onError(error)
    })
  }

  if (options.host) {
    const { manifestUrl, rootSelector } = options.host
    seen.add(manifestUrl)
    void registerFromManifestUrl(runtime, manifestUrl, rootSelector).catch(onError)
  }

  return {
    name: 'de-ui-provenance',
    version: '0.2.0',
    /** Fires once the remote's entry URL is known. */
    afterResolve(args: HookArgs) {
      registerEntry(args.remoteInfo?.entry)
      return args
    },
    /** Fires when an exposed module is loaded, including lazily. */
    onLoad(args: HookArgs) {
      registerEntry(args.remoteInfo?.entry)
      return args
    },
  }
}

export default createProvenanceFederationPlugin
