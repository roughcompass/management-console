import { OVERLAY_ATTR, buildSemanticPath, formatSemanticPath } from '@adl/anchor-core'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useFeedback } from './context.js'
import { useFeedbackStyles } from './styles.js'

interface Draft {
  element: Element
  x: number
  y: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Click-to-anchor over a running preview. The overlay marks itself so the
 * anchor index skips it: a comment must never anchor to the commenting tool.
 */
export function FeedbackLayer(): ReactNode {
  useFeedbackStyles()
  const {
    picking,
    setPicking,
    threads,
    elementFor,
    commentOnElement,
    captureCrop,
    selectThread,
    selectedThreadId,
    setPanelOpen,
    previewRef,
    overlayContainer,
    manifest,
  } = useFeedback()

  const [hovered, setHovered] = useState<Element | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [, setTick] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const reposition = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [reposition])

  const insidePreview = useCallback(
    (element: Element | null): element is Element => {
      const root = previewRef.current
      if (!element || !root) return false
      if (element.closest(`[${OVERLAY_ATTR}]`)) return false
      return root.contains(element)
    },
    [previewRef],
  )

  useEffect(() => {
    if (!picking) {
      setHovered(null)
      return
    }
    const onMove = (event: MouseEvent) => {
      const element = document.elementFromPoint(event.clientX, event.clientY)
      setHovered(insidePreview(element) ? element : null)
    }
    const onClick = (event: MouseEvent) => {
      const element = document.elementFromPoint(event.clientX, event.clientY)
      if (!insidePreview(element)) return
      // The preview is a running app: a pick must not also fire its handlers.
      event.preventDefault()
      event.stopPropagation()
      setDraft({ element, x: event.clientX, y: event.clientY })
      setPicking(false)
      setHovered(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPicking(false)
    }
    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [insidePreview, picking, setPicking])

  useEffect(() => {
    if (draft) inputRef.current?.focus()
  }, [draft])

  if (!overlayContainer) return null

  const pathOf = (element: Element) =>
    formatSemanticPath(buildSemanticPath(element, manifest, previewRef.current ?? undefined), {
      includeElement: false,
    })

  const hoveredRect = hovered?.getBoundingClientRect()
  const hoveredLabel = hovered ? pathOf(hovered).split(' > ').slice(-2).join(' > ') : ''
  const visual = threads.filter((thread) => thread.anchor.anchorType === 'visual-node')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const text = body.trim()
    if (!draft || !text || saving) return
    setSaving(true)
    // The crop is captured before the thread exists, because the next rebuild
    // may be the reason anyone ever looks at it.
    const crop = await captureCrop(draft.element)
    const thread = commentOnElement(draft.element, text, { crop })
    selectThread(thread.id)
    setPanelOpen(true)
    setBody('')
    setDraft(null)
    setSaving(false)
  }

  return createPortal(
    <div className="adl-root adl-overlay" {...{ [OVERLAY_ATTR]: '' }}>
      {picking && hoveredRect ? (
        <div
          className="adl-highlight"
          style={{
            left: hoveredRect.left,
            top: hoveredRect.top,
            width: hoveredRect.width,
            height: hoveredRect.height,
          }}
        >
          <span className="adl-highlight-label">
            {hoveredLabel || hovered?.tagName.toLowerCase()}
          </span>
        </div>
      ) : null}

      {visual.map((thread) => {
        const element = elementFor(thread.id)
        if (!element) return null
        const rect = element.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) return null
        return (
          <button
            key={thread.id}
            type="button"
            className="adl-pin"
            data-status={thread.anchorStatus}
            data-thread-status={thread.status}
            data-selected={selectedThreadId === thread.id}
            style={{ left: rect.left, top: rect.top }}
            title={thread.comments[0]?.body}
            onClick={() => {
              selectThread(thread.id)
              setPanelOpen(true)
            }}
          >
            {threads.indexOf(thread) + 1}
          </button>
        )
      })}

      {draft ? (
        <form
          className="adl-composer"
          style={{
            left: clamp(draft.x, 12, window.innerWidth - 332),
            top: clamp(draft.y + 12, 12, window.innerHeight - 200),
          }}
          onSubmit={submit}
        >
          <div className="adl-stack">
            <div className="adl-mono">{pathOf(draft.element)}</div>
            <textarea
              ref={inputRef}
              className="adl-input adl-textarea"
              rows={3}
              aria-label="comment"
              placeholder="What should change here?"
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
            <div className="adl-row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="adl-btn" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button type="submit" className="adl-btn" data-variant="primary" disabled={saving}>
                Comment
              </button>
            </div>
          </div>
        </form>
      ) : null}
    </div>,
    overlayContainer,
  )
}
