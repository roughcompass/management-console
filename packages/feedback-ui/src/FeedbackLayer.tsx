import { OVERLAY_ATTR, buildSemanticPath, formatSemanticPath, visibleText } from '@adl/anchor-core'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useFeedback } from './context.js'
import { humanize, plainStatus } from './plain.js'
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
 * The page, with comments on it. A reviewer who followed a link to give
 * feedback is in comment mode already: she clicks the thing she means and
 * writes. Nothing to arm first, and Browse hands the page back when she wants
 * to use it rather than talk about it.
 */
export function FeedbackLayer(): ReactNode {
  useFeedbackStyles()
  const {
    mode,
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
    details,
  } = useFeedback()

  const [hovered, setHovered] = useState<Element | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [, setTick] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const commenting = mode === 'comment'

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

  // A crosshair over the page is the whole affordance for "click anything".
  useEffect(() => {
    if (!commenting) return
    document.documentElement.setAttribute('data-adl-commenting', '')
    return () => document.documentElement.removeAttribute('data-adl-commenting')
  }, [commenting])

  useEffect(() => {
    if (!commenting) {
      setHovered(null)
      return
    }
    // Capture phase, so the target is the deepest element under the pointer
    // before the page's own handlers see the event.
    const onMove = (event: MouseEvent) => {
      if (draft) return
      const element = event.target as Element | null
      setHovered(insidePreview(element) ? element : null)
    }
    const onClick = (event: MouseEvent) => {
      const element = event.target as Element | null
      if (!insidePreview(element)) return
      // The page under review is a running app: a click meant as a comment must
      // not also press its buttons.
      event.preventDefault()
      event.stopPropagation()
      // While a comment is being written, the next click puts it away rather
      // than starting a second one on top of it.
      if (draft) {
        setDraft(null)
        setBody('')
        return
      }
      setDraft({ element, x: event.clientX, y: event.clientY })
      setHovered(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setDraft(null)
      setBody('')
    }
    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [commenting, draft, insidePreview])

  useEffect(() => {
    if (draft) inputRef.current?.focus()
  }, [draft])

  if (!overlayContainer) return null

  const semanticOf = (element: Element) =>
    buildSemanticPath(element, manifest, previewRef.current ?? undefined)
  const pathOf = (element: Element) =>
    formatSemanticPath(semanticOf(element), { includeElement: false })
  // Before a comment exists there is no captured label, so name the thing the
  // same way capture will: the component as a phrase, plus its own words.
  const plainOf = (element: Element) => {
    const component = [...semanticOf(element).segments]
      .reverse()
      .find((segment) => segment.kind === 'component')?.name
    const name = component ? humanize(component) : element.tagName.toLowerCase()
    const text = visibleText(element)
    return text && text.length <= 40 ? `${name} “${text}”` : name
  }

  const hoveredRect = hovered?.getBoundingClientRect()
  const visual = threads.filter((thread) => thread.anchor.anchorType === 'visual-node')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const text = body.trim()
    if (!draft || !text || saving) return
    setSaving(true)
    // The crop is captured before the comment exists, because the next version
    // may be the reason anyone ever looks at it.
    const crop = await captureCrop(draft.element)
    // The pin landing is the confirmation. Throwing the panel open over the
    // page she is still commenting on is not.
    const thread = commentOnElement(draft.element, text, { crop })
    selectThread(thread.id)
    setBody('')
    setDraft(null)
    setSaving(false)
  }

  return createPortal(
    <div className="adl-root adl-overlay" {...{ [OVERLAY_ATTR]: '' }}>
      {commenting && hoveredRect ? (
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
            {plainOf(hovered!) || hovered!.tagName.toLowerCase()}
          </span>
        </div>
      ) : null}

      {visual.map((thread) => {
        const element = elementFor(thread.id)
        if (!element) return null
        const rect = element.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) return null
        const trouble = plainStatus(thread.anchorStatus)
        return (
          <button
            key={thread.id}
            type="button"
            className="adl-pin"
            data-status={thread.anchorStatus}
            data-thread-status={thread.status}
            data-selected={selectedThreadId === thread.id}
            style={{ left: rect.left, top: rect.top }}
            title={
              trouble ? `${trouble.label} — ${thread.comments[0]?.body}` : thread.comments[0]?.body
            }
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
          aria-label="new comment"
          style={{
            left: clamp(draft.x, 12, window.innerWidth - 332),
            top: clamp(draft.y + 12, 12, window.innerHeight - 220),
          }}
          onSubmit={submit}
        >
          <div className="adl-stack">
            <div className="adl-thread-title" style={{ margin: 0 }}>{plainOf(draft.element)}</div>
            {details ? <div className="adl-mono">{pathOf(draft.element)}</div> : null}
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
              <button
                type="button"
                className="adl-btn"
                onClick={() => {
                  setDraft(null)
                  setBody('')
                }}
              >
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
