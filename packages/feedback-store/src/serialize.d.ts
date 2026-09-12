import type { CommentThread } from '@adl/anchor-core';
/**
 * A resolution holds a live DOM element, which exists only in the build that
 * produced it. Persisting it is meaningless and JSON.stringify would throw on
 * the cycle, so it is dropped on the way out and restored as null on the way in.
 */
export declare function serializeThread(thread: CommentThread): CommentThread;
export declare function serializeThreads(threads: readonly CommentThread[]): CommentThread[];
export declare function reviveThread(thread: CommentThread): CommentThread;
//# sourceMappingURL=serialize.d.ts.map