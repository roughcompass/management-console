import { formatSemanticPath } from '@adl/anchor-core'
import type {
  AnchorDescriptor,
  AnchorResolution,
  AnchorStatus,
  ContextLockDiffEntry,
} from '@adl/anchor-core'
import type { ReactNode } from 'react'

export function StatusChip({ status }: { status: AnchorStatus }): ReactNode {
  return (
    <span className="adl-chip" data-status={status}>
      <i className="adl-dot" aria-hidden="true" />
      {status}
    </span>
  )
}

export function LevelChip({ resolution }: { resolution?: AnchorResolution }): ReactNode {
  if (!resolution?.level) return null
  return (
    <span className="adl-chip" title={`confidence ${resolution.confidence}`}>
      {resolution.level} · {resolution.confidence.toFixed(2)}
    </span>
  )
}

export function targetSummary(anchor: AnchorDescriptor): string {
  const target = anchor.target
  if (!target) return ''
  switch (target.kind) {
    case 'network':
      return `${target.method} ${target.urlPattern}`
    case 'runtime-event':
      return `${target.channel}:${target.type}`
    case 'build-artifact':
      return `${target.artifact} ${target.name}`
    case 'source-symbol':
      return `${target.file}#${target.symbol}`
    case 'general':
      return target.topic
  }
}

/**
 * What the anchor is, and what is currently holding it. A designer reads the
 * first line; a developer reads the rest.
 */
export function AnchorSummary({
  anchor,
  resolution,
}: {
  anchor: AnchorDescriptor
  resolution?: AnchorResolution
}): ReactNode {
  if (anchor.anchorType !== 'visual-node') {
    return (
      <div className="adl-mono" title={anchor.anchorType}>
        {anchor.anchorType} · {targetSummary(anchor)}
      </div>
    )
  }

  const path = anchor.semantic ? formatSemanticPath(anchor.semantic, { includeElement: false }) : '—'
  const prov = anchor.provenance
  const degraded = resolution && resolution.status !== 'resolved'

  return (
    <div>
      <div className="adl-mono" title={path}>
        {path}
      </div>
      {prov ? (
        <div className="adl-mono">
          {prov.scope} · {prov.file}:{prov.line} · {prov.component}
          {prov.instanceKey ? ` · key ${prov.instanceKey}` : ''}
        </div>
      ) : null}
      {anchor.tokens?.length ? (
        <div className="adl-mono">tokens: {anchor.tokens.map((t) => t.token).join(', ')}</div>
      ) : null}
      {/* The crop is triage evidence: when an anchor is in trouble, it is the
          only way to show what the comment was actually about. */}
      {degraded && anchor.visual?.crop ? (
        <img className="adl-crop" src={anchor.visual.crop} alt="what this comment was left on" />
      ) : null}
      {degraded ? (
        <details>
          <summary className="adl-mono">
            why ({resolution.attempts.length} {resolution.attempts.length === 1 ? 'level' : 'levels'}{' '}
            tried)
          </summary>
          <ul className="adl-list adl-mono">
            {resolution.attempts.map((attempt) => (
              <li key={attempt.level}>
                {attempt.matched ? '✓' : '✕'} {attempt.level}: {attempt.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

/**
 * Feedback written against version N and read at N+2 is flagged, never silently
 * carried forward. The diff says exactly which pinned input moved.
 */
export function StaleNotice({ entries }: { entries?: ContextLockDiffEntry[] }): ReactNode {
  if (!entries?.length) return null
  return (
    <div className="adl-stale adl-mono">
      <div>written against an older context lock</div>
      {entries.slice(0, 4).map((entry) => (
        <div key={entry.key}>
          {entry.key}: {entry.from ?? '—'} → {entry.to ?? '—'}
        </div>
      ))}
      {entries.length > 4 ? <div>+{entries.length - 4} more</div> : null}
    </div>
  )
}

export function Metric({ value, label }: { value: string; label: string }): ReactNode {
  return (
    <div className="adl-metric">
      <span className="adl-metric-value">{value}</span>
      <span className="adl-metric-label">{label}</span>
    </div>
  )
}

export function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}
