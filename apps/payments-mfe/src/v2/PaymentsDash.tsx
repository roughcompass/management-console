import {
  Button,
  StackLayout,
  StatusIndicator,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Text,
} from '@salt-ds/core'
import { useEffect, useState } from 'react'
import type { Position } from '../data'
import { fetchPositions, money } from '../data'

/**
 * payments-dash 2.5.0: the same components after a refactor. They kept their
 * names, moved to a new file, restructured their markup and dropped the summary
 * card. This is what every open comment has to survive.
 */
const STATUS_SENTIMENT: Record<Position['status'], 'success' | 'warning' | 'error'> = {
  settled: 'success',
  pending: 'warning',
  failed: 'error',
}

/**
 * Status reads through Salt's own semantics rather than a colour, so a reviewer
 * can say "a failed settlement is an error, not a caution" and mean something
 * the build can act on.
 */
export function StatusBadge({ status, instanceKey }: { status: Position['status']; instanceKey: string }) {
  return (
    <span className="status status--dense" data-de-instance-key={instanceKey}>
      <StatusIndicator status={STATUS_SENTIMENT[status]} size={1} />
      <Text styleAs="label">{status}</Text>
    </span>
  )
}

export function PositionsTable({ positions }: { positions: Position[] }) {
  return (
    <div className="table-wrap">
      <Table zebra>
        <THead>
          <TR>
            <TH>Account</TH>
            <TH>Instrument</TH>
            <TH>Notional</TH>
            <TH>Status</TH>
          </TR>
        </THead>
        <TBody>
          {positions.map((position) => (
            <TR key={position.id} data-de-instance-key={position.id}>
              <TD>
                <span className="stack">{position.account}</span>
              </TD>
              <TD>{position.instrument}</TD>
              <TD>{money(position.notional, position.ccy)}</TD>
              <TD>
                <StatusBadge status={position.status} instanceKey={position.id} />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  )
}

export default function PaymentsDash() {
  const [positions, setPositions] = useState<Position[]>([])

  useEffect(() => {
    void fetchPositions('8891').then(setPositions).catch(() => {})
  }, [])

  return (
    <section className="mfe" data-mfe="payments-dash" data-mfe-version="2.5.0">
      <StackLayout gap={2}>
        <div className="mfe-head">
          <Text styleAs="h3">Payments</Text>
          <Button
            appearance="solid"
            sentiment="accented"
          >
            New instruction
          </Button>
        </div>
        <PositionsTable positions={positions} />
      </StackLayout>
    </section>
  )
}
