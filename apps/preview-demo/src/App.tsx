import { createContextLock, loadProvenanceManifest } from '@adl/anchor-core'
import type { Actor, BuildReport, ContextLock, ProvenanceManifest } from '@adl/anchor-core'
import {
  FeedbackLayer,
  FeedbackPanel,
  FeedbackProvider,
  FeedbackToolbar,
  PreviewRecorder,
  declareRuntimeEvents,
} from '@adl/feedback-ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Frame } from './Frame'
import { fetchLimits, fetchPositions } from './data'
import type { Limit, Position } from './data'
import { LimitsPanel } from './mfes/limits/LimitsPanel'
import { PaymentsDash as PaymentsDashV1 } from './mfes/payments/v1/PaymentsDash'
import { PaymentsDash as PaymentsDashV2 } from './mfes/payments/v2/PaymentsDash'

const REVIEWER: Actor = { id: 'u-dw', name: 'Dana Whitfield', role: 'design' }

const RUNTIME_EVENTS = [
  'frame:context-hydrated',
  'frame:capability-resolved',
  'frame:entitlement-decision',
]

const BUILDS = {
  a: createContextLock({
    frame: '3.1.0',
    frameContracts: '3.1',
    designTokens: '4.2.1',
    capabilityRegistry: '2026-09-11T00:00:00Z',
    lobConventions: 'markets-1.4',
    mfes: { 'payments-dash': '2.4.1', 'limits-panel': '1.2.0' },
    repo: { name: 'roughcompass/management-console', commit: 'a41c9ef' },
  }),
  b: createContextLock({
    frame: '3.1.0',
    frameContracts: '3.1',
    designTokens: '4.3.0',
    capabilityRegistry: '2026-09-11T00:00:00Z',
    lobConventions: 'markets-1.4',
    mfes: { 'payments-dash': '2.5.0', 'limits-panel': '1.2.0' },
    repo: { name: 'roughcompass/management-console', commit: '7d20b13' },
  }),
} satisfies Record<string, ContextLock>

type BuildId = keyof typeof BUILDS

export function App() {
  const previewRef = useRef<HTMLDivElement>(null)
  const recorder = useMemo(() => new PreviewRecorder(), [])
  const [build, setBuild] = useState<BuildId>('a')
  const [manifest, setManifest] = useState<ProvenanceManifest>()
  const [buildReport, setBuildReport] = useState<BuildReport>()
  const [positions, setPositions] = useState<Position[]>([])
  const [limits, setLimits] = useState<Limit[]>([])

  useEffect(() => {
    declareRuntimeEvents(RUNTIME_EVENTS)
    const stop = recorder.start()

    void loadProvenanceManifest('/__provenance/manifest.json').then(setManifest).catch(() => {})
    void fetch('/__provenance/build-report.json')
      .then((res) => res.json() as Promise<BuildReport>)
      .then(setBuildReport)
      .catch(() => {})
    void fetchPositions('8891').then(setPositions).catch(() => {})
    void fetchLimits().then(setLimits).catch(() => {})

    // A real Frame emits these; the demo emits the same shapes so the runtime
    // tab has something a developer would actually comment on.
    window.dispatchEvent(
      new CustomEvent('frame:context-hydrated', { detail: { tenant: 'markets', ms: 84 } }),
    )
    window.dispatchEvent(
      new CustomEvent('frame:capability-resolved', {
        detail: { capability: 'payments.instruction.create', source: 'registry@2026-09-11' },
      }),
    )
    window.dispatchEvent(
      new CustomEvent('frame:entitlement-decision', {
        detail: { entitlement: 'payments.limits.view', decision: 'allow', persona: 'markets-ops' },
      }),
    )
    return stop
  }, [recorder])

  const lock = BUILDS[build]
  const Payments = build === 'a' ? PaymentsDashV1 : PaymentsDashV2

  return (
    <FeedbackProvider
      actor={REVIEWER}
      lock={lock}
      buildId={build}
      manifest={manifest}
      buildReport={buildReport}
      previewRef={previewRef}
      recorder={recorder}
    >
      <div className="shell">
        <div className="bar">
          <FeedbackToolbar />
          <div className="build-switch">
            <span className="label">preview build</span>
            <button
              type="button"
              className="adl-btn"
              data-active={build === 'a'}
              onClick={() => setBuild('a')}
            >
              A · payments-dash 2.4.1
            </button>
            <button
              type="button"
              className="adl-btn"
              data-active={build === 'b'}
              onClick={() => setBuild('b')}
            >
              B · payments-dash 2.5.0 (rebuilt)
            </button>
          </div>
        </div>
        <div className="stage">
          <div className="preview" ref={previewRef} data-theme="dark">
            <Frame
              main={<Payments positions={positions} />}
              side={<LimitsPanel limits={limits} />}
            />
          </div>
          <FeedbackPanel />
        </div>
      </div>
      <FeedbackLayer />
    </FeedbackProvider>
  )
}
