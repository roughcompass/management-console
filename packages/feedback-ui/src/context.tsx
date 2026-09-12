import {
  FeedbackStore,
  captureAnchor,
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
} from '@adl/anchor-core'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { PreviewRecorder } from './instrumentation.js'

export interface FeedbackContextValue {
  actor: Actor
  /** The element bounding the pinned preview. Anchors never reach outside it. */
  previewRef: RefObject<HTMLElement | null>
  store: FeedbackStore
  lock: ContextLock
  manifest?: ProvenanceManifest
  buildReport?: BuildReport
  recorder: PreviewRecorder
  threads: CommentThread[]
  metrics: OrphanSnapshot
  picking: boolean
  setPicking(value: boolean): void
  selectedThreadId: string | null
  selectThread(id: string | null): void
  elementFor(threadId: string): Element | null
  /** Rebuild the index and re-anchor every open thread. Call after a rebuild. */
  refresh(options?: { lock?: ContextLock; manifest?: ProvenanceManifest; buildId?: string }): OrphanSnapshot
  commentOnElement(element: Element, body: string, options?: { layerHint?: Layer }): CommentThread
  commentOnTarget(target: NonVisualTarget, body: string, options?: { layerHint?: Layer }): CommentThread
  reply(threadId: string, body: string): void
  setThreadStatus(threadId: string, status: CommentThread['status']): void
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null)

export interface FeedbackProviderProps {
  actor: Actor
  lock: ContextLock
  manifest?: ProvenanceManifest
  buildReport?: BuildReport
  /** Element bounding the pinned preview. Anchors never reach outside it. */
  previewRef: RefObject<HTMLElement | null>
  buildId?: string
  store?: FeedbackStore
  recorder?: PreviewRecorder
  children: ReactNode
}

export function FeedbackProvider(props: FeedbackProviderProps): ReactNode {
  const { actor, lock, manifest, buildReport, previewRef, children } = props

  const store = useMemo(
    () => props.store ?? new FeedbackStore({ lock, buildId: props.buildId }),
    // A new store per lock change would drop the feedback the lock change is
    // meant to be measured against, so the store is created once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const recorder = useMemo(() => props.recorder ?? new PreviewRecorder(), [props.recorder])

  const ctxRef = useRef<ResolutionContext | null>(null)
  const elementsRef = useRef(new Map<string, Element>())
  const [version, setVersion] = useState(0)
  const [picking, setPicking] = useState(false)
  const [selectedThreadId, selectThread] = useState<string | null>(null)

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
    (options = {}) => {
      const nextLock = options.lock ?? lock
      const ctx = buildContext(nextLock, options.manifest ?? manifest)
      store.registerLock(nextLock)
      const snapshot = store.reanchor(ctx, { buildId: options.buildId })
      for (const thread of store.threads()) {
        const element = thread.resolution?.element
        if (element) elementsRef.current.set(thread.id, element)
        else if (thread.anchorStatus === 'orphaned') elementsRef.current.delete(thread.id)
      }
      bump()
      return snapshot
    },
    [buildContext, bump, lock, manifest, store],
  )

  // First pass after the preview mounts, and again whenever the pinned inputs
  // move. A rebuild that does not re-anchor is how comments go missing.
  useEffect(() => {
    refresh({ lock, manifest, buildId: props.buildId ?? lock.id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lock.id, manifest?.buildId])

  useEffect(() => store.subscribe(() => bump()), [store, bump])
  useEffect(() => recorder.subscribe(() => bump()), [recorder, bump])

  const currentContext = useCallback((): ResolutionContext => {
    return ctxRef.current ?? buildContext(lock, manifest)
  }, [buildContext, lock, manifest])

  const commentOnElement = useCallback<FeedbackContextValue['commentOnElement']>(
    (element, body, options = {}) => {
      const ctx = buildContext(lock, manifest)
      const anchor = captureAnchor(element, ctx)
      const thread = store.createThread({
        anchor,
        author: actor,
        body,
        layerHint: options.layerHint,
      })
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
      const ctx = currentContext()
      const anchor = captureNonVisualAnchor(target, ctx)
      const thread = store.createThread({ anchor, author: actor, body, layerHint: options.layerHint })
      thread.resolution = resolveAnchor(anchor, ctx)
      thread.anchorStatus = thread.resolution.status
      bump()
      return thread
    },
    [actor, bump, currentContext, store],
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

  const value = useMemo<FeedbackContextValue>(() => {
    void version
    return {
      actor,
      previewRef,
      store,
      lock,
      manifest,
      buildReport,
      recorder,
      threads: store.threads(),
      metrics: store.meter.snapshot(store.buildId),
      picking,
      setPicking,
      selectedThreadId,
      selectThread,
      elementFor: (threadId: string) => elementsRef.current.get(threadId) ?? null,
      refresh,
      commentOnElement,
      commentOnTarget,
      reply,
      setThreadStatus,
    }
  }, [
    actor,
    previewRef,
    buildReport,
    commentOnElement,
    commentOnTarget,
    lock,
    manifest,
    picking,
    recorder,
    refresh,
    reply,
    selectedThreadId,
    setThreadStatus,
    store,
    version,
  ])

  return <FeedbackContext.Provider value={value}>{children}</FeedbackContext.Provider>
}

export function useFeedback(): FeedbackContextValue {
  const value = useContext(FeedbackContext)
  if (!value) throw new Error('useFeedback must be used inside <FeedbackProvider>')
  return value
}
