import {
  Avatar,
  BorderItem,
  BorderLayout,
  Button,
  Card,
  Checkbox,
  Dialog,
  Dropdown,
  FlexLayout,
  Input,
  LinearProgress,
  Link,
  NavigationItem,
  Option,
  Pill,
  SaltProvider,
  Spinner,
  StackLayout,
  StatusIndicator,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Text,
  ToggleButton,
  ToggleButtonGroup,
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
    component: 'StatusIndicator',
    package: '@salt-ds/core',
    render: (id) => <StatusIndicator status="error" data-de-provenance-id={id} />,
  },
  { component: 'Pill', package: '@salt-ds/core', render: (id) => <Pill data-de-provenance-id={id}>Markets</Pill> },
  {
    component: 'SaltProvider',
    package: '@salt-ds/core',
    render: (id) => (
      <SaltProvider density="high">
        <div data-de-provenance-id={id}>themed</div>
      </SaltProvider>
    ),
  },
  // Everything else the fixtures actually render. A Salt-first application is
  // mostly Salt components, so the catalog has to cover what it uses or most
  // of the page resolves to an ancestor instead of to itself.
  { component: 'Text', package: '@salt-ds/core', render: (id) => <Text data-de-provenance-id={id}>Positions</Text> },
  { component: 'Avatar', package: '@salt-ds/core', render: (id) => <Avatar name="Miles Okonjo" data-de-provenance-id={id} /> },
  { component: 'Spinner', package: '@salt-ds/core', render: (id) => <Spinner size="small" data-de-provenance-id={id} /> },
  { component: 'StackLayout', package: '@salt-ds/core', render: (id) => <StackLayout data-de-provenance-id={id}><Text>a</Text></StackLayout> },
  { component: 'FlexLayout', package: '@salt-ds/core', render: (id) => <FlexLayout data-de-provenance-id={id}><Text>a</Text></FlexLayout> },
  {
    component: 'BorderLayout',
    package: '@salt-ds/core',
    render: (id) => (
      <BorderLayout data-de-provenance-id={id}>
        <BorderItem position="center">centre</BorderItem>
      </BorderLayout>
    ),
  },
  {
    component: 'BorderItem',
    package: '@salt-ds/core',
    render: (id) => (
      <BorderLayout>
        <BorderItem position="center" data-de-provenance-id={id}>
          centre
        </BorderItem>
      </BorderLayout>
    ),
  },
  {
    component: 'NavigationItem',
    package: '@salt-ds/core',
    render: (id) => (
      <NavigationItem href="#payments" data-de-provenance-id={id}>
        Payments
      </NavigationItem>
    ),
  },
  { component: 'LinearProgress', package: '@salt-ds/core', render: (id) => <LinearProgress value={62} data-de-provenance-id={id} /> },
  {
    component: 'ToggleButtonGroup',
    package: '@salt-ds/core',
    render: (id) => (
      <ToggleButtonGroup defaultValue="a" data-de-provenance-id={id}>
        <ToggleButton value="a">A</ToggleButton>
      </ToggleButtonGroup>
    ),
  },
  {
    component: 'ToggleButton',
    package: '@salt-ds/core',
    render: (id) => (
      <ToggleButtonGroup defaultValue="a">
        <ToggleButton value="a" data-de-provenance-id={id}>
          A
        </ToggleButton>
      </ToggleButtonGroup>
    ),
  },
  {
    component: 'THead',
    package: '@salt-ds/core',
    render: (id) => (
      <Table>
        <THead data-de-provenance-id={id}>
          <TR>
            <TH>Account</TH>
          </TR>
        </THead>
      </Table>
    ),
  },
  {
    component: 'TH',
    package: '@salt-ds/core',
    render: (id) => (
      <Table>
        <THead>
          <TR>
            <TH data-de-provenance-id={id}>Account</TH>
          </TR>
        </THead>
      </Table>
    ),
  },
  {
    component: 'TBody',
    package: '@salt-ds/core',
    render: (id) => (
      <Table>
        <TBody data-de-provenance-id={id}>
          <TR>
            <TD>8891</TD>
          </TR>
        </TBody>
      </Table>
    ),
  },
  {
    component: 'TR',
    package: '@salt-ds/core',
    render: (id) => (
      <Table>
        <TBody>
          <TR data-de-provenance-id={id}>
            <TD>8891</TD>
          </TR>
        </TBody>
      </Table>
    ),
  },
  {
    component: 'TD',
    package: '@salt-ds/core',
    render: (id) => (
      <Table>
        <TBody>
          <TR>
            <TD data-de-provenance-id={id}>8891</TD>
          </TR>
        </TBody>
      </Table>
    ),
  },
  {
    component: 'Option',
    package: '@salt-ds/core',
    render: (id) => (
      <Dropdown open defaultSelected={['USD']}>
        <Option value="USD" data-de-provenance-id={id} />
      </Dropdown>
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
