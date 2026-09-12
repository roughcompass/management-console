import { useEffect, useMemo, useState } from 'react'
import { Frame } from './Frame'
import type { PreviewBuild } from './previews'
import { remoteComponent } from './remotes'
import { onPreviewChange, selectedPreview } from './review-bridge'

export const PREVIEW_ID = 'pr-1042-payments-dash'

/**
 * The application under review, and nothing else. It renders the Frame and the
 * pinned remotes; it has no review chrome of its own, because a reviewer who
 * followed a link should see the page, not a harness around it. Which version
 * is on screen is the review layer's decision, taken over the bridge.
 */
export function App() {
  const [build, setBuild] = useState<PreviewBuild>(selectedPreview)

  useEffect(() => onPreviewChange(setBuild), [])

  const Payments = useMemo(
    () => remoteComponent(build.remotes['payments-dash']!.module),
    [build],
  )
  const Limits = useMemo(() => remoteComponent(build.remotes['limits-panel']!.module), [build])

  return (
    <div className="preview" id="preview" data-theme="dark">
      <Frame main={<Payments />} side={<Limits />} />
    </div>
  )
}
