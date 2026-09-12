import { useEffect, useRef } from 'react'

/**
 * Two boundaries the instrumenter has to be honest about. Neither is contrived:
 * a design system renders into open shadow roots, and a bank preview embeds a
 * third-party document more often than anyone would like.
 */
export function BoundaryProbes() {
  const shadowHost = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = shadowHost.current
    if (!host || host.shadowRoot) return
    const root = host.attachShadow({ mode: 'open' })
    root.innerHTML = `<button id="shadow-button" style="font:inherit">Inside an open shadow root</button>`
  }, [])

  return (
    <section className="boundaries" data-boundaries="">
      <div className="shadow-host" ref={shadowHost} />
      <iframe title="external report" className="external" src="about:blank" />
    </section>
  )
}
