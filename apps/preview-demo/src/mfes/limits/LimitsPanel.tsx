import type { Limit } from '../../data'
import { money } from '../../data'

export function LimitBar({ limit }: { limit: Limit }) {
  return (
    <li className="limit" data-prov-key={limit.id}>
      <div className="limit-head">
        <span>{limit.name}</span>
        <span className="mono">{Math.round(limit.used * 100)}%</span>
      </div>
      <div className="bar" data-tokens="color.surface.sunken=background-color">
        <div
          className="bar-fill"
          style={{ width: `${limit.used * 100}%` }}
          data-tokens="color.action.primary.background=background-color"
        />
      </div>
      <span className="muted">cap {money(limit.cap, 'USD')}</span>
    </li>
  )
}

export function LimitsPanel({ limits }: { limits: Limit[] }) {
  return (
    <section className="mfe" data-mfe="limits-panel" data-mfe-version="1.2.0">
      <header className="mfe-head">
        <h2>Limits</h2>
      </header>
      <ul className="limits">
        {limits.map((limit) => (
          <LimitBar key={limit.id} limit={limit} />
        ))}
      </ul>
    </section>
  )
}
