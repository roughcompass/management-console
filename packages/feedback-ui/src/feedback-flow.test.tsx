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
import type { ChangeRequest } from './change-request.js'
import type { ReviewVersion } from './versions.js'

const designer: Actor = { id: 'u-dw', name: 'Dana Whitfield', role: 'design' }
const engineer: Actor = { id: 'u-mo', name: 'Miles Okonjo', role: 'engineering' }

const V1: ReviewVersion = { id: 'build-a', label: 'Version 1', createdAt: lockV1.createdAt }
const V2: ReviewVersion = { id: 'build-b', label: 'Version 2', createdAt: lockV2.createdAt }

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

interface HarnessProps {
  html: string
  lock: ContextLock
  manifest: ProvenanceManifest
  buildId: string
  selector: string
  body: string
  actor?: Actor
  versions?: ReviewVersion[]
  onRequestChanges?: (request: ChangeRequest) => void
  onViewVersion?: (id: string) => void
  onApprove?: (version: ReviewVersion) => void
}

function Harness(props: HarnessProps) {
  const previewRef = useRef<HTMLDivElement>(null)
  return (
    <FeedbackProvider
      actor={props.actor ?? designer}
      previewId="pr-1042"
      lock={props.lock}
      manifest={props.manifest}
      buildId={props.buildId}
      previewRef={previewRef}
      versions={props.versions}
      onRequestChanges={props.onRequestChanges}
      onViewVersion={props.onViewVersion}
      onApprove={props.onApprove}
      // The settle delay exists for lazily loaded remotes; tests drive the DOM
      // themselves and would otherwise wait on a timer for no reason.
      settleMs={0}
    >
      <div ref={previewRef} data-testid="preview" dangerouslySetInnerHTML={{ __html: props.html }} />
      <Probe selector={props.selector} body={props.body} />
      <FeedbackPanel />
      <FeedbackLayer />
      <FeedbackDock />
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

/** The assertions below read the engineering layer, which is off by default. */
function showDetails() {
  const toggle = screen.getByRole('button', { name: 'Technical details' })
  if (toggle.getAttribute('aria-pressed') !== 'true') fireEvent.click(toggle)
}

afterEach(() => {
  cleanup()
  // The details preference is remembered per reviewer; not across tests.
  localStorage.clear()
})

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
    // The reviewer sees the thing in the words of the page; the anchor status
    // and the path sit behind the Details disclosure until asked for.
    expect(screen.getByText(/^Status badge/)).toBeDefined()
    expect(chip('resolved')?.closest('details')).not.toBeNull()
    expect(screen.getByText(/PositionsTable > StatusBadge/).closest('details')).not.toBeNull()
    expect(document.querySelector('.adl-pin')?.textContent).toBe('1')

    showDetails()
    expect(chip('resolved')?.closest('details')).toBeNull()
    expect(screen.getByText(/PositionsTable > StatusBadge/).closest('details')).toBeNull()
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
    showDetails()
    fireEvent.click(screen.getByText('leave feedback'))

    view.rerender(
      <Harness html={htmlV2()} lock={lockV2} manifest={manifestV2} buildId="build-b" {...props} />,
    )

    // The instrumenter's registry carried the source id into the new build, so
    // the anchor stays exact. Staleness is a separate question from anchoring:
    // the pinned inputs moved, and the comment says so.
    await waitFor(() =>
      expect(screen.getByText(/written against an older context lock/)).toBeDefined(),
    )
    expect(chip('resolved')).not.toBeNull()
    expect(screen.getByText('a failed settlement is an error, not a caution')).toBeDefined()
    expect(screen.getByText(/mfes.payments-dash: 2.4.1/)).toBeDefined()
  })

  it('says a comment is gone when the rebuild removed what it was on', async () => {
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

    // Plain language for the reviewer, with the reason next to it.
    await waitFor(() => expect(screen.getByText('Gone')).toBeDefined())
    expect(screen.getByText('This is not on the page in this version.')).toBeDefined()
    expect(document.querySelector('.adl-pin')).toBeNull()

    showDetails()
    expect(screen.getByText('100%')).toBeDefined()
    expect(screen.getByText(/why \(5 levels tried\)/)).toBeDefined()
  })
})

describe("the reviewer's round trip", () => {
  it('comments, asks for the next version, then goes back and approves', async () => {
    const restore = stubRects()
    const onRequestChanges = vi.fn<(request: ChangeRequest) => void>()
    const onViewVersion = vi.fn<(id: string) => void>()
    const onApprove = vi.fn<(version: ReviewVersion) => void>()
    const props = {
      selector: `[data-de-provenance-id="${ID.badge}"]`,
      body: 'a failed settlement is an error, not a caution',
      onRequestChanges,
      onViewVersion,
      onApprove,
    }

    const view = render(
      <Harness
        html={htmlV1()}
        lock={lockV1}
        manifest={manifestV1}
        buildId="build-a"
        versions={[V1]}
        {...props}
      />,
    )

    // She arrives able to comment, not needing to arm anything first.
    expect(screen.getByRole('button', { name: 'Comment' }).getAttribute('aria-pressed')).toBe('true')

    // Three on the page ...
    fireEvent.click(screen.getByText('leave feedback'))
    fireEvent.click(screen.getByText('leave feedback'))
    fireEvent.click(screen.getByText('leave feedback'))

    // ... and one about the page as a whole.
    fireEvent.click(screen.getByRole('button', { name: 'Comment on the whole page' }))
    const wholePage = screen.getByLabelText('whole page comment')
    fireEvent.change(within(wholePage).getByLabelText('topic'), { target: { value: 'Spacing' } })
    fireEvent.change(within(wholePage).getByLabelText('whole page comment body'), {
      target: { value: 'the two panels sit on different vertical rhythms; use one spacing scale' },
    })
    fireEvent.click(within(wholePage).getByRole('button', { name: 'Comment' }))
    expect(screen.getByText('Spacing — about the whole page')).toBeDefined()
    // Page-wide feedback is not on a node, so it gets no pin.
    expect(document.querySelectorAll('.adl-pin')).toHaveLength(3)

    // #3 is dealt with, so it never goes.
    fireEvent.click(screen.getAllByRole('button', { name: 'Mark done' })[2]!)
    expect(screen.getByText('1 comment marked done')).toBeDefined()

    // #2 she wants kept but not acted on yet.
    fireEvent.click(screen.getByRole('button', { name: 'Request changes (3)' }))
    fireEvent.click(screen.getByLabelText('include comment 2'))
    const brief = screen.getByLabelText('the brief').textContent ?? ''
    expect(brief).toContain('2 comments to act on (not included: 1 done, 1 left out by the reviewer)')
    expect(brief).toContain('On parts of the page')
    expect(brief).toContain('1. Status badge')
    expect(brief).toContain('PositionsTable > StatusBadge')
    expect(brief).toContain('About the whole page')
    expect(brief).toContain('use one spacing scale')

    fireEvent.click(screen.getByRole('button', { name: 'Send 2 comments' }))
    await waitFor(() => expect(onRequestChanges).toHaveBeenCalledTimes(1))
    const request = onRequestChanges.mock.calls[0]![0]
    expect(request.comments.map((comment) => comment.anchorType)).toEqual(['visual-node', 'general'])
    expect(request.comments[0]!.label).toMatch(/^Status badge/)
    expect(request.notIncluded).toHaveLength(1)
    expect(request.fromVersion.label).toBe('Version 1')

    // The next version arrives and she is looking at it.
    view.rerender(
      <Harness
        html={htmlV2()}
        lock={lockV2}
        manifest={manifestV2}
        buildId="build-b"
        versions={[V1, { ...V2, addressing: request.comments.map((c) => c.commentId) }]}
        {...props}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Versions' }))
    expect(screen.getByText("You're viewing this")).toBeDefined()
    expect(screen.getByText(/Built from 2 comments/)).toBeDefined()

    // Wrong? Go back to what she had.
    fireEvent.click(screen.getByRole('button', { name: 'Go back to Version 1' }))
    expect(onViewVersion).toHaveBeenCalledWith('build-a')

    // Right? Approve it, and it is marked ready to deploy.
    fireEvent.click(screen.getByRole('button', { name: 'Approve for deployment' }))
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1))
    expect(onApprove.mock.calls[0]![0].label).toBe('Version 2')
    expect(screen.getByText('Ready to deploy')).toBeDefined()
    expect(screen.getByText(/Approved by Dana Whitfield/)).toBeDefined()
    restore()
  })

  it('lets her withdraw her own comment, but only hers and only on purpose', () => {
    const restore = stubRects()
    const props = {
      html: htmlV1(),
      lock: lockV1,
      manifest: manifestV1,
      buildId: 'build-a',
      selector: `[data-de-provenance-id="${ID.badge}"]`,
      body: 'a failed settlement is an error, not a caution',
    }
    const view = render(<Harness {...props} />)
    fireEvent.click(screen.getByText('leave feedback'))
    fireEvent.click(screen.getByText('leave feedback'))
    expect(document.querySelectorAll('.adl-pin')).toHaveLength(2)

    // One click arms it; the comment is still there until she says so again.
    fireEvent.click(screen.getByLabelText('delete comment 1'))
    expect(screen.getAllByText(props.body)).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(document.querySelectorAll('.adl-pin')).toHaveLength(2)

    fireEvent.click(screen.getByLabelText('delete comment 1'))
    fireEvent.click(screen.getByLabelText('delete comment 1, confirm'))
    // Gone from the list and off the page, and the one left is renumbered.
    expect(document.querySelectorAll('.adl-pin')).toHaveLength(1)
    expect(screen.getByText('1 open comment')).toBeDefined()
    expect(document.querySelector('.adl-pin')?.textContent).toBe('1')

    // Someone else's feedback is not hers to withdraw.
    view.rerender(<Harness {...props} actor={engineer} />)
    expect(screen.queryByLabelText('delete comment 1')).toBeNull()
    restore()
  })

  it('removes a reply without removing the comment it is on', () => {
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
    const reply = screen.getByLabelText('reply to comment 1')
    fireEvent.change(reply, { target: { value: 'agreed, error sentiment' } })
    fireEvent.submit(reply)
    expect(screen.getByText('agreed, error sentiment')).toBeDefined()

    fireEvent.click(screen.getByLabelText('delete reply 1 on comment 1'))
    fireEvent.click(screen.getByLabelText('delete reply 1 on comment 1, confirm'))
    expect(screen.queryByText('agreed, error sentiment')).toBeNull()
    expect(screen.getByText('a failed settlement is an error, not a caution')).toBeDefined()
    expect(document.querySelectorAll('.adl-pin')).toHaveLength(1)
    restore()
  })

  it('hands the page back in Browse mode', () => {
    render(
      <Harness
        html={htmlV1()}
        lock={lockV1}
        manifest={manifestV1}
        buildId="build-a"
        selector={`[data-de-provenance-id="${ID.badge}"]`}
        body="unused"
      />,
    )
    expect(document.documentElement.hasAttribute('data-adl-commenting')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Browse' }))
    expect(document.documentElement.hasAttribute('data-adl-commenting')).toBe(false)
  })
})
