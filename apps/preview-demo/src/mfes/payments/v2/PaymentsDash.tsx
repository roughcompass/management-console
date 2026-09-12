import { money } from '../../../data'
import type { Position } from '../../../data'

/**
 * The same MFE after a rebuild: the components keep their names, the markup is
 * restructured, the summary card is gone, and the version is bumped. This is
 * what every open comment has to survive.
 */
export function StatusBadge({ status, instanceKey }: { status: Position['status']; instanceKey: string }) {
  return (
    <span
      className="badge badge--pill"
      data-prov-key={instanceKey}
      data-tokens={`color.status.${status}.background=background-color;radius.pill=border-radius`}
    >
      <i className="dot" />
      {status}
    </span>
  )
}

export function PositionsTable({ positions }: { positions: Position[] }) {
  return (
    <div className="table-wrap">
      <table className="positions positions--dense">
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
              <td>
                <span className="stack">{position.account}</span>
              </td>
              <td className="mono">{position.instrument}</td>
              <td className="num">{money(position.notional, position.ccy)}</td>
              <td>
                <StatusBadge status={position.status} instanceKey={position.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function PaymentsDash({ positions }: { positions: Position[] }) {
  return (
    <section className="mfe" data-mfe="payments-dash" data-mfe-version="2.5.0">
      <header className="mfe-head">
        <h2>Payments</h2>
        <button type="button" className="action" data-tokens="color.action.primary.background=background-color">
          New instruction
        </button>
      </header>
      <PositionsTable positions={positions} />
    </section>
  )
}
