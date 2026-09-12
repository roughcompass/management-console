import type { Actor, ContextLock, ProvenanceManifest } from '@adl/anchor-core'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ID,
  htmlV1,
  htmlV2,
  lockV1,
  lockV2,
  manifestV1,
  manifestV2,
} from '../../anchor-core/src/__fixtures__/dom.js'
import { FeedbackLayer } from './FeedbackLayer.js'
import { FeedbackDock, FeedbackPanel } from './FeedbackPanel.js'
import { FeedbackProvider, useFeedback } from './context.js'
import type { FeedbackSubmission } from './submission.js'

const designer: Actor = { id: 'u-dw', name: 'Dana Whitfield', role: 'design' }

function Probe({ selector, body }: { selector: string; body: string }) {
  const { commentOnElement, previewRef } = useFeedback()
  return (
    <button
      type="button"
      onClick={() => {
        const element = previewRef.current?.querySelector(selector)
        if (element) commentOnElement(element, body)
      }}
    >
      leave feedback
    </button>
  )
}

function Harness({
  html,
  lock,
  manifest,
  buildId,
  selector,
  body,
  dock,
  onSubmit,
}: {
  html: string
  lock: ContextLock
  manifest: ProvenanceManifest
  buildId: string
  selector: string
  body: string
  dock?: boolean
  onSubmit?: (submission: FeedbackSubmission) => void
}) {
  const previewRef = useRef<HTMLDivElement>(null)
  return (
    <FeedbackProvider
      actor={designer}
      previewId="pr-1042"
      lock={lock}
      manifest={manifest}
      buildId={buildId}
      previewRef={previewRef}
      // The settle delay exists for lazily loaded remotes; tests drive the DOM
      // themselves and would otherwise wait on a timer for no reason.
      settleMs={0}
      onSubmit={onSubmit}
    >
      <div ref={previewRef} data-testid="preview" dangerouslySetInnerHTML={{ __html: html }} />
      <Probe selector={selector} body={body} />
      <FeedbackPanel />
      <FeedbackLayer />
      {dock ? <FeedbackDock /> : null}
    </FeedbackProvider>
  )
}

/**
 * jsdom gives every element a zero-size box, and a pin over a node with no
 * rendered area is worse than no pin. Tests that assert on pins stub the box.
 */
function stubRects(rect = { x: 24, y: 96, width: 120, height: 24 }) {
  const original = Element.prototype.getBoundingClientRect
  Element.prototype.getBoundingClientRect = function stub() {
    return {
      ...rect,
      top: rect.y,
      left: rect.x,
      right: rect.x + rect.width,
      bottom: rect.y + rect.height,
      toJSON: () => rect,
    } as DOMRect
  }
  return () => {
    Element.prototype.getBoundingClientRect = original
  }
}

function chip(status: string): Element | null {
  return document.querySelector(`.adl-chip[data-status="${status}"]`)
}

afterEach(cleanup)

describe('anchored feedback across a rebuild', () => {
  it('captures a comment on a preview node and pins it', () => {
    const restore = stubRects()
    render(
      <Harness
        html={htmlV1()}
        lock={lockV1}
        manifest={manifestV1}
        buildId="build-a"
        selector={`[data-de-provenance-id="${ID.badge}"]`}
        body="a failed settlement is an error, not a caution"
      />,
    )
    fireEvent.click(screen.getByText('leave feedback'))

    expect(screen.getByText('a failed settlement is an error, not a caution')).toBeDefined()
    expect(screen.getByText(/PositionsTable > StatusBadge/)).toBeDefined()
    expect(document.querySelector('.adl-pin')?.textContent).toBe('1')
    expect(chip('resolved')).not.toBeNull()
    restore()
  })

  it('keeps the comment attached after a rebuild, and still flags the moved lock', async () => {
    const props = {
      selector: `[data-de-provenance-id="${ID.badge}"]`,
      body: 'a failed settlement is an error, not a caution',
    }
    const view = render(
      <Harness html={htmlV1()} lock={lockV1} manifest={manifestV1} buildId="build-a" {...props} />,
    )
    fireEvent.click(screen.getByText('leave feedback'))

    view.rerender(
      <Harness html={htmlV2()} lock={lockV2} manifest={manifestV2} buildId="build-b" {...props} />,
    )

    // The instrumenter's registry carried the source id into the new build, so
    // the anchor stays exact. Staleness is a separate question from anchoring:
    // the pinned inputs moved, and the thread says so. Waiting on the staleness
    // notice rather than the chip, because the chip reads the same before and
    // after the re-anchor pass now that the id survives.
    await waitFor(() =>
      expect(screen.getByText(/written against an older context lock/)).toBeDefined(),
    )
    expect(chip('resolved')).not.toBeNull()
    expect(screen.getByText('a failed settlement is an error, not a caution')).toBeDefined()
    expect(screen.getByText(/mfes.payments-dash: 2.4.1/)).toBeDefined()
  })

  it('reports the orphan rate and says what the chain tried', async () => {
    const props = {
      selector: `[data-de-provenance-id="${ID.heading}"]`,
      body: 'this figure needs a heading above it for the a11y tree',
    }
    const view = render(
      <Harness html={htmlV1()} lock={lockV1} manifest={manifestV1} buildId="build-a" {...props} />,
    )
    fireEvent.click(screen.getByText('leave feedback'))

    view.rerender(
      <Harness html={htmlV2()} lock={lockV2} manifest={manifestV2} buildId="build-b" {...props} />,
    )

    await waitFor(() =>
      expect(screen.getByText('1 lost their anchor in this build')).toBeDefined(),
    )
    expect(screen.getByText('100%')).toBeDefined()
    expect(screen.getByText(/why \(5 levels tried\)/)).toBeDefined()
    expect(document.querySelector('.adl-pin')).toBeNull()
  })
})

describe('choosing what the agent gets', () => {
  it('sends open threads the reviewer kept, and says what was closed or left out', async () => {
    const restore = stubRects()
    const onSubmit = vi.fn<(submission: FeedbackSubmission) => void>()
    render(
      <Harness
        html={htmlV1()}
        lock={lockV1}
        manifest={manifestV1}
        buildId="build-a"
        selector={`[data-de-provenance-id="${ID.badge}"]`}
        body="a failed settlement is an error, not a caution"
        dock
        onSubmit={onSubmit}
      />,
    )
    // Three on the same node (#1, #2, #3) ...
    fireEvent.click(screen.getByText('leave feedback'))
    fireEvent.click(screen.getByText('leave feedback'))
    fireEvent.click(screen.getByText('leave feedback'))

    // ... and one about the preview as a whole (#4), from the dock.
    fireEvent.click(screen.getByRole('button', { name: 'General feedback' }))
    const composer = screen.getByLabelText('general feedback')
    fireEvent.change(within(composer).getByLabelText('topic'), { target: { value: 'spacing' } })
    fireEvent.change(within(composer).getByLabelText('general feedback body'), {
      target: { value: 'the two panels sit on different vertical rhythms; use one spacing scale' },
    })
    fireEvent.click(within(composer).getByRole('button', { name: 'Comment' }))
    expect(screen.getByText(/general · spacing/)).toBeDefined()
    // General feedback is not on a node, so it gets no pin.
    expect(document.querySelectorAll('.adl-pin')).toHaveLength(3)

    // #3 is dealt with; #2 is a real comment the reviewer does not want acted on yet.
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[2]!)
    fireEvent.click(screen.getByLabelText('send comment 2 to the agent'))

    fireEvent.click(screen.getByRole('tab', { name: 'Submit' }))
    const digest = screen.getByLabelText('what will be sent').textContent ?? ''
    expect(digest).toContain('2 threads to act on (not included: 1 closed, 1 left out by the reviewer)')
    expect(digest).toContain('On specific elements')
    expect(digest).toContain('PositionsTable > StatusBadge')
    expect(digest).toContain('About the preview as a whole')
    expect(digest).toContain('2. spacing')
    expect(digest).toContain('use one spacing scale')

    fireEvent.click(screen.getByRole('button', { name: 'Send 2 threads to the agent' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const sent = onSubmit.mock.calls[0]![0]
    expect(sent.threads.map((thread) => thread.anchorType)).toEqual(['visual-node', 'general'])
    expect(sent.threads[1]!.topic).toBe('spacing')
    expect(sent.leftOut).toHaveLength(1)
    expect(sent.lock.id).toBe(lockV1.id)
    expect(screen.getByTestId('last-submission').textContent).toContain(sent.id)
    restore()
  })
})
