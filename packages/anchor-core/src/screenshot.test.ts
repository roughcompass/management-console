import { describe, expect, it, vi } from 'vitest'
import { captureElementImage } from './screenshot.js'

describe('crop capture', () => {
  it('returns undefined rather than throwing when the page cannot render one', async () => {
    // jsdom has no canvas. A missing crop must never cost the comment.
    document.body.innerHTML = '<div id="target">Unsettled exposure</div>'
    const element = document.querySelector('#target')!
    await expect(captureElementImage(element)).resolves.toBeUndefined()
  })

  it('skips a zero-area element instead of producing an empty image', async () => {
    document.body.innerHTML = '<div id="target"></div>'
    const capture = vi.fn()
    await expect(captureElementImage(document.querySelector('#target')!)).resolves.toBeUndefined()
    expect(capture).not.toHaveBeenCalled()
  })

  it('defers to a host-supplied capture when the preview has a screenshot service', async () => {
    document.body.innerHTML = '<div id="target">x</div>'
    const capture = vi.fn(async () => 'data:image/png;base64,AAA')
    const crop = await captureElementImage(document.querySelector('#target')!, { capture })
    expect(crop).toBe('data:image/png;base64,AAA')
    expect(capture).toHaveBeenCalledOnce()
  })

  it('swallows a failing host capture', async () => {
    document.body.innerHTML = '<div id="target">x</div>'
    const capture = vi.fn(async () => {
      throw new Error('screenshot service down')
    })
    await expect(
      captureElementImage(document.querySelector('#target')!, { capture }),
    ).resolves.toBeUndefined()
  })
})
