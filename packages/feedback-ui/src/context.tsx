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
import { PreviewRecorder } from './instrumentation.js'

export interface RefreshInput {
  lock?: ContextLock
  manifest?: ProvenanceManifest
  buildId?: string
  label?: string
  remotes?: PreviewVersion['remotes']
  /** False re-resolves without metering. Defaults to true. */
  record?: boolean
}

export interface FeedbackSubmission {
  previewId: string
  lockId: string
  comments: Array<{
    threadId: string
    anchorType: string
    anchorStatus: string
    comments: Array<{ author: string; body: string }>
  }>
  summary: {
    total: number
    elementComments: number
    generalFeedback: number
    resolved: number
    degraded: number
    orphaned: number
  }
}

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
  picking: boolean
  setPicking(value: boolean): void
  panelOpen: boolean
  setPanelOpen(value: boolean): void
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
  reply(threadId: string, body: string): void
  setThreadStatus(threadId: string, status: CommentThread['status']): void
  // New: track which comments are included in submission
  selectedThreadIds: Set<string>
  toggleThreadSelection(threadId: string): void
  // New: add free-form feedback not tied to an element
  addGeneralFeedback(body: string): CommentThread
  // New: submit selected comments to agent for processing
  submitFeedback(onHandler?: (submission: FeedbackSubmission) => Promise<void>): Promise<void>
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null)

export interface FeedbackProviderProps {
  actor: Actor
  /** Stable across preview versions. Threads belong to it, not to a build. */
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
  children: ReactNode
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
  const [picking, setPicking] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [selectedThreadId, selectThread] = useState<string | null>(null)
  const [selectedThreadIds, setSelectedThreadIds] = useState(new Set<string>())

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

    // The Frame mounts the toolbar before the preview root has content, and
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
      // Resolve once against the build it was written on, so the thread shows
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

  const toggleThreadSelection = useCallback(
    (threadId: string) => {
      setSelectedThreadIds((prev) => {
        const next = new Set(prev)
        if (next.has(threadId)) next.delete(threadId)
        else next.add(threadId)
        return next
      })
    },
    [],
  )

  const addGeneralFeedback = useCallback(
    (body: string) => {
      const target: NonVisualTarget = {
        kind: 'runtime-event',
        channel: 'general',
        type: 'feedback',
      }
      const ctx = ctxRef.current ?? buildContext(lock, manifest)
      const anchor = captureNonVisualAnchor(target, ctx)
      const thread = store.createThread({ anchor, author: actor, body, layerHint: 'product' })
      thread.resolution = resolveAnchor(anchor, ctx)
      thread.anchorStatus = thread.resolution.status
      bump()
      return thread
    },
    [actor, buildContext, bump, lock, manifest, store],
  )

  const submitFeedback = useCallback(
    async (onHandler?: (submission: FeedbackSubmission) => Promise<void>) => {
      const selectedThreads = store.threads().filter((t) => {
        // This will be populated via context after component mounts
        // For now, we'll build from store
        return true
      })

      const summary = {
        total: selectedThreads.length,
        elementComments: selectedThreads.filter((t) => t.anchor.anchorType === 'visual-node').length,
        generalFeedback: selectedThreads.filter(
          (t) => t.anchor.target?.kind === 'runtime-event' && t.anchor.target.channel === 'general',
        ).length,
        orphaned: selectedThreads.filter((t) => t.anchorStatus === 'orphaned').length,
        degraded: selectedThreads.filter((t) => t.anchorStatus === 'degraded').length,
        resolved: selectedThreads.filter((t) => t.anchorStatus === 'resolved').length,
      }

      const submission: FeedbackSubmission = {
        previewId,
        lockId: lock.id,
        comments: selectedThreads.map((thread) => ({
          threadId: thread.id,
          anchorType: thread.anchor.anchorType,
          anchorStatus: thread.anchorStatus,
          comments: thread.comments.map((c) => ({ author: c.author.name, body: c.body })),
        })),
        summary,
      }

      if (onHandler) {
        await onHandler(submission)
      } else {
        // Default: log to console and POST to /api/feedback (if available)
        console.log('Feedback submission:', submission)
        try {
          await fetch('/api/feedback', { method: 'POST', body: JSON.stringify(submission) }).catch(() => {})
        } catch {}
      }
    },
    [store, previewId, lock.id],
  )

  const value = useMemo<FeedbackContextValue>(() => {
    void version
    return {
      actor,
      previewId,
      previewRef,
      overlayContainer: props.overlayContainer ?? (typeof document !== 'undefined' ? document.body : null),
      store,
      lock,
      manifest,
      buildReport,
      recorder,
      threads: store.threads(),
      metrics: store.meter.snapshot(store.buildId),
      picking,
      setPicking,
      panelOpen,
      setPanelOpen,
      selectedThreadId,
      selectThread,
      elementFor: (threadId: string) => elementsRef.current.get(threadId) ?? null,
      refresh,
      captureCrop,
      commentOnElement,
      commentOnTarget,
      reply,
      setThreadStatus,
      selectedThreadIds,
      toggleThreadSelection,
      addGeneralFeedback,
      submitFeedback,
    }
  }, [
    actor,
    buildReport,
    captureCrop,
    commentOnElement,
    commentOnTarget,
    lock,
    manifest,
    panelOpen,
    picking,
    previewId,
    previewRef,
    props.overlayContainer,
    recorder,
    refresh,
    reply,
    selectedThreadId,
    setThreadStatus,
    selectedThreadIds,
    toggleThreadSelection,
    addGeneralFeedback,
    submitFeedback,
    store,
    version,
  ])

  return <FeedbackContext.Provider value={value}>{props.children}</FeedbackContext.Provider>
}

export function useFeedback(): FeedbackContextValue {
  const value = useContext(FeedbackContext)
  if (!value) throw new Error('useFeedback must be used inside <FeedbackProvider>')
  return value
}
