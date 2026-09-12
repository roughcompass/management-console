import { createLocalStorageRepository } from '@adl/feedback-store'
import { PreviewRecorder, declareRuntimeEvents } from '@adl/feedback-ui'
import { SaltProvider } from '@salt-ds/core'
import '@salt-ds/theme/index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './shell.css'

const RUNTIME_EVENTS = [
  'frame:context-hydrated',
  'frame:capability-resolved',
  'frame:entitlement-decision',
  'frame:remote-loaded',
]

// Start recording before anything loads: the remote entry fetches and the
// first data calls are exactly what a developer wants to comment on.
declareRuntimeEvents(RUNTIME_EVENTS)
const recorder = new PreviewRecorder()
recorder.start()

const repository = createLocalStorageRepository()

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
      <App recorder={recorder} repository={repository} />
    </SaltProvider>
  </StrictMode>,
)
