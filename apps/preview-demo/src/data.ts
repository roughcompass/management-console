export interface Position {
  id: string
  account: string
  instrument: string
  notional: number
  ccy: string
  status: 'settled' | 'pending' | 'failed'
}

export interface Limit {
  id: string
  name: string
  used: number
  cap: number
}

export async function fetchPositions(accountId: string): Promise<Position[]> {
  const res = await fetch(`/api/accounts/${accountId}/positions`)
  const body = (await res.json()) as { positions: Position[] }
  return body.positions
}

export async function fetchLimits(): Promise<Limit[]> {
  const res = await fetch('/api/limits')
  const body = (await res.json()) as { limits: Limit[] }
  return body.limits
}

export function money(value: number, ccy: string): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: ccy,
    maximumFractionDigits: 0,
  }).format(value)
}
