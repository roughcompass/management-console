import {
  Button,
  Card,
  Checkbox,
  Dialog,
  Dropdown,
  Input,
  Link,
  Option,
  SaltProvider,
  TBody,
  TD,
  TR,
  Table,
  Text,
} from '@salt-ds/core'
import '@salt-ds/theme/index.css'
import { StrictMode, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'

/**
 * The Salt compatibility probe.
 *
 * Each component is rendered with the provenance attribute and the DOM is then
 * asked what happened to it. A TypeScript prop definition saying a component
 * spreads its rest props is not evidence; the rendered DOM is the contract
 * under test, so this runs in a real browser with the real theme.
 */
const PROBE_PREFIX = 'prv_PROBE'

interface Case {
  component: string
  package: string
  render(id: string): ReactNode
}

const CASES: Case[] = [
  { component: 'Button', package: '@salt-ds/core', render: (id) => <Button data-de-provenance-id={id}>Submit</Button> },
  { component: 'Input', package: '@salt-ds/core', render: (id) => <Input data-de-provenance-id={id} defaultValue="8891" /> },
  { component: 'Checkbox', package: '@salt-ds/core', render: (id) => <Checkbox data-de-provenance-id={id} label="Confirm" /> },
  {
    component: 'Dropdown',
    package: '@salt-ds/core',
    render: (id) => (
      <Dropdown data-de-provenance-id={id} defaultSelected={['USD']}>
        <Option value="USD" />
        <Option value="EUR" />
      </Dropdown>
    ),
  },
  { component: 'Card', package: '@salt-ds/core', render: (id) => <Card data-de-provenance-id={id}>Exposure</Card> },
  { component: 'Link', package: '@salt-ds/core', render: (id) => <Link href="#x" data-de-provenance-id={id}>Details</Link> },
  {
    component: 'Dialog',
    package: '@salt-ds/core',
    render: (id) => (
      <Dialog open data-de-provenance-id={id}>
        <Text>Confirm instruction</Text>
      </Dialog>
    ),
  },
  {
    component: 'Table',
    package: '@salt-ds/core',
    render: (id) => (
      <Table data-de-provenance-id={id}>
        <TBody>
          <TR>
            <TD>8891-USD</TD>
          </TR>
        </TBody>
      </Table>
    ),
  },
  {
    component: 'SaltProvider',
    package: '@salt-ds/core',
    render: (id) => (
      <SaltProvider density="high">
        <div data-de-provenance-id={id}>themed</div>
      </SaltProvider>
    ),
  },
]

export interface ProbeResult {
  component: string
  package: string
  carriers: number
  carrierTags: string[]
  /** Root elements the component rendered into its own container. */
  renderedRoots: number
  error?: string
}

function Probe({ index, entry }: { index: number; entry: Case }) {
  const id = `${PROBE_PREFIX}${String(index).padStart(4, '0')}`
  try {
    return (
      <div className="probe-host" data-probe={entry.component} data-probe-id={id}>
        {entry.render(id)}
      </div>
    )
  } catch (error) {
    return (
      <div className="probe-host" data-probe={entry.component} data-probe-id={id} data-probe-error={String(error)} />
    )
  }
}

function App() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    // One frame, so portalled components (Dialog) have mounted.
    const timer = setTimeout(() => {
      const results: ProbeResult[] = CASES.map((entry, index) => {
        const id = `${PROBE_PREFIX}${String(index).padStart(4, '0')}`
        const host = document.querySelector<HTMLElement>(`[data-probe-id="${id}"]`)
        const carriers = [...document.querySelectorAll(`[data-de-provenance-id="${id}"]`)]
        return {
          component: entry.component,
          package: entry.package,
          carriers: carriers.length,
          carrierTags: carriers.map((element) => element.tagName.toLowerCase()),
          renderedRoots: host?.childElementCount ?? 0,
          error: host?.getAttribute('data-probe-error') ?? undefined,
        }
      })
      ;(window as unknown as { __SALT_COMPAT__?: ProbeResult[] }).__SALT_COMPAT__ = results
      setReady(true)
    }, 300)
    return () => clearTimeout(timer)
  }, [])

  return (
    <SaltProvider mode="light" density="medium">
      <main style={{ padding: 24, display: 'grid', gap: 16 }}>
        <h1 data-probe-status={ready ? 'ready' : 'pending'}>Salt compatibility probe</h1>
        {CASES.map((entry, index) => (
          <section key={entry.component}>
            <h2 style={{ fontSize: 13 }}>{entry.component}</h2>
            <Probe index={index} entry={entry} />
          </section>
        ))}
      </main>
    </SaltProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
