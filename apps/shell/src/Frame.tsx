import {
  Avatar,
  BorderItem,
  BorderLayout,
  FlexLayout,
  NavigationItem,
  Spinner,
  StackLayout,
  Text,
} from '@salt-ds/core'
import { Suspense } from 'react'
import type { ReactNode } from 'react'
import { BoundaryProbes } from './BoundaryProbes'

const NAV = [
  { id: 'payments', label: 'Payments' },
  { id: 'limits', label: 'Limits' },
  { id: 'reports', label: 'Reports' },
]

/**
 * The host Frame supplies the zone and MFE segments of every semantic path.
 * That is the runtime half of the provenance contract; the build plugin
 * supplies the component half.
 *
 * The chrome is Salt: layout, navigation and type all come from the design
 * system, so a reviewer's feedback can name a Salt decision rather than a
 * colour.
 */
export function Frame({ main, side }: { main: ReactNode; side: ReactNode }) {
  return (
    <BorderLayout className="frame" data-frame="cib-frame" data-frame-version="3.1">
      <BorderItem position="north" className="frame-head" data-zone="header">
        <FlexLayout align="center" gap={3}>
          <Text styleAs="h4">CIB Web Frame</Text>
          <FlexLayout as="nav" gap={1} className="frame-nav">
            {NAV.map((item, index) => (
              <NavigationItem key={item.id} href={`#${item.id}`} active={index === 0}>
                {item.label}
              </NavigationItem>
            ))}
          </FlexLayout>
          <FlexLayout align="center" gap={1} className="frame-persona">
            <Avatar size={1} name="Miles Okonjo" />
            <Text color="secondary">Markets Ops</Text>
          </FlexLayout>
        </FlexLayout>
      </BorderItem>

      <BorderItem position="center" padding={2} data-zone="main">
        <Suspense fallback={<ZoneLoading name="payments-dash" />}>{main}</Suspense>
      </BorderItem>

      <BorderItem position="east" padding={2} className="frame-side" data-zone="side">
        <StackLayout gap={3}>
          <Suspense fallback={<ZoneLoading name="limits-panel" />}>{side}</Suspense>
          <BoundaryProbes />
        </StackLayout>
      </BorderItem>
    </BorderLayout>
  )
}

function ZoneLoading({ name }: { name: string }) {
  return (
    <FlexLayout align="center" gap={1} className="zone-loading">
      <Spinner size="small" />
      <Text color="secondary">loading {name}…</Text>
    </FlexLayout>
  )
}
