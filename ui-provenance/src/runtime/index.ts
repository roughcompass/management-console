import { ATTR } from '../core/attributes.js'
import { resolveConfidence } from '../core/confidence.js'
import { UipError, isUipError } from '../core/errors.js'
import type { ProvenanceDiagnostic } from '../core/errors.js'
import type {
  AnchorFallback,
  AnchorResolution,
  FederatedBuildRegistration,
  ProvenanceAnchor,
  ProvenanceManifest,
} from '../core/types.js'
import { assertSchemaVersion } from '../core/validate.js'
import {
  accessibleNameOf,
  accessibleRoleOf,
  checkBoundary,
  composedAncestors,
  cssEscape,
  deepElementFromPoint,
  domShapeOf,
  instanceKeyOf,
  nearestWithAttribute,
} from './dom.js'
import { normalizeText, sha256Short } from './hash.js'

export interface RegisteredBuild extends FederatedBuildRegistration {
  manifest: ProvenanceManifest
  registeredAt: string
}

export interface ProvenanceRuntime {
  registerBuild(build: FederatedBuildRegistration): Promise<void>
  unregisterBuild(applicationId: string, buildId: string): void
  resolveElement(element: Element): Promise<AnchorResolution>
  resolvePoint(x: number, y: number): Promise<AnchorResolution>
  reResolve(anchor: ProvenanceAnchor): Promise<AnchorResolution>
  getDiagnostics(): ProvenanceDiagnostic[]
  /** Registered builds, newest first. Exposed for the review layer's chrome. */
  getBuilds(): RegisteredBuild[]
}

export interface RuntimeOptions {
  fetchManifest?: (url: string) => Promise<unknown>
  now?: () => string
  maxDiagnostics?: number
}

const RUNTIME_KEY = Symbol.for('@de/ui-provenance/runtime')

function buildKey(applicationId: string, buildId: string): string {
  return `${applicationId}/${buildId}`
}

export function createProvenanceRuntime(options: RuntimeOptions = {}): ProvenanceRuntime {
  const now = options.now ?? (() => new Date().toISOString())
  const maxDiagnostics = options.maxDiagnostics ?? 200
  const builds = new Map<string, RegisteredBuild>()
  const diagnostics: ProvenanceDiagnostic[] = []

  const record = (error: UipError): ProvenanceDiagnostic => {
    const diagnostic = error.toDiagnostic()
    diagnostics.unshift(diagnostic)
    diagnostics.length = Math.min(diagnostics.length, maxDiagnostics)
    return diagnostic
  }

  const fetchManifest =
    options.fetchManifest ??
    (async (url: string) => {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`${url} -> ${response.status}`)
      return response.json() as Promise<unknown>
    })

  const findBuildForSourceId = (sourceId: string): RegisteredBuild | undefined => {
    for (const build of builds.values()) {
      if (build.manifest.sources[sourceId]) return build
    }
    return undefined
  }

  const ownerOf = (element: Element): RegisteredBuild | undefined => {
    const root = nearestWithAttribute(element, ATTR.applicationId)
    if (!root) return undefined
    const applicationId = root.getAttribute(ATTR.applicationId)
    const buildId = root.getAttribute(ATTR.buildId)
    if (!applicationId || !buildId) return undefined
    return builds.get(buildKey(applicationId, buildId))
  }

  const fallbackOf = async (element: Element): Promise<AnchorFallback> => {
    const box = element.getBoundingClientRect?.()
    const name = normalizeText(accessibleNameOf(element))
    const text = normalizeText(element.textContent ?? '')
    return {
      route: `${location.pathname}${location.hash}`,
      accessibleRole: accessibleRoleOf(element),
      accessibleNameHash: name ? await sha256Short(name) : undefined,
      textHash: text ? await sha256Short(text) : undefined,
      domShapeHash: await sha256Short(domShapeOf(element)),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      boundingBox: box
        ? {
            x: Math.round(box.x),
            y: Math.round(box.y),
            width: Math.round(box.width),
            height: Math.round(box.height),
          }
        : undefined,
    }
  }

  const countInstances = (sourceId: string): number =>
    document.querySelectorAll(`[${ATTR.sourceId}="${cssEscape(sourceId)}"]`).length

  const anchorFor = async (
    element: Element,
    sourceId: string | undefined,
    build: RegisteredBuild,
    extra: { sameBuild: boolean },
  ): Promise<AnchorResolution> => {
    const entry = sourceId ? build.manifest.sources[sourceId] : undefined
    const instanceKey = instanceKeyOf(element)
    const confidence = resolveConfidence({
      sourceIdPresent: Boolean(entry),
      sameApplication: true,
      sameBuild: extra.sameBuild,
      uniqueInstance: sourceId ? countInstances(sourceId) === 1 : false,
      instanceKeyMatched: Boolean(instanceKey),
      uniqueFallback: false,
    })

    if (confidence.confidence === 'weak' && sourceId && !instanceKey) {
      record(
        new UipError('UIP_INSTANCE_AMBIGUOUS', 'several rendered instances share this source id', {
          applicationId: build.applicationId,
          sourceId,
          remediation: 'add data-de-instance-key to the repeated element',
        }),
      )
    }

    const anchor: ProvenanceAnchor = {
      schemaVersion: '1.0',
      applicationId: build.applicationId,
      federationName: build.federationName,
      buildId: build.buildId,
      commitSha: build.commitSha,
      sourceId,
      instanceKey,
      humanName: entry?.humanName,
      source: entry
        ? {
            file: entry.file,
            line: entry.line,
            column: entry.column,
            enclosingComponent: entry.enclosingComponent,
            elementType: entry.elementType,
          }
        : undefined,
      library: entry?.library,
      fallback: await fallbackOf(element),
      confidence: confidence.confidence,
      resolutionReason: confidence.reason,
    }

    return {
      anchor,
      element,
      confidence: anchor.confidence,
      resolutionReason: anchor.resolutionReason,
      diagnostics: [],
    }
  }

  const unresolved = (reason: string, diagnostic?: ProvenanceDiagnostic): AnchorResolution => ({
    confidence: 'unresolved',
    resolutionReason: reason,
    diagnostics: diagnostic ? [diagnostic] : [],
  })

  return {
    async registerBuild(build) {
      const raw = await fetchManifest(build.manifestUrl)
      assertSchemaVersion(raw, '1.0', 'UIP_MANIFEST_MISMATCH')
      const manifest = raw as ProvenanceManifest
      if (manifest.applicationId !== build.applicationId || manifest.buildId !== build.buildId) {
        throw new UipError(
          'UIP_MANIFEST_MISMATCH',
          `manifest at ${build.manifestUrl} describes ${manifest.applicationId}/${manifest.buildId}`,
          {
            applicationId: build.applicationId,
            remediation: 'point the registration at the manifest emitted by this exact build',
          },
        )
      }

      // Keyed by application and build, so two remotes with the same federation
      // name, or two builds of one remote, cannot overwrite each other.
      builds.set(buildKey(build.applicationId, build.buildId), {
        ...build,
        manifest,
        registeredAt: now(),
      })

      if (build.root) {
        build.root.setAttribute(ATTR.applicationId, build.applicationId)
        build.root.setAttribute(ATTR.buildId, build.buildId)
      }
    },

    unregisterBuild(applicationId, buildId) {
      const key = buildKey(applicationId, buildId)
      const build = builds.get(key)
      if (build?.root) {
        build.root.removeAttribute(ATTR.applicationId)
        build.root.removeAttribute(ATTR.buildId)
      }
      builds.delete(key)
    },

    async resolveElement(element) {
      const boundary = checkBoundary(element)
      if (boundary.unsupported) {
        return unresolved(
          boundary.reason ?? 'unsupported boundary',
          record(
            new UipError('UIP_UNSUPPORTED_BOUNDARY', boundary.reason ?? 'unsupported boundary', {
              remediation: 'select an element inside an instrumented, same-document tree',
            }),
          ),
        )
      }

      // 1 and 2: the attribute on the element, then the nearest one above it,
      // crossing open shadow boundaries.
      const carrier = nearestWithAttribute(element, ATTR.sourceId)
      const sourceId = carrier?.getAttribute(ATTR.sourceId) ?? undefined

      // The attribute outranks the mount root: a host's root encloses every
      // remote on the page, so trusting it first would attribute a remote's
      // element to the shell.
      const owner = (sourceId ? findBuildForSourceId(sourceId) : undefined) ?? ownerOf(element)
      if (!owner) {
        return unresolved(
          'element does not belong to a registered MFE',
          record(
            new UipError('UIP_REMOTE_UNREGISTERED', 'no registered build owns this element', {
              remediation: 'register the MFE build before resolving elements inside it',
            }),
          ),
        )
      }

      // 4: inside a known MFE but with no instrumented ancestor.
      if (!sourceId) {
        const resolution = await anchorFor(element, undefined, owner, { sameBuild: true })
        return { ...resolution, confidence: 'unresolved' }
      }

      return anchorFor(carrier ?? element, sourceId, owner, { sameBuild: true })
    },

    async resolvePoint(x, y) {
      const element = deepElementFromPoint(x, y)
      if (!element) return unresolved('no element at that point')
      return this.resolveElement(element)
    },

    async reResolve(anchor) {
      if (!anchor.sourceId) {
        return unresolved('anchor carries no source id; semantic fallback is the review layer\'s call')
      }

      const selector = `[${ATTR.sourceId}="${cssEscape(anchor.sourceId)}"]`
      const rendered = [...document.querySelectorAll(selector)]
      const current =
        findBuildForSourceId(anchor.sourceId) ??
        [...builds.values()].find((build) => build.applicationId === anchor.applicationId)

      if (!current) {
        return unresolved(
          'no registered build for this application',
          record(
            new UipError('UIP_REMOTE_UNREGISTERED', 'anchor application is not registered', {
              applicationId: anchor.applicationId,
              sourceId: anchor.sourceId,
            }),
          ),
        )
      }

      const known = Boolean(current.manifest.sources[anchor.sourceId])
      if (!known) {
        return unresolved(
          'source id no longer exists in this build',
          record(
            new UipError('UIP_ANCHOR_ORPHANED', 'the element this anchor names is gone', {
              applicationId: anchor.applicationId,
              sourceId: anchor.sourceId,
              remediation: 'triage the comment against the crop the review layer captured',
            }),
          ),
        )
      }

      if (rendered.length === 0) {
        // Present in the build but not on screen: a different route, or a
        // collapsed branch. Not an orphan, and not attachable either.
        return unresolved('element exists in this build but is not rendered in this view')
      }

      const matched = anchor.instanceKey
        ? rendered.filter(
            (element) => element.getAttribute(ATTR.instanceKey) === anchor.instanceKey,
          )
        : rendered

      const target = matched[0] ?? rendered[0]!
      const confidence = resolveConfidence({
        sourceIdPresent: true,
        sameApplication: anchor.applicationId === current.applicationId,
        sameBuild: anchor.buildId === current.buildId,
        uniqueInstance: rendered.length === 1,
        instanceKeyMatched: Boolean(anchor.instanceKey) && matched.length === 1,
      })

      if (confidence.confidence === 'weak') {
        record(
          new UipError('UIP_INSTANCE_AMBIGUOUS', 'several instances match and no instance key does', {
            applicationId: anchor.applicationId,
            sourceId: anchor.sourceId,
            remediation: 'add data-de-instance-key to the repeated element',
          }),
        )
      }

      const entry = current.manifest.sources[anchor.sourceId]!
      return {
        anchor: {
          ...anchor,
          buildId: current.buildId,
          commitSha: current.commitSha,
          humanName: entry.humanName,
          source: {
            file: entry.file,
            line: entry.line,
            column: entry.column,
            enclosingComponent: entry.enclosingComponent,
            elementType: entry.elementType,
          },
          library: entry.library,
          confidence: confidence.confidence,
          resolutionReason: confidence.reason,
        },
        element: target,
        confidence: confidence.confidence,
        resolutionReason: confidence.reason,
        diagnostics: [],
      }
    },

    getDiagnostics() {
      return [...diagnostics]
    },

    getBuilds() {
      return [...builds.values()].sort((a, b) => (a.registeredAt < b.registeredAt ? 1 : -1))
    },
  }
}

/**
 * One runtime per page, shared by the host and every remote. Keyed on a global
 * symbol rather than a module-level variable because each federated build may
 * load its own copy of this module.
 */
export function getProvenanceRuntime(options?: RuntimeOptions): ProvenanceRuntime {
  const host = globalThis as unknown as Record<symbol, ProvenanceRuntime | undefined>
  const existing = host[RUNTIME_KEY]
  if (existing) return existing
  const runtime = createProvenanceRuntime(options)
  host[RUNTIME_KEY] = runtime
  return runtime
}

export { isUipError }
export type { ProvenanceAnchor, AnchorResolution, FederatedBuildRegistration }
