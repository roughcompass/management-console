import type { Actor, CommentThread } from '@adl/anchor-core';
import type { FeedbackRepository, PreviewVersion, StorageDriver } from './types.js';
export declare function memoryDriver(): StorageDriver;
/**
 * Survives a reload, which is the whole point: a reviewer who refreshes the
 * preview must not lose the thread they were in the middle of.
 */
export declare function localStorageDriver(namespace?: string): StorageDriver;
export declare class DriverFeedbackRepository implements FeedbackRepository {
    private driver;
    constructor(driver?: StorageDriver);
    private read;
    private write;
    listUsers(): Promise<Actor[]>;
    saveUser(user: Actor): Promise<void>;
    currentUser(): Promise<Actor | undefined>;
    setCurrentUser(userId: string): Promise<void>;
    listPreviewVersions(previewId: string): Promise<PreviewVersion[]>;
    getPreviewVersion(previewId: string, versionId: string): Promise<PreviewVersion | undefined>;
    savePreviewVersion(version: PreviewVersion): Promise<PreviewVersion>;
    listThreads(previewId: string): Promise<CommentThread[]>;
    saveThreads(previewId: string, threads: readonly CommentThread[]): Promise<void>;
    deleteThread(previewId: string, threadId: string): Promise<void>;
}
export declare function createInMemoryRepository(): FeedbackRepository;
export declare function createLocalStorageRepository(namespace?: string): FeedbackRepository;
//# sourceMappingURL=repository.d.ts.map