import { SaltProvider } from '@salt-ds/core'
import '@salt-ds/theme/index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import LimitsPanel from './LimitsPanel'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SaltProvider mode="dark" density="high">
      <LimitsPanel />
    </SaltProvider>
  </StrictMode>,
)
