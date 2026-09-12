import { adaptUiProvenanceManifest, mergeProvenanceManifests } from '@adl/anchor-core'
import type { BuildReport, ProvenanceManifest } from '@adl/anchor-core'
import { getProvenanceRuntime } from '@de/ui-provenance/runtime'
import type { FeedbackToolbarHandle, PreviewRecorder } from '@adl/feedback-ui'
import { mountFeedbackToolbar } from '@adl/feedback-ui'
import type { FeedbackRepository } from '@adl/feedback-store'
import { Button, Text } from '@salt-ds/core'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { lazy } from 'react'
import { Frame } from './Frame'

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
import { BUILDS } from './previews'
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

  // The instrumenter's runtime already holds every registered build's manifest,
  // so the toolbar reads them from there rather than fetching them a second
  // time - and it learns about a remote at the moment federation does.
  const reloadManifests = useCallback(() => {
    const builds = getProvenanceRuntime().getBuilds()
    if (builds.length === 0) return
    setManifest(
      mergeProvenanceManifests(
        ...builds.map((build) => adaptUiProvenanceManifest(build.manifest as never)),
      ),
    )
    setBuildReport({
      buildId: builds.map((build) => build.buildId).join('+'),
      commit: builds[0]!.commitSha,
      generatedAt: new Date().toISOString(),
      artifacts: [
        ...builds.map((build) => ({
          kind: 'remote' as const,
          name: `${build.applicationId} (${build.federationRole})`,
          value: build.manifestUrl,
        })),
        ...Object.entries(builds[0]!.manifest.packageVersions ?? {}).map(([name, version]) => ({
          kind: 'dependency' as const,
          name,
          value: String(version),
        })),
      ],
    })
  }, [])

  useEffect(() => {
    reloadManifests()
    const unsubscribe = onRemoteLoaded(() => reloadManifests())
    // Registration is asynchronous and driven by federation, not by React.
    const timer = setInterval(reloadManifests, 1000)
    return () => {
      unsubscribe()
      clearInterval(timer)
    }
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
      {ReviewLayerFixture ? (
        <Suspense fallback={null}>
          <ReviewLayerFixture />
        </Suspense>
      ) : null}
    </div>
  )
}
