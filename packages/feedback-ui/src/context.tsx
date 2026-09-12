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
import { buildSubmission } from './submission.js'
import type { FeedbackSubmission } from './submission.js'

export interface RefreshInput {
  lock?: ContextLock
  manifest?: ProvenanceManifest
  buildId?: string
  label?: string
  remotes?: PreviewVersion['remotes']
  /** False re-resolves without metering. Defaults to true. */
  record?: boolean
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
  /**
   * The engineering layer: paths, source refs, anchor levels, the lock, the
   * Network/Runtime/Build views. Off by default; remembered per reviewer.
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
  /** Feedback about the preview as a whole, not any one node. */
  commentGeneral(topic: string, body: string): CommentThread
  reply(threadId: string, body: string): void
  setThreadStatus(threadId: string, status: CommentThread['status']): void
  /** Open threads the reviewer has left out of the next submission. */
  excludedThreadIds: ReadonlySet<string>
  setIncluded(threadId: string, included: boolean): void
  /** Open and not left out: exactly what submit() sends. */
  includedThreads: CommentThread[]
  /** The packet submit() would send right now, for the reviewer to read first. */
  previewSubmission(): FeedbackSubmission
  submit(): Promise<FeedbackSubmission>
  lastSubmission: FeedbackSubmission | null
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
  /** Where a submission goes. The toolbar does not know what is on the other end. */
  onSubmit?: (submission: FeedbackSubmission) => void | Promise<void>
  children: ReactNode
}

function submissionId(): string {
  return `sub_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
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
  const { actor, lock, manifest, buildReport, previewRef, previewId, repository, onSubmit } = props

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
  const [details, setDetailsState] = useState(readDetails)
  const [selectedThreadId, selectThread] = useState<string | null>(null)
  const [excludedThreadIds, setExcluded] = useState<ReadonlySet<string>>(() => new Set())
  const [lastSubmission, setLastSubmission] = useState<FeedbackSubmission | null>(null)

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

  const previewSubmission = useCallback<FeedbackContextValue['previewSubmission']>(
    () =>
      buildSubmission({
        id: submissionId(),
        now: new Date().toISOString(),
        actor,
        previewId,
        lock,
        buildId: props.buildId ?? lock.id,
        included: includedThreads,
        leftOut: threads.filter((thread) => thread.status === 'open' && excludedThreadIds.has(thread.id)),
        closed: threads.filter((thread) => thread.status !== 'open'),
      }),
    [actor, excludedThreadIds, includedThreads, lock, previewId, props.buildId, threads],
  )

  const submit = useCallback<FeedbackContextValue['submit']>(async () => {
    const submission = previewSubmission()
    await onSubmit?.(submission)
    setLastSubmission(submission)
    return submission
  }, [onSubmit, previewSubmission])

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
      picking,
      setPicking,
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
      excludedThreadIds,
      setIncluded,
      includedThreads,
      previewSubmission,
      submit,
      lastSubmission,
    }),
    [
      actor,
      buildReport,
      captureCrop,
      commentGeneral,
      commentOnElement,
      commentOnTarget,
      details,
      excludedThreadIds,
      includedThreads,
      lastSubmission,
      lock,
      manifest,
      panelOpen,
      picking,
      previewId,
      previewRef,
      previewSubmission,
      props.overlayContainer,
      recorder,
      refresh,
      reply,
      selectedThreadId,
      setDetails,
      setIncluded,
      setThreadStatus,
      store,
      submit,
      threads,
    ],
  )

  return <FeedbackContext.Provider value={value}>{props.children}</FeedbackContext.Provider>
}

export function useFeedback(): FeedbackContextValue {
  const value = useContext(FeedbackContext)
  if (!value) throw new Error('useFeedback must be used inside <FeedbackProvider>')
  return value
}
