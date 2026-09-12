import type { AnchorResolution, ProvenanceAnchor } from '@de/ui-provenance/runtime'
import { getProvenanceRuntime } from '@de/ui-provenance/runtime'
import { Button, Card, StackLayout, Text } from '@salt-ds/core'
import { useCallback, useEffect, useState } from 'react'

/**
 * The minimum consumer of the instrumenter: select an element, show what the
 * runtime resolved it to. It owns no comments, no storage and no transport -
 * that is the Preview Review Layer's job. This exists to prove the contract.
 */
export function ReviewLayerFixture() {
  const runtime = getProvenanceRuntime()
  const [selecting, setSelecting] = useState(false)
  const [resolution, setResolution] = useState<AnchorResolution | null>(null)
  const [anchor, setAnchor] = useState<ProvenanceAnchor | null>(null)
  const [builds, setBuilds] = useState(() => runtime.getBuilds())

  useEffect(() => {
    const timer = setInterval(() => setBuilds(runtime.getBuilds()), 500)
    return () => clearInterval(timer)
  }, [runtime])

  useEffect(() => {
    if (!selecting) return
    const onClick = async (event: MouseEvent) => {
      const target = event.target as Element | null
      if (target?.closest('[data-review-fixture]')) return
      event.preventDefault()
      event.stopPropagation()
      setSelecting(false)
      const result = await runtime.resolvePoint(event.clientX, event.clientY)
      setResolution(result)
      setAnchor(result.anchor ?? null)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [runtime, selecting])

  const reResolve = useCallback(async () => {
    if (!anchor) return
    const result = await runtime.reResolve(anchor)
    setResolution(result)
  }, [anchor, runtime])

  const diagnostics = runtime.getDiagnostics().slice(0, 3)

  return (
    <Card className="review-fixture" data-review-fixture="">
      <StackLayout gap={1}>
        <div className="review-head">
          <Text styleAs="h4">Preview Review Layer (fixture)</Text>
          <span className="chip" data-confidence={resolution?.confidence ?? 'none'}>
            {resolution?.confidence ?? 'nothing selected'}
          </span>
        </div>

        <div className="review-actions">
          <Button
            appearance={selecting ? 'solid' : 'bordered'}
            sentiment="accented"
            onClick={() => setSelecting((value) => !value)}
          >
            {selecting ? 'Click an element…' : 'Select element'}
          </Button>
          <Button appearance="transparent" disabled={!anchor} onClick={reResolve}>
            Re-resolve anchor
          </Button>
        </div>

        <Text styleAs="label" color="secondary">
          registered builds
        </Text>
        <ul className="review-builds">
          {builds.length === 0 ? <li>none yet</li> : null}
          {builds.map((build) => (
            <li key={`${build.applicationId}/${build.buildId}`}>
              {build.applicationId} · {build.federationRole} · {build.buildId} ·{' '}
              {Object.keys(build.manifest.sources).length} elements
            </li>
          ))}
        </ul>

        {resolution ? (
          <>
            <Text styleAs="label" color="secondary">
              resolution · {resolution.resolutionReason}
            </Text>
            <pre className="review-payload">{JSON.stringify(resolution.anchor ?? {}, null, 2)}</pre>
          </>
        ) : null}

        {diagnostics.length > 0 ? (
          <>
            <Text styleAs="label" color="secondary">
              diagnostics
            </Text>
            <ul className="review-builds">
              {diagnostics.map((diagnostic) => (
                <li key={`${diagnostic.code}-${diagnostic.at}`}>
                  {diagnostic.code}: {diagnostic.remediation ?? diagnostic.message}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </StackLayout>
    </Card>
  )
}
