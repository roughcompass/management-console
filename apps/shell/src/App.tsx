import { loadProvenanceManifests } from '@adl/anchor-core'
import type { BuildReport, ProvenanceManifest } from '@adl/anchor-core'
import type { FeedbackToolbarHandle, PreviewRecorder } from '@adl/feedback-ui'
import { mountFeedbackToolbar } from '@adl/feedback-ui'
import type { FeedbackRepository } from '@adl/feedback-store'
import { Button, Text } from '@salt-ds/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Frame } from './Frame'
import { BUILDS, BUILD_REPORT_URL, MANIFEST_URLS } from './previews'
import type { PreviewBuild } from './previews'
import { onRemoteLoaded, remoteComponent } from './remotes'

const REVIEWER = { id: 'u-dw', name: 'Dana Whitfield', role: 'design' } as const
const PREVIEW_ID = 'pr-1042-payments-dash'

export interface AppProps {
  recorder: PreviewRecorder
  repository: FeedbackRepository
}

export function App({ recorder, repository }: AppProps) {
  const previewRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<FeedbackToolbarHandle | null>(null)
  const [build, setBuild] = useState<PreviewBuild>(BUILDS[0]!)
  const [manifest, setManifest] = useState<ProvenanceManifest>()
  const [buildReport, setBuildReport] = useState<BuildReport>()

  const Payments = useMemo(
    () => remoteComponent(build.remotes['payments-dash']!.module),
    [build],
  )
  const Limits = useMemo(() => remoteComponent(build.remotes['limits-panel']!.module), [build])

  const reloadManifests = useCallback(async () => {
    // Every participant publishes its own manifest; the shell merges them.
    const merged = await loadProvenanceManifests(MANIFEST_URLS)
    setManifest(merged)
  }, [])

  useEffect(() => {
    void reloadManifests()
    void fetch(BUILD_REPORT_URL)
      .then((res) => res.json() as Promise<BuildReport>)
      .then(setBuildReport)
      .catch(() => {})
    return onRemoteLoaded(() => {
      void reloadManifests()
    })
  }, [reloadManifests])

  // The Frame mounts the toolbar. The MFEs below know nothing about it.
  useEffect(() => {
    let disposed = false
    void mountFeedbackToolbar({
      previewRoot: '#preview',
      actor: REVIEWER,
      previewId: PREVIEW_ID,
      lock: build.lock,
      buildId: build.id,
      label: build.label,
      remotes: Object.fromEntries(
        Object.entries(build.remotes).map(([name, pin]) => [name, { version: pin.version, entry: pin.entry }]),
      ),
      repository,
      recorder,
      captureCrops: true,
      mode: 'dark',
    }).then((handle) => {
      if (disposed) handle.destroy()
      else toolbarRef.current = handle
    })
    return () => {
      disposed = true
      toolbarRef.current?.destroy()
      toolbarRef.current = null
    }
    // Mounted once: the toolbar is updated in place from here on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A new pinned build, or a newly merged manifest, re-anchors the open set.
  useEffect(() => {
    toolbarRef.current?.update({
      lock: build.lock,
      buildId: build.id,
      label: build.label,
      manifest,
      buildReport,
      remotes: Object.fromEntries(
        Object.entries(build.remotes).map(([name, pin]) => [name, { version: pin.version, entry: pin.entry }]),
      ),
    })
  }, [build, manifest, buildReport])

  return (
    <div className="shell">
      <div className="bar">
        {/* Kept to the left: the feedback panel overlays the right edge. */}
        <div className="build-switch">
          {BUILDS.map((entry) => (
            <Button
              key={entry.id}
              appearance={entry.id === build.id ? 'solid' : 'bordered'}
              sentiment="accented"
              onClick={() => setBuild(entry)}
            >
              {entry.label}
            </Button>
          ))}
        </div>
        <Text styleAs="label" color="secondary">
          pinned preview · {PREVIEW_ID}
        </Text>
      </div>
      <div className="stage">
        <div className="preview" id="preview" ref={previewRef} data-theme="dark">
          <Frame main={<Payments />} side={<Limits />} />
        </div>
      </div>
    </div>
  )
}
