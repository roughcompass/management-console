import { LinearProgress, StackLayout, Text } from '@salt-ds/core'
import { useEffect, useState } from 'react'

export interface Limit {
  id: string
  name: string
  used: number
  cap: number
}

const API = import.meta.env.VITE_LIMITS_API ?? 'http://localhost:5275'

async function fetchLimits(): Promise<Limit[]> {
  const res = await fetch(`${API}/api/limits`)
  const body = (await res.json()) as { limits: Limit[] }
  return body.limits
}

function money(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

export function LimitBar({ limit }: { limit: Limit }) {
  return (
    <li data-de-instance-key={limit.id}>
      <StackLayout gap={0.5}>
        <div className="limit-head">
          <Text>{limit.name}</Text>
          <Text color="secondary">{Math.round(limit.used * 100)}%</Text>
        </div>
        <LinearProgress
          value={Math.round(limit.used * 100)}
          hideLabel
          data-tokens="--salt-accent-background=background-color"
        />
        <Text styleAs="label" color="secondary">
          cap {money(limit.cap)}
        </Text>
      </StackLayout>
    </li>
  )
}

/** limits-panel 1.2.0 */
export default function LimitsPanel() {
  const [limits, setLimits] = useState<Limit[]>([])

  useEffect(() => {
    void fetchLimits().then(setLimits).catch(() => {})
  }, [])

  return (
    <section className="mfe" data-mfe="limits-panel" data-mfe-version="1.2.0">
      <StackLayout gap={2}>
        <Text styleAs="h3">Limits</Text>
        <ul className="limits">
          {limits.map((limit) => (
            <LimitBar key={limit.id} limit={limit} />
          ))}
        </ul>
      </StackLayout>
    </section>
  )
}
