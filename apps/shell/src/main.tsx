import { SaltProvider } from '@salt-ds/core'
import '@salt-ds/theme/index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App, PREVIEW_ID } from './App'
import './shell.css'

const RUNTIME_EVENTS = [
  'frame:context-hydrated',
  'frame:capability-resolved',
  'frame:entitlement-decision',
  'frame:remote-loaded',
]

const REVIEWER = { id: 'u-dw', name: 'Dana Whitfield', role: 'design' } as const

// Preview-only. The condition is replaced at build time, so a production build
// drops the import with the whole review layer behind it.
const REVIEW_ENABLED = import.meta.env.MODE !== 'production'

// Attached before anything renders, so the recorder is listening for the remote
// entry fetches and the first data calls rather than joining part way through.
if (REVIEW_ENABLED) {
  const review = await import('./review')
  await review.startReview({
    previewRoot: '#preview',
    previewId: PREVIEW_ID,
    actor: REVIEWER,
    runtimeEvents: RUNTIME_EVENTS,
    theme: 'dark',
  })
}

window.dispatchEvent(
  new CustomEvent('frame:context-hydrated', { detail: { tenant: 'markets', ms: 84 } }),
)
window.dispatchEvent(
  new CustomEvent('frame:capability-resolved', {
    detail: { capability: 'payments.instruction.create', source: 'registry@2026-09-11' },
  }),
)
window.dispatchEvent(
  new CustomEvent('frame:entitlement-decision', {
    detail: { entitlement: 'payments.limits.view', decision: 'allow', persona: 'markets-ops' },
  }),
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SaltProvider mode="dark" density="high">
      <App />
    </SaltProvider>
  </StrictMode>,
)
