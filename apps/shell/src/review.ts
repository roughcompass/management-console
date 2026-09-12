import { adaptUiProvenanceManifest, createContextLock, mergeProvenanceManifests } from '@adl/anchor-core'
import type { Actor, BuildReport, ContextLock, ProvenanceManifest } from '@adl/anchor-core'
import { createLocalStorageRepository } from '@adl/feedback-store'
import { PreviewRecorder, declareRuntimeEvents, mountFeedbackToolbar, versionLabel } from '@adl/feedback-ui'
import type { ChangeRequest, FeedbackToolbarHandle, ReviewVersion } from '@adl/feedback-ui'
import { getProvenanceRuntime } from '@de/ui-provenance/runtime'
import { BUILDS } from './previews'
import type { PreviewBuild } from './previews'
import { onRemoteLoaded } from './remotes'
import { onPreviewChange, selectPreview, selectedPreview } from './review-bridge'

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
  theme?: 'light' | 'dark'
}

const locks = new Map<string, ContextLock>()

/** One lock per version: its id is what staleness is measured against. */
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

/**
 * Phase 1 has no agent behind the toolbar, and the next version is already on
 * the shelf: BUILDS[1] is payments-dash after a refactor. So a change request
 * is recorded where the comments are, and then the version it would have
 * produced is revealed. Everything the reviewer does with it after that - keep
 * it, go back, approve it - is real.
 */
const BUILD_MS = 1200

const revealedAt = new Map<string, string>()
const addressing = new Map<string, readonly string[]>()
let revealed = 1

function versions(): ReviewVersion[] {
  return BUILDS.slice(0, revealed).map((build, index) => ({
    id: build.id,
    label: versionLabel(index),
    createdAt: revealedAt.get(build.id) ?? new Date().toISOString(),
    addressing: addressing.get(build.id),
  }))
}

function recordRequest(previewId: string, request: ChangeRequest): void {
  const key = `adl:requests:${previewId}`
  const prior = JSON.parse(localStorage.getItem(key) ?? '[]') as ChangeRequest[]
  localStorage.setItem(key, JSON.stringify([...prior, request]))
  console.info(`[review] change request ${request.id}\n${request.brief}`)
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
  revealedAt.set(build.id, new Date().toISOString())

  let handle: FeedbackToolbarHandle | undefined

  const push = () => {
    const current = selectedPreview()
    const registered = readBuilds()
    handle?.update({
      lock: lockFor(current),
      buildId: current.id,
      label: current.label,
      remotes: remotesOf(current),
      versions: versions(),
      manifest: registered?.manifest,
      buildReport: registered?.report,
    })
  }

  handle = await mountFeedbackToolbar({
    previewRoot: options.previewRoot,
    actor: options.actor,
    previewId: options.previewId,
    lock: lockFor(build),
    buildId: build.id,
    label: build.label,
    remotes: remotesOf(build),
    versions: versions(),
    repository: createLocalStorageRepository(),
    recorder,
    captureCrops: true,
    theme: options.theme ?? 'dark',

    onViewVersion(versionId) {
      const next = BUILDS.find((entry) => entry.id === versionId)
      if (next) selectPreview(next)
    },

    async onRequestChanges(request) {
      recordRequest(options.previewId, request)
      if (revealed >= BUILDS.length) return
      const next = BUILDS[revealed]!
      await new Promise((resolve) => setTimeout(resolve, BUILD_MS))
      revealed += 1
      revealedAt.set(next.id, new Date().toISOString())
      addressing.set(
        next.id,
        request.comments.map((comment) => comment.commentId),
      )
      selectPreview(next)
    },

    onApprove(version) {
      localStorage.setItem(
        `adl:approved:${options.previewId}`,
        JSON.stringify({ versionId: version.id, at: version.approvedAt }),
      )
      console.info(`[review] ${version.label} approved for deployment`)
    },
  })

  push()
  // The version on screen has to reach the toolbar the moment it changes, not
  // on the next poll: everything the reviewer then does - approving, going
  // back - is about the version she is looking at.
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
      handle?.destroy()
    },
  }
}
