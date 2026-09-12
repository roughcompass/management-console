import { StackLayout, Text } from '@salt-ds/core'
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
    <StackLayout as="section" gap={1} className="boundaries" data-boundaries="">
      <Text styleAs="label" color="secondary">
        instrumenter boundary probes
      </Text>
      <div className="shadow-host" ref={shadowHost} />
      <iframe title="external report" className="external" src="about:blank" />
    </StackLayout>
  )
}
