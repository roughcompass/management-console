import { adaptUiProvenanceManifest, createContextLock, mergeProvenanceManifests } from '@adl/anchor-core'
import type { Actor, BuildReport, ContextLock, ProvenanceManifest } from '@adl/anchor-core'
import { createLocalStorageRepository } from '@adl/feedback-store'
import { PreviewRecorder, declareRuntimeEvents, mountFeedbackToolbar } from '@adl/feedback-ui'
import type { FeedbackToolbarHandle } from '@adl/feedback-ui'
import { getProvenanceRuntime } from '@de/ui-provenance/runtime'
import type { PreviewBuild } from './previews'
import { onRemoteLoaded } from './remotes'
import { onPreviewChange, selectedPreview } from './review-bridge'

/**
 * The whole review layer, in one module nothing in the application imports
 * statically. A preview build loads it; a production build never reaches the
 * dynamic import that does, so none of this - and none of the provenance
 * attribute names it knows - is in the artifact.
 */
export interface StartReviewOptions {
  previewRoot: string
  previewId: string
  actor: Actor
  /** Application events the recorder should treat as runtime activity. */
  runtimeEvents: readonly string[]
  mode?: 'light' | 'dark'
}

const locks = new Map<string, ContextLock>()

/** One lock per pinned build: its id is what staleness is measured against. */
function lockFor(build: PreviewBuild): ContextLock {
  const existing = locks.get(build.id)
  if (existing) return existing
  const lock = createContextLock(build.lock)
  locks.set(build.id, lock)
  return lock
}

function remotesOf(build: PreviewBuild) {
  return Object.fromEntries(
    Object.entries(build.remotes).map(([name, pin]) => [
      name,
      { version: pin.version, entry: pin.entry },
    ]),
  )
}

/**
 * The instrumenter's runtime already holds every registered build's manifest,
 * so the toolbar reads them from there rather than fetching them a second time
 * - and it learns about a remote at the moment federation does.
 */
function readBuilds(): { manifest: ProvenanceManifest; report: BuildReport } | undefined {
  const builds = getProvenanceRuntime().getBuilds()
  if (builds.length === 0) return undefined
  return {
    manifest: mergeProvenanceManifests(
      ...builds.map((build) => adaptUiProvenanceManifest(build.manifest as never)),
    ),
    report: {
      buildId: builds.map((build) => build.buildId).join('+'),
      commit: builds[0]!.commitSha,
      generatedAt: new Date().toISOString(),
      artifacts: [
        ...builds.map((build) => ({
          kind: 'remote' as const,
          name: `${build.applicationId} (${build.federationRole})`,
          value: build.manifestUrl,
        })),
        ...Object.entries(builds[0]!.manifest.packageVersions ?? {}).map(([name, version]) => ({
          kind: 'dependency' as const,
          name,
          value: String(version),
        })),
      ],
    },
  }
}

export interface ReviewSession {
  recorder: PreviewRecorder
  stop(): void
}

export async function startReview(options: StartReviewOptions): Promise<ReviewSession> {
  declareRuntimeEvents([...options.runtimeEvents])
  // Started before anything else loads: the remote entry fetches and the first
  // data calls are exactly what a developer wants to comment on.
  const recorder = new PreviewRecorder()
  recorder.start()

  const build = selectedPreview()
  const handle: FeedbackToolbarHandle = await mountFeedbackToolbar({
    previewRoot: options.previewRoot,
    actor: options.actor,
    previewId: options.previewId,
    lock: lockFor(build),
    buildId: build.id,
    label: build.label,
    remotes: remotesOf(build),
    repository: createLocalStorageRepository(),
    recorder,
    captureCrops: true,
    mode: options.mode ?? 'dark',
  })

  const push = () => {
    const current = selectedPreview()
    const registered = readBuilds()
    handle.update({
      lock: lockFor(current),
      buildId: current.id,
      label: current.label,
      remotes: remotesOf(current),
      manifest: registered?.manifest,
      buildReport: registered?.report,
    })
  }

  push()
  const unsubscribePreview = onPreviewChange(push)
  const unsubscribeRemote = onRemoteLoaded(push)
  // Registration is asynchronous and driven by federation, not by React.
  const timer = setInterval(push, 1000)

  return {
    recorder,
    stop() {
      unsubscribePreview()
      unsubscribeRemote()
      clearInterval(timer)
      handle.destroy()
    },
  }
}
