import { BorderItem, BorderLayout, FlexLayout, Text, ToggleButton, ToggleButtonGroup } from '@salt-ds/core'
import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Frame } from './Frame'
import { BUILDS } from './previews'
import type { PreviewBuild } from './previews'
import { remoteComponent } from './remotes'
import { selectPreview, selectedPreview } from './review-bridge'

// Preview-only, and dynamically imported so a production bundle does not carry
// the review runtime at all.
// The condition is statically replaced at build time, so the dynamic import
// sits in a dead branch and the chunk is never emitted for production.
const REVIEW_ENABLED = import.meta.env.MODE !== 'production'
const ReviewLayerFixture = REVIEW_ENABLED
  ? lazy(() =>
      import('./ReviewLayerFixture').then((module) => ({ default: module.ReviewLayerFixture })),
    )
  : null

export const PREVIEW_ID = 'pr-1042-payments-dash'

/**
 * The application under review. It renders the Frame and the pinned remotes and
 * knows nothing about feedback: the review layer attaches itself from the
 * outside, and publishes nothing back into this tree.
 */
export function App() {
  const [build, setBuild] = useState<PreviewBuild>(selectedPreview())

  const Payments = useMemo(
    () => remoteComponent(build.remotes['payments-dash']!.module),
    [build],
  )
  const Limits = useMemo(() => remoteComponent(build.remotes['limits-panel']!.module), [build])

  // Switching the pinned build is an application concern; re-anchoring the open
  // threads against it is the review layer's, over the bridge.
  useEffect(() => {
    selectPreview(build)
  }, [build])

  return (
    <BorderLayout className="shell">
      <BorderItem position="north" className="bar" padding={1}>
        <FlexLayout align="center" gap={2}>
          {/* Kept to the left: the feedback panel overlays the right edge. */}
          <ToggleButtonGroup
            value={build.id}
            onChange={(event) => {
              const next = BUILDS.find((entry) => entry.id === event.currentTarget.value)
              if (next) setBuild(next)
            }}
          >
            {BUILDS.map((entry) => (
              <ToggleButton key={entry.id} value={entry.id}>
                {entry.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Text styleAs="label" color="secondary" className="preview-id">
            pinned preview · {PREVIEW_ID}
          </Text>
        </FlexLayout>
      </BorderItem>

      <BorderItem position="center" className="stage">
        <div className="preview" id="preview" data-theme="dark">
          <Frame main={<Payments />} side={<Limits />} />
        </div>
      </BorderItem>

      {ReviewLayerFixture ? (
        <Suspense fallback={null}>
          <ReviewLayerFixture />
        </Suspense>
      ) : null}
    </BorderLayout>
  )
}
