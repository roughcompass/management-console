import { diffContextLock, isStale } from './context-lock.js'
import { createId } from './ids.js'
import type { ResolutionContext } from './index-dom.js'
import type { OrphanSnapshot } from './orphan-meter.js'
import { OrphanMeter } from './orphan-meter.js'
import { resolveAnchor } from './resolve.js'
import type {
  Actor,
  AnchorDescriptor,
  Comment,
  CommentThread,
  ContextLock,
  Layer,
} from './types.js'

export type FeedbackEvent =
  | { type: 'thread-created'; thread: CommentThread }
  | { type: 'thread-updated'; thread: CommentThread }
  | { type: 'comment-added'; thread: CommentThread; comment: Comment }
  | { type: 'reanchored'; buildId: string; snapshot: OrphanSnapshot }

export type FeedbackListener = (event: FeedbackEvent) => void

export interface FeedbackTransport {
  /** Called after every mutation. Persistence is the host's problem, not ours. */
  persist(threads: CommentThread[]): void
}

export interface FeedbackStoreOptions {
  lock: ContextLock
  buildId?: string
  meter?: OrphanMeter
  transport?: FeedbackTransport
  threads?: CommentThread[]
  now?: () => string
}

export interface CreateThreadInput {
  anchor: AnchorDescriptor
  author: Actor
  body: string
  /** Named accountable owner. Defaults to the author, never to nobody. */
  owner?: Actor
  layerHint?: Layer
}

/**
 * Phase 1 keeps every comment in one place with its anchor, its owner and the
 * lock it was written against. No agent reads it yet; the point is to prove the
 * anchor model holds across rebuilds before anything expensive is built on it.
 */
export class FeedbackStore {
  readonly meter: OrphanMeter
  private lockValue: ContextLock
  private buildIdValue: string
  private threadMap = new Map<string, CommentThread>()
  private knownLocks = new Map<string, ContextLock>()
  private listeners = new Set<FeedbackListener>()
  private transport?: FeedbackTransport
  private now: () => string

  constructor(options: FeedbackStoreOptions) {
    this.lockValue = options.lock
    this.buildIdValue = options.buildId ?? options.lock.id
    this.meter = options.meter ?? new OrphanMeter()
    this.transport = options.transport
    this.now = options.now ?? (() => new Date().toISOString())
    this.knownLocks.set(options.lock.id, options.lock)
    for (const thread of options.threads ?? []) this.threadMap.set(thread.id, thread)
  }

  get lock(): ContextLock {
    return this.lockValue
  }

  get buildId(): string {
    return this.buildIdValue
  }

  /** Keep prior locks so staleness can be reported as a diff, not a boolean. */
  registerLock(lock: ContextLock): void {
    this.knownLocks.set(lock.id, lock)
  }

  threads(): CommentThread[] {
    return [...this.threadMap.values()]
  }

  thread(id: string): CommentThread | undefined {
    return this.threadMap.get(id)
  }

  createThread(input: CreateThreadInput): CommentThread {
    const id = createId('thr')
    const createdAt = this.now()
    const comment: Comment = {
      id: createId('cmt'),
      threadId: id,
      author: input.author,
      body: input.body,
      createdAt,
    }
    const thread: CommentThread = {
      id,
      anchor: input.anchor,
      owner: input.owner ?? input.author,
      comments: [comment],
      createdAt,
      status: 'open',
      anchorStatus: 'resolved',
      stale: isStale(input.anchor.contextLockId, this.lockValue),
      layerHint: input.layerHint,
    }
    this.threadMap.set(id, thread)
    this.emit({ type: 'thread-created', thread })
    return thread
  }

  addComment(threadId: string, author: Actor, body: string): Comment {
    const thread = this.require(threadId)
    const comment: Comment = {
      id: createId('cmt'),
      threadId,
      author,
      body,
      createdAt: this.now(),
    }
    thread.comments = [...thread.comments, comment]
    this.emit({ type: 'comment-added', thread, comment })
    return comment
  }

  setStatus(threadId: string, status: CommentThread['status']): CommentThread {
    const thread = this.require(threadId)
    thread.status = status
    this.emit({ type: 'thread-updated', thread })
    return thread
  }

  reassign(threadId: string, owner: Actor): CommentThread {
    const thread = this.require(threadId)
    thread.owner = owner
    this.emit({ type: 'thread-updated', thread })
    return thread
  }

  /**
   * Run the whole open set through the chain against a new build. Returns the
   * orphan snapshot for that build so a preview can show the number instead of
   * a designer discovering it by scrolling.
   *
   * Pass `record: false` to re-resolve without metering, for the passes that
   * only keep pins attached as the preview's DOM moves under them.
   */
  reanchor(
    ctx: ResolutionContext,
    meta: { buildId?: string; record?: boolean } = {},
  ): OrphanSnapshot {
    const buildId = meta.buildId ?? ctx.lock.id
    this.lockValue = ctx.lock
    this.buildIdValue = buildId
    this.registerLock(ctx.lock)

    for (const thread of this.threadMap.values()) {
      if (thread.status === 'resolved') continue
      const resolution = resolveAnchor(thread.anchor, ctx)
      thread.resolution = resolution
      thread.anchorStatus = resolution.status
      thread.stale = isStale(thread.anchor.contextLockId, ctx.lock)
      const capturedLock = this.knownLocks.get(thread.anchor.contextLockId)
      thread.staleAgainst = capturedLock ? diffContextLock(capturedLock, ctx.lock) : undefined
      // Only one pass per build is metered. A preview re-resolves whenever its
      // DOM churns - a lazy remote arriving, data loading - and counting those
      // would report an orphan rate for a half-rendered page.
      if (meta.record !== false) this.meter.record(resolution, { buildId, lockId: ctx.lock.id })
    }

    const snapshot = this.meter.snapshot(buildId)
    this.emit({ type: 'reanchored', buildId, snapshot })
    return snapshot
  }

  subscribe(listener: FeedbackListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  toJSON(): { lock: ContextLock; buildId: string; threads: CommentThread[] } {
    return { lock: this.lockValue, buildId: this.buildIdValue, threads: this.threads() }
  }

  private require(threadId: string): CommentThread {
    const thread = this.threadMap.get(threadId)
    if (!thread) throw new Error(`unknown thread ${threadId}`)
    return thread
  }

  private emit(event: FeedbackEvent): void {
    for (const listener of this.listeners) listener(event)
    this.transport?.persist(this.threads())
  }
}
