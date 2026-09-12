import { FeedbackStore } from '@adl/anchor-core';
import type { ContextLock, FeedbackTransport } from '@adl/anchor-core';
import type { FeedbackRepository, PreviewVersion } from './types.js';
/**
 * Writes on every store mutation. Saves are coalesced into a microtask because
 * a single reply fires several events, and the reviewer should never wait on
 * persistence to see their own comment.
 */
export declare function createRepositoryTransport(repository: FeedbackRepository, previewId: string, onError?: (error: unknown) => void): FeedbackTransport;
export interface HydrateOptions {
    repository: FeedbackRepository;
    previewId: string;
    lock: ContextLock;
    buildId?: string;
    onError?: (error: unknown) => void;
}
/**
 * Rebuilds a store from what was persisted, and registers every lock the
 * preview has ever been pinned to. Without that history a thread written three
 * versions ago can only report that it is stale, not what actually moved.
 */
export declare function hydrateFeedbackStore(options: HydrateOptions): Promise<FeedbackStore>;
export interface RecordVersionInput {
    repository: FeedbackRepository;
    previewId: string;
    lock: ContextLock;
    label: string;
    buildId?: string;
    remotes?: PreviewVersion['remotes'];
}
/** Called once per preview build, so staleness can be explained later. */
export declare function recordPreviewVersion(input: RecordVersionInput): Promise<PreviewVersion>;
//# sourceMappingURL=session.d.ts.map