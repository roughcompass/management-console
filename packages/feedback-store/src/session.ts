import { FeedbackStore } from '@adl/anchor-core'
import type { ContextLock, FeedbackTransport } from '@adl/anchor-core'
import type { FeedbackRepository, PreviewVersion } from './types.js'

/**
 * Writes on every store mutation. Saves are coalesced into a microtask because
 * a single reply fires several events, and the reviewer should never wait on
 * persistence to see their own comment.
 */
export function createRepositoryTransport(
  repository: FeedbackRepository,
  previewId: string,
  onError?: (error: unknown) => void,
): FeedbackTransport {
  let queued = false
  let latest: Parameters<FeedbackTransport['persist']>[0] = []

  return {
    persist(threads) {
      latest = threads
      if (queued) return
      queued = true
      void Promise.resolve().then(async () => {
        queued = false
        try {
          await repository.saveThreads(previewId, latest)
        } catch (error) {
          onError?.(error)
        }
      })
    },
  }
}

export interface HydrateOptions {
  repository: FeedbackRepository
  previewId: string
  lock: ContextLock
  buildId?: string
  onError?: (error: unknown) => void
}

/**
 * Rebuilds a store from what was persisted, and registers every lock the
 * preview has ever been pinned to. Without that history a thread written three
 * versions ago can only report that it is stale, not what actually moved.
 */
export async function hydrateFeedbackStore(options: HydrateOptions): Promise<FeedbackStore> {
  const { repository, previewId, lock } = options
  const [threads, versions] = await Promise.all([
    repository.listThreads(previewId).catch(() => []),
    repository.listPreviewVersions(previewId).catch(() => []),
  ])

  const store = new FeedbackStore({
    lock,
    buildId: options.buildId,
    threads,
    transport: createRepositoryTransport(repository, previewId, options.onError),
  })
  for (const version of versions) store.registerLock(version.lock)
  return store
}

export interface RecordVersionInput {
  repository: FeedbackRepository
  previewId: string
  lock: ContextLock
  label: string
  buildId?: string
  remotes?: PreviewVersion['remotes']
}

/** Called once per preview build, so staleness can be explained later. */
export async function recordPreviewVersion(input: RecordVersionInput): Promise<PreviewVersion> {
  const version: PreviewVersion = {
    id: input.buildId ?? input.lock.id,
    previewId: input.previewId,
    label: input.label,
    lock: input.lock,
    remotes: input.remotes ?? {},
    createdAt: new Date().toISOString(),
  }
  return input.repository.savePreviewVersion(version)
}
