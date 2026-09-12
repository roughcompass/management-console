import { FeedbackStore } from '@adl/anchor-core';
/**
 * Writes on every store mutation. Saves are coalesced into a microtask because
 * a single reply fires several events, and the reviewer should never wait on
 * persistence to see their own comment.
 */
export function createRepositoryTransport(repository, previewId, onError) {
    let queued = false;
    let latest = [];
    return {
        persist(threads) {
            latest = threads;
            if (queued)
                return;
            queued = true;
            void Promise.resolve().then(async () => {
                queued = false;
                try {
                    await repository.saveThreads(previewId, latest);
                }
                catch (error) {
                    onError?.(error);
                }
            });
        },
    };
}
/**
 * Rebuilds a store from what was persisted, and registers every lock the
 * preview has ever been pinned to. Without that history a thread written three
 * versions ago can only report that it is stale, not what actually moved.
 */
export async function hydrateFeedbackStore(options) {
    const { repository, previewId, lock } = options;
    const [threads, versions] = await Promise.all([
        repository.listThreads(previewId).catch(() => []),
        repository.listPreviewVersions(previewId).catch(() => []),
    ]);
    const store = new FeedbackStore({
        lock,
        buildId: options.buildId,
        threads,
        transport: createRepositoryTransport(repository, previewId, options.onError),
    });
    for (const version of versions)
        store.registerLock(version.lock);
    return store;
}
/** Called once per preview build, so staleness can be explained later. */
export async function recordPreviewVersion(input) {
    const version = {
        id: input.buildId ?? input.lock.id,
        previewId: input.previewId,
        label: input.label,
        lock: input.lock,
        remotes: input.remotes ?? {},
        createdAt: new Date().toISOString(),
    };
    return input.repository.savePreviewVersion(version);
}
//# sourceMappingURL=session.js.map