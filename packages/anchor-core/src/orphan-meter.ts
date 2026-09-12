import type { AnchorLevel, AnchorResolution, AnchorStatus } from './types.js'
import { ANCHOR_LEVELS } from './types.js'

export interface OrphanSnapshot {
  total: number
  resolved: number
  degraded: number
  orphaned: number
  /** The adoption metric. Instrument it from the first release. */
  orphanRate: number
  degradedRate: number
  /** How much of the feedback each level is actually carrying. */
  byLevel: Record<AnchorLevel | 'none', number>
  meanConfidence: number
}

export interface OrphanSample {
  buildId: string
  lockId: string
  threadId: string
  status: AnchorStatus
  level: AnchorLevel | null
  confidence: number
  at: string
}

export type OrphanListener = (sample: OrphanSample) => void

function emptyByLevel(): Record<AnchorLevel | 'none', number> {
  const out = { none: 0 } as Record<AnchorLevel | 'none', number>
  for (const level of ANCHOR_LEVELS) out[level] = 0
  return out
}

/**
 * Orphan rate is the percentage of comments that lose their anchor between
 * versions. It is the leading indicator of whether designers keep using the
 * tool, so it is a first-class output of every re-anchor pass rather than
 * something reconstructed from logs later.
 */
export class OrphanMeter {
  private samples: OrphanSample[] = []
  private listeners = new Set<OrphanListener>()

  /**
   * One sample per thread per build, latest wins. A federated preview can be
   * measured before its last remote has painted; the pass that follows must
   * correct that reading, not sit next to it in the average.
   */
  record(
    resolution: AnchorResolution,
    meta: { buildId: string; lockId: string; threadId: string },
  ): OrphanSample {
    const sample: OrphanSample = {
      buildId: meta.buildId,
      lockId: meta.lockId,
      threadId: meta.threadId,
      status: resolution.status,
      level: resolution.level,
      confidence: resolution.confidence,
      at: resolution.resolvedAt,
    }
    const index = this.samples.findIndex(
      (s) => s.buildId === meta.buildId && s.threadId === meta.threadId,
    )
    if (index === -1) this.samples.push(sample)
    else this.samples[index] = sample
    for (const listener of this.listeners) listener(sample)
    return sample
  }

  subscribe(listener: OrphanListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Snapshot everything, or just one build's re-anchor pass. */
  snapshot(buildId?: string): OrphanSnapshot {
    const samples = buildId ? this.samples.filter((s) => s.buildId === buildId) : this.samples
    const byLevel = emptyByLevel()
    let resolved = 0
    let degraded = 0
    let orphaned = 0
    let confidence = 0

    for (const sample of samples) {
      byLevel[sample.level ?? 'none'] += 1
      confidence += sample.confidence
      if (sample.status === 'resolved') resolved += 1
      else if (sample.status === 'degraded') degraded += 1
      else orphaned += 1
    }

    const total = samples.length
    return {
      total,
      resolved,
      degraded,
      orphaned,
      orphanRate: total ? orphaned / total : 0,
      degradedRate: total ? degraded / total : 0,
      byLevel,
      meanConfidence: total ? confidence / total : 0,
    }
  }

  /** A deleted comment stops counting: it is not an orphan, it is not there. */
  forget(threadId: string): void {
    this.samples = this.samples.filter((sample) => sample.threadId !== threadId)
  }

  builds(): string[] {
    return [...new Set(this.samples.map((s) => s.buildId))]
  }

  reset(): void {
    this.samples = []
  }
}
