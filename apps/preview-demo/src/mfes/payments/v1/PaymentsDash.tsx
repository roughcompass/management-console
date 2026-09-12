import { money } from '../../../data'
import type { Position } from '../../../data'

export function StatusBadge({ status, instanceKey }: { status: Position['status']; instanceKey: string }) {
  return (
    <span
      className="badge"
      data-prov-key={instanceKey}
      data-tokens={`color.status.${status}.background=background-color;radius.pill=border-radius`}
    >
      {status}
    </span>
  )
}

export function SummaryCard({ positions }: { positions: Position[] }) {
  const unsettled = positions.filter((p) => p.status !== 'settled')
  const total = unsettled.reduce((sum, p) => sum + p.notional, 0)
  return (
    <section className="card" data-tokens="space.card.padding=padding;color.surface.raised=background-color">
      <h3 data-tokens="type.display.sm=font-size">Unsettled exposure</h3>
      <p className="figure">{money(total, 'USD')}</p>
      <p className="muted">{unsettled.length} of {positions.length} positions</p>
    </section>
  )
}

export function PositionsTable({ positions }: { positions: Position[] }) {
  return (
    <table className="positions">
      <thead>
        <tr>
          <th>Account</th>
          <th>Instrument</th>
          <th>Notional</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {positions.map((position) => (
          <tr key={position.id} data-prov-key={position.id}>
            <td>{position.account}</td>
            <td className="mono">{position.instrument}</td>
            <td className="num">{money(position.notional, position.ccy)}</td>
            <td>
              <StatusBadge status={position.status} instanceKey={position.id} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function PaymentsDash({ positions }: { positions: Position[] }) {
  return (
    <section className="mfe" data-mfe="payments-dash" data-mfe-version="2.4.1">
      <header className="mfe-head">
        <h2>Payments</h2>
        <button type="button" className="action" data-tokens="color.action.primary.background=background-color">
          New instruction
        </button>
      </header>
      <SummaryCard positions={positions} />
      <PositionsTable positions={positions} />
    </section>
  )
}
