import type { Actor, CommentThread, ContextLock } from '@adl/anchor-core'

/**
 * One deployed, pinned preview: a shell build plus the remote versions it
 * loads. A comment is written against a version, not against a URL.
 */
export interface PreviewVersion {
  id: string
  /** Stable across versions. The thing reviewers keep coming back to. */
  previewId: string
  label: string
  lock: ContextLock
  /** MFE name -> the version and entry the shell actually loaded. */
  remotes: Record<string, { version: string; entry: string }>
  createdAt: string
}

/**
 * The persistence seam. Phase 1 ships the model and two local implementations;
 * the service that implements this same interface over HTTP is not in scope
 * here, and nothing above this line knows which implementation it has.
 */
export interface FeedbackRepository {
  listUsers(): Promise<Actor[]>
  saveUser(user: Actor): Promise<void>
  currentUser(): Promise<Actor | undefined>
  setCurrentUser(userId: string): Promise<void>

  listPreviewVersions(previewId: string): Promise<PreviewVersion[]>
  getPreviewVersion(previewId: string, versionId: string): Promise<PreviewVersion | undefined>
  savePreviewVersion(version: PreviewVersion): Promise<PreviewVersion>

  listThreads(previewId: string): Promise<CommentThread[]>
  saveThreads(previewId: string, threads: readonly CommentThread[]): Promise<void>
  deleteThread(previewId: string, threadId: string): Promise<void>
}

export interface StorageDriver {
  read(key: string): string | null
  write(key: string, value: string): void
}
