import { Spinner, Text } from '@salt-ds/core'
import { Suspense } from 'react'
import type { ReactNode } from 'react'

/**
 * The host Frame supplies the zone and MFE segments of every semantic path.
 * That is the runtime half of the provenance contract; the build plugin
 * supplies the component half.
 */
export function Frame({ main, side }: { main: ReactNode; side: ReactNode }) {
  return (
    <div className="frame" data-frame="cib-frame" data-frame-version="3.1">
      <header className="frame-head" data-zone="header">
        <Text styleAs="h4">CIB Web Frame</Text>
        <nav className="frame-nav">
          <a href="#payments" className="active">
            Payments
          </a>
          <a href="#limits">Limits</a>
          <a href="#reports">Reports</a>
        </nav>
        <Text color="secondary">m.okonjo · Markets Ops</Text>
      </header>
      <div className="frame-body">
        <main data-zone="main">
          <Suspense fallback={<Zoneloading name="payments-dash" />}>{main}</Suspense>
        </main>
        <aside data-zone="side">
          <Suspense fallback={<Zoneloading name="limits-panel" />}>{side}</Suspense>
        </aside>
      </div>
    </div>
  )
}

function Zoneloading({ name }: { name: string }) {
  return (
    <div className="zone-loading">
      <Spinner size="small" />
      <Text color="secondary">loading {name}…</Text>
    </div>
  )
}
