import { SaltProvider } from '@salt-ds/core'
import '@salt-ds/theme/index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import PaymentsDash from './v1/PaymentsDash'

/** Standalone entry. The shell loads the exposed modules instead. */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SaltProvider mode="dark" density="high">
      <PaymentsDash />
    </SaltProvider>
  </StrictMode>,
)
