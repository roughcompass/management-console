import {
  FeedbackStore,
  captureAnchor,
  captureElementImage,
  captureNonVisualAnchor,
  createResolutionContext,
  resolveAnchor,
} from '@adl/anchor-core'
import type {
  Actor,
  BuildReport,
  CommentThread,
  ContextLock,
  Layer,
  NonVisualTarget,
  OrphanSnapshot,
  ProvenanceManifest,
  ResolutionContext,
  ScreenshotOptions,
} from '@adl/anchor-core'
import type { FeedbackRepository, PreviewVersion } from '@adl/feedback-store'
import { recordPreviewVersion } from '@adl/feedback-store'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { buildChangeRequest } from './change-request.js'
import type { ChangeRequest } from './change-request.js'
import { PreviewRecorder } from './instrumentation.js'
import { isLatest, versionLabel } from './versions.js'
import type { ReviewVersion } from './versions.js'

export interface RefreshInput {
  lock?: ContextLock
  manifest?: ProvenanceManifest
  buildId?: string
  label?: string
  remotes?: PreviewVersion['remotes']
  /** False re-resolves without metering. Defaults to true. */
  record?: boolean
}

/**
 * Comment mode is where a reviewer starts: she followed a link to look at the
 * page and say what is wrong with it, so clicking means commenting until she
 * says otherwise. Browse hands the page back so she can use it.
 */
export type ReviewMode = 'comment' | 'browse'

export interface FeedbackContextValue {
  actor: Actor
  previewId: string
  previewRef: RefObject<HTMLElement | null>
  /** Where the overlay portals to. Kept out of the anchor index. */
  overlayContainer: HTMLElement | null
  store: FeedbackStore
  lock: ContextLock
  manifest?: ProvenanceManifest
  buildReport?: BuildReport
  recorder: PreviewRecorder
  threads: CommentThread[]
  metrics: OrphanSnapshot
  mode: ReviewMode
  setMode(value: ReviewMode): void
  panelOpen: boolean
  setPanelOpen(value: boolean): void
  /**
   * The engineering layer: paths, source references, anchor levels, the lock,
   * and the Network, Runtime and Build views. Off by default; remembered.
   */
  details: boolean
  setDetails(value: boolean): void
  selectedThreadId: string | null
  selectThread(id: string | null): void
  elementFor(threadId: string): Element | null
  refresh(input?: RefreshInput): OrphanSnapshot
  captureCrop(element: Element): Promise<string | undefined>
  commentOnElement(
    element: Element,
    body: string,
    options?: { layerHint?: Layer; crop?: string },
  ): CommentThread
  commentOnTarget(target: NonVisualTarget, body: string, options?: { layerHint?: Layer }): CommentThread
  /** Feedback about the whole page, not any one part of it. */
  commentGeneral(topic: string, body: string): CommentThread
  reply(threadId: string, body: string): void
  setThreadStatus(threadId: string, status: CommentThread['status']): void
  /** Feedback belongs to whoever wrote it, so only they can withdraw it. */
  canDelete(authorId: string): boolean
  deleteThread(threadId: string): void
  deleteReply(threadId: string, commentId: string): void

  // The versions of the page, and where the reviewer is in them.
  versions: ReviewVersion[]
  currentVersion: ReviewVersion
  onLatestVersion: boolean
  viewVersion(id: string): void
  approveCurrentVersion(): Promise<void>

  // Open comments she has left out of the next request.
  excludedThreadIds: ReadonlySet<string>
  setIncluded(threadId: string, included: boolean): void
  /** Open and not left out: exactly what Request changes sends. */
  includedThreads: CommentThread[]
  /** The request that would go right now, for her to read first. */
  draftRequest(): ChangeRequest
  requestChanges(): Promise<ChangeRequest>
  requesting: boolean
  lastRequest: ChangeRequest | null
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null)

export interface FeedbackProviderProps {
  actor: Actor
  /** Stable across versions. Comments belong to it, not to a build. */
  previewId: string
  lock: ContextLock
  manifest?: ProvenanceManifest
  buildReport?: BuildReport
  previewRef: RefObject<HTMLElement | null>
  overlayContainer?: HTMLElement | null
  buildId?: string
  label?: string
  remotes?: PreviewVersion['remotes']
  store?: FeedbackStore
  recorder?: PreviewRecorder
  repository?: FeedbackRepository
  /** Off by default: rendering a crop costs a frame on the reviewer's machine. */
  captureCrops?: boolean | ScreenshotOptions
  /** How long the preview DOM must be quiet before a metered pass runs. */
  settleMs?: number
  /** Where the reviewer starts. Defaults to comment. */
  initialMode?: ReviewMode
  /**
   * Every version of the page so far, oldest first. Their ids are the host's
   * build ids; `buildId` says which one is on screen.
   */
  versions?: readonly ReviewVersion[]
  /** Put a version on screen. The host swaps the build and calls update(). */
  onViewVersion?: (versionId: string) => void
  /**
   * Take the request and build the next version. Resolves when that version is
   * on screen, so the toolbar can say "building" until it is.
   */
  onRequestChanges?: (request: ChangeRequest) => void | Promise<void>
  onApprove?: (version: ReviewVersion) => void | Promise<void>
  children: ReactNode
}

function requestId(): string {
  return `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

const DETAILS_KEY = 'adl:details'

function readDetails(): boolean {
  try {
    return localStorage.getItem(DETAILS_KEY) === '1'
  } catch {
    return false
  }
}

export function FeedbackProvider(props: FeedbackProviderProps): ReactNode {
  const { actor, lock, manifest, buildReport, previewRef, previewId, repository } = props

  const store = useMemo(
    () => props.store ?? new FeedbackStore({ lock, buildId: props.buildId }),
    // Rebuilding the store on a lock change would discard the very feedback the
    // lock change is meant to be measured against.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.store],
  )
  const recorder = useMemo(() => props.recorder ?? new PreviewRecorder(), [props.recorder])

  const ctxRef = useRef<ResolutionContext | null>(null)
  const elementsRef = useRef(new Map<string, Element>())
  const [version, setVersion] = useState(0)
  const [mode, setMode] = useState<ReviewMode>(props.initialMode ?? 'comment')
  const [panelOpen, setPanelOpen] = useState(false)
  const [details, setDetailsState] = useState(readDetails)
  const [selectedThreadId, selectThread] = useState<string | null>(null)
  const [excludedThreadIds, setExcluded] = useState<ReadonlySet<string>>(() => new Set())
  const [approvals, setApprovals] = useState<ReadonlyMap<string, { at: string; by: Actor }>>(
    () => new Map(),
  )
  const [requesting, setRequesting] = useState(false)
  const [lastRequest, setLastRequest] = useState<ChangeRequest | null>(null)

  const bump = useCallback(() => setVersion((v) => v + 1), [])

  const buildContext = useCallback(
    (nextLock: ContextLock, nextManifest?: ProvenanceManifest): ResolutionContext => {
      const root = previewRef.current ?? undefined
      const ctx = createResolutionContext({ root, manifest: nextManifest, lock: nextLock })
      ctxRef.current = ctx
      return ctx
    },
    [previewRef],
  )

  const refresh = useCallback<FeedbackContextValue['refresh']>(
    (input = {}) => {
      const nextLock = input.lock ?? lock
      const ctx = buildContext(nextLock, input.manifest ?? manifest)
      store.registerLock(nextLock)
      const buildId = input.buildId ?? props.buildId
      const snapshot = store.reanchor(ctx, { buildId, record: input.record })

      for (const thread of store.threads()) {
        const element = thread.resolution?.element
        if (element) elementsRef.current.set(thread.id, element)
        else if (thread.anchorStatus === 'orphaned') elementsRef.current.delete(thread.id)
      }

      if (repository && input.record !== false) {
        void recordPreviewVersion({
          repository,
          previewId,
          lock: nextLock,
          buildId,
          label: input.label ?? props.label ?? nextLock.id.slice(0, 8),
          remotes: input.remotes ?? props.remotes,
        }).catch(() => {})
      }

      bump()
      return snapshot
    },
    [
      buildContext,
      bump,
      lock,
      manifest,
      previewId,
      props.buildId,
      props.label,
      props.remotes,
      repository,
      store,
    ],
  )

  // A federated preview does not arrive all at once: remotes resolve lazily and
  // data lands after them. Re-anchoring the instant the pinned inputs change
  // would measure a half-rendered page and report everything as orphaned, so
  // the metered pass waits for the DOM to go quiet.
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingBuild = useRef<string | null>(null)
  const settleMs = props.settleMs ?? 250

  const scheduleSettle = useCallback(() => {
    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null
      const metered = pendingBuild.current
      pendingBuild.current = null
      refresh(metered === null ? { record: false } : { buildId: metered })
    }, settleMs)
  }, [refresh, settleMs])

  useEffect(() => {
    pendingBuild.current = props.buildId ?? lock.id
    scheduleSettle()
    return () => {
      if (settleTimer.current) clearTimeout(settleTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lock.id, manifest, props.buildId])

  // Keep pins attached while the preview moves under them: a remote mounting, a
  // table loading, a route changing. These passes are not metered.
  useEffect(() => {
    let observer: MutationObserver | undefined
    let poll: ReturnType<typeof setInterval> | undefined

    const attach = (): boolean => {
      const root = previewRef.current
      if (!root) return false
      observer = new MutationObserver(() => scheduleSettle())
      observer.observe(root, { childList: true, subtree: true })
      return true
    }

    // The host mounts the toolbar before the preview root has content, and
    // sometimes before it exists at all.
    if (!attach()) poll = setInterval(() => attach() && poll && clearInterval(poll), 100)

    return () => {
      observer?.disconnect()
      if (poll) clearInterval(poll)
    }
  }, [previewRef, scheduleSettle])

  useEffect(() => store.subscribe(() => bump()), [store, bump])
  useEffect(() => recorder.subscribe(() => bump()), [recorder, bump])

  const captureCrop = useCallback<FeedbackContextValue['captureCrop']>(
    async (element) => {
      if (!props.captureCrops) return undefined
      const options = typeof props.captureCrops === 'object' ? props.captureCrops : {}
      return captureElementImage(element, options)
    },
    [props.captureCrops],
  )

  const commentOnElement = useCallback<FeedbackContextValue['commentOnElement']>(
    (element, body, options = {}) => {
      const ctx = buildContext(lock, manifest)
      const anchor = captureAnchor(element, ctx, { crop: options.crop })
      const thread = store.createThread({ anchor, author: actor, body, layerHint: options.layerHint })
      // Resolve once against the version it was written on, so the comment shows
      // which level is carrying it from the moment it is created.
      thread.resolution = resolveAnchor(anchor, ctx)
      thread.anchorStatus = thread.resolution.status
      elementsRef.current.set(thread.id, element)
      bump()
      return thread
    },
    [actor, buildContext, bump, lock, manifest, store],
  )

  const commentOnTarget = useCallback<FeedbackContextValue['commentOnTarget']>(
    (target, body, options = {}) => {
      const ctx = ctxRef.current ?? buildContext(lock, manifest)
      const anchor = captureNonVisualAnchor(target, ctx)
      const thread = store.createThread({ anchor, author: actor, body, layerHint: options.layerHint })
      thread.resolution = resolveAnchor(anchor, ctx)
      thread.anchorStatus = thread.resolution.status
      bump()
      return thread
    },
    [actor, buildContext, bump, lock, manifest, store],
  )

  const commentGeneral = useCallback<FeedbackContextValue['commentGeneral']>(
    (topic, body) => commentOnTarget({ kind: 'general', topic }, body),
    [commentOnTarget],
  )

  const reply = useCallback(
    (threadId: string, body: string) => {
      store.addComment(threadId, actor, body)
    },
    [actor, store],
  )

  const setThreadStatus = useCallback(
    (threadId: string, status: CommentThread['status']) => {
      store.setStatus(threadId, status)
    },
    [store],
  )

  const canDelete = useCallback((authorId: string) => authorId === actor.id, [actor.id])

  const deleteThread = useCallback(
    (threadId: string) => {
      store.removeThread(threadId)
      elementsRef.current.delete(threadId)
      selectThread((current) => (current === threadId ? null : current))
      // It was only ever held back from a request it can no longer be in.
      setExcluded((prev) => {
        if (!prev.has(threadId)) return prev
        const next = new Set(prev)
        next.delete(threadId)
        return next
      })
    },
    [store],
  )

  const deleteReply = useCallback(
    (threadId: string, commentId: string) => {
      store.removeComment(threadId, commentId)
    },
    [store],
  )

  const setDetails = useCallback((value: boolean) => {
    setDetailsState(value)
    try {
      localStorage.setItem(DETAILS_KEY, value ? '1' : '0')
    } catch {
      // A preview without storage still gets the switch, just not remembered.
    }
  }, [])

  const setIncluded = useCallback((threadId: string, included: boolean) => {
    setExcluded((prev) => {
      if (included === !prev.has(threadId)) return prev
      const next = new Set(prev)
      if (included) next.delete(threadId)
      else next.add(threadId)
      return next
    })
  }, [])

  const threads = useMemo(() => {
    void version
    return store.threads()
  }, [store, version])

  const includedThreads = useMemo(
    () => threads.filter((thread) => thread.status === 'open' && !excludedThreadIds.has(thread.id)),
    [threads, excludedThreadIds],
  )

  // A host that says nothing about versions still has one: what is on screen.
  const versions = useMemo<ReviewVersion[]>(() => {
    const given =
      props.versions && props.versions.length > 0
        ? [...props.versions]
        : [
            {
              id: props.buildId ?? lock.id,
              label: versionLabel(0),
              createdAt: lock.createdAt,
            },
          ]
    return given.map((entry) => {
      const approval = approvals.get(entry.id)
      return approval ? { ...entry, approvedAt: approval.at, approvedBy: approval.by } : entry
    })
  }, [approvals, lock.createdAt, lock.id, props.buildId, props.versions])

  const currentVersionId = props.buildId ?? lock.id
  const currentVersion = useMemo(
    () => versions.find((entry) => entry.id === currentVersionId) ?? versions[versions.length - 1]!,
    [currentVersionId, versions],
  )
  const onLatestVersion = isLatest(versions, currentVersionId)

  const viewVersion = useCallback(
    (id: string) => {
      if (id !== currentVersionId) props.onViewVersion?.(id)
    },
    [currentVersionId, props],
  )

  const approveCurrentVersion = useCallback(async () => {
    const at = new Date().toISOString()
    setApprovals((prev) => new Map(prev).set(currentVersion.id, { at, by: actor }))
    await props.onApprove?.({ ...currentVersion, approvedAt: at, approvedBy: actor })
  }, [actor, currentVersion, props])

  const draftRequest = useCallback<FeedbackContextValue['draftRequest']>(
    () =>
      buildChangeRequest({
        id: requestId(),
        now: new Date().toISOString(),
        actor,
        previewId,
        fromVersion: { id: currentVersion.id, label: currentVersion.label },
        lock,
        included: includedThreads,
        notIncluded: threads.filter(
          (thread) => thread.status === 'open' && excludedThreadIds.has(thread.id),
        ),
        done: threads.filter((thread) => thread.status !== 'open'),
      }),
    [actor, currentVersion, excludedThreadIds, includedThreads, lock, previewId, threads],
  )

  const requestChanges = useCallback<FeedbackContextValue['requestChanges']>(async () => {
    const request = draftRequest()
    setRequesting(true)
    try {
      await props.onRequestChanges?.(request)
      setLastRequest(request)
      return request
    } finally {
      setRequesting(false)
    }
  }, [draftRequest, props])

  const value = useMemo<FeedbackContextValue>(
    () => ({
      actor,
      previewId,
      previewRef,
      overlayContainer: props.overlayContainer ?? (typeof document !== 'undefined' ? document.body : null),
      store,
      lock,
      manifest,
      buildReport,
      recorder,
      threads,
      metrics: store.meter.snapshot(store.buildId),
      mode,
      setMode,
      panelOpen,
      setPanelOpen,
      details,
      setDetails,
      selectedThreadId,
      selectThread,
      elementFor: (threadId: string) => elementsRef.current.get(threadId) ?? null,
      refresh,
      captureCrop,
      commentOnElement,
      commentOnTarget,
      commentGeneral,
      reply,
      setThreadStatus,
      canDelete,
      deleteThread,
      deleteReply,
      versions,
      currentVersion,
      onLatestVersion,
      viewVersion,
      approveCurrentVersion,
      excludedThreadIds,
      setIncluded,
      includedThreads,
      draftRequest,
      requestChanges,
      requesting,
      lastRequest,
    }),
    [
      actor,
      approveCurrentVersion,
      buildReport,
      captureCrop,
      commentGeneral,
      commentOnElement,
      canDelete,
      commentOnTarget,
      currentVersion,
      deleteReply,
      deleteThread,
      details,
      draftRequest,
      excludedThreadIds,
      includedThreads,
      lastRequest,
      lock,
      manifest,
      mode,
      onLatestVersion,
      panelOpen,
      previewId,
      previewRef,
      props.overlayContainer,
      recorder,
      refresh,
      reply,
      requestChanges,
      requesting,
      selectedThreadId,
      setDetails,
      setIncluded,
      setThreadStatus,
      store,
      threads,
      versions,
      viewVersion,
    ],
  )

  return <FeedbackContext.Provider value={value}>{props.children}</FeedbackContext.Provider>
}

export function useFeedback(): FeedbackContextValue {
  const value = useContext(FeedbackContext)
  if (!value) throw new Error('useFeedback must be used inside <FeedbackProvider>')
  return value
}
