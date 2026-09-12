import type { Actor, ContextLock, ProvenanceManifest } from '@adl/anchor-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  htmlV1,
  htmlV2,
  lockV1,
  lockV2,
  manifestV1,
  manifestV2,
} from '../../anchor-core/src/__fixtures__/dom.js'
import { FeedbackLayer } from './FeedbackLayer.js'
import { FeedbackPanel } from './FeedbackPanel.js'
import { FeedbackProvider, useFeedback } from './context.js'

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
}: {
  html: string
  lock: ContextLock
  manifest: ProvenanceManifest
  buildId: string
  selector: string
  body: string
}) {
  const previewRef = useRef<HTMLDivElement>(null)
  return (
    <FeedbackProvider actor={designer} lock={lock} manifest={manifest} buildId={buildId} previewRef={previewRef}>
      <div ref={previewRef} data-testid="preview" dangerouslySetInnerHTML={{ __html: html }} />
      <Probe selector={selector} body={body} />
      <FeedbackPanel />
      <FeedbackLayer />
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
        selector='[data-prov="m1:9:5"]'
        body="this badge is the wrong blue"
      />,
    )
    fireEvent.click(screen.getByText('leave feedback'))

    expect(screen.getByText('this badge is the wrong blue')).toBeDefined()
    expect(screen.getByText(/PositionsTable > StatusBadge/)).toBeDefined()
    expect(document.querySelector('.adl-pin')?.textContent).toBe('1')
    expect(chip('resolved')).not.toBeNull()
    restore()
  })

  it('keeps the comment attached after a rebuild, and marks how it held', () => {
    const props = {
      selector: '[data-prov="m1:9:5"]',
      body: 'this badge is the wrong blue',
    }
    const view = render(
      <Harness html={htmlV1()} lock={lockV1} manifest={manifestV1} buildId="build-a" {...props} />,
    )
    fireEvent.click(screen.getByText('leave feedback'))

    view.rerender(
      <Harness html={htmlV2()} lock={lockV2} manifest={manifestV2} buildId="build-b" {...props} />,
    )

    expect(screen.getByText('this badge is the wrong blue')).toBeDefined()
    expect(chip('degraded')).not.toBeNull()
    expect(screen.getByText(/written against an older context lock/)).toBeDefined()
    expect(screen.getByText(/mfes.payments-dash: 2.4.1/)).toBeDefined()
  })

  it('reports the orphan rate and says what the chain tried', () => {
    const props = {
      selector: '[data-prov="m1:31:7"]',
      body: 'this heading is too quiet',
    }
    const view = render(
      <Harness html={htmlV1()} lock={lockV1} manifest={manifestV1} buildId="build-a" {...props} />,
    )
    fireEvent.click(screen.getByText('leave feedback'))

    view.rerender(
      <Harness html={htmlV2()} lock={lockV2} manifest={manifestV2} buildId="build-b" {...props} />,
    )

    expect(screen.getByText('1 lost their anchor in this build')).toBeDefined()
    expect(screen.getByText('100%')).toBeDefined()
    expect(screen.getByText(/why \(5 levels tried\)/)).toBeDefined()
    expect(document.querySelector('.adl-pin')).toBeNull()
  })
})
