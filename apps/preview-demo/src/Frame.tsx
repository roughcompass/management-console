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
        <span className="brand">CIB Web Frame</span>
        <nav className="frame-nav">
          <a href="#payments" className="active">Payments</a>
          <a href="#limits">Limits</a>
          <a href="#reports">Reports</a>
        </nav>
        <span className="persona">m.okonjo · Markets Ops</span>
      </header>
      <div className="frame-body">
        <main data-zone="main">{main}</main>
        <aside data-zone="side">{side}</aside>
      </div>
    </div>
  )
}
