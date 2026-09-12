export interface Position {
  id: string
  account: string
  instrument: string
  notional: number
  ccy: string
  status: 'settled' | 'pending' | 'failed'
}

/**
 * An MFE talks to its own service, not to the shell's origin. The preview
 * proves that path works, and the toolbar's network tab anchors to it.
 */
const API = import.meta.env.VITE_PAYMENTS_API ?? 'http://localhost:5274'

export async function fetchPositions(accountId: string): Promise<Position[]> {
  const res = await fetch(`${API}/api/accounts/${accountId}/positions`)
  const body = (await res.json()) as { positions: Position[] }
  return body.positions
}

export function money(value: number, ccy: string): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: ccy,
    maximumFractionDigits: 0,
  }).format(value)
}
