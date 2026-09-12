/**
 * A resolution holds a live DOM element, which exists only in the build that
 * produced it. Persisting it is meaningless and JSON.stringify would throw on
 * the cycle, so it is dropped on the way out and restored as null on the way in.
 */
export function serializeThread(thread) {
    if (!thread.resolution)
        return { ...thread };
    return { ...thread, resolution: { ...thread.resolution, element: null } };
}
export function serializeThreads(threads) {
    return threads.map(serializeThread);
}
export function reviveThread(thread) {
    // Anchor status is kept as stored; the next re-anchor pass overwrites it.
    return thread.resolution ? { ...thread, resolution: { ...thread.resolution, element: null } } : thread;
}
//# sourceMappingURL=serialize.js.map