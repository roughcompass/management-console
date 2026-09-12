import {
  Button,
  Card,
  Dialog,
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
    <span className="status" data-de-instance-key={instanceKey}>
      <StatusIndicator status={STATUS_SENTIMENT[status]} size={1} />
      <Text>{status}</Text>
    </span>
  )
}

export function SummaryCard({ positions }: { positions: Position[] }) {
  const unsettled = positions.filter((position) => position.status !== 'settled')
  const total = unsettled.reduce((sum, position) => sum + position.notional, 0)
  return (
    <Card>
      <StackLayout gap={0.5}>
        <Text styleAs="label" color="secondary">
          Unsettled exposure
        </Text>
        <Text styleAs="display3">{money(total, 'USD')}</Text>
        <Text styleAs="label" color="secondary">
          {unsettled.length} of {positions.length} positions
        </Text>
      </StackLayout>
    </Card>
  )
}

export function PositionsTable({ positions }: { positions: Position[] }) {
  return (
    <Table>
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
            <TD>{position.account}</TD>
            <TD>{position.instrument}</TD>
            <TD>{money(position.notional, position.ccy)}</TD>
            <TD>
              <StatusBadge status={position.status} instanceKey={position.id} />
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  )
}

/** payments-dash 2.4.1 */
export default function PaymentsDash() {
  const [positions, setPositions] = useState<Position[]>([])
  const [instructionOpen, setInstructionOpen] = useState(false)

  useEffect(() => {
    void fetchPositions('8891').then(setPositions).catch(() => {})
  }, [])

  return (
    <section className="mfe" data-mfe="payments-dash" data-mfe-version="2.4.1">
      <StackLayout gap={2}>
        <div className="mfe-head">
          <Text styleAs="h3">Payments</Text>
          <Button
            appearance="solid"
            sentiment="accented"
            onClick={() => setInstructionOpen(true)}
          >
            New instruction
          </Button>
        </div>
        <SummaryCard positions={positions} />
        <PositionsTable positions={positions} />
        {/* Salt renders a dialog through a portal, so its DOM is not under the
            MFE root. Provenance has to survive that. */}
        <Dialog open={instructionOpen} onOpenChange={setInstructionOpen}>
          <div className="dialog-body" data-de-instance-key="instruction-dialog">
            <Text>Confirm the instruction before sending it for approval.</Text>
            <Button appearance="bordered" onClick={() => setInstructionOpen(false)}>
              Close
            </Button>
          </div>
        </Dialog>
      </StackLayout>
    </section>
  )
}
