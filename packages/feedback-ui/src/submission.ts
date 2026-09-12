import { formatSemanticPath } from '@adl/anchor-core'
import type {
  Actor,
  ActorRole,
  AnchorLevel,
  AnchorStatus,
  AnchorType,
  CommentThread,
  ContextLock,
  Layer,
} from '@adl/anchor-core'
import { targetSummary } from './parts.js'
import { describeAnchor } from './plain.js'

export interface SubmissionThread {
  threadId: string
  anchorType: AnchorType
  anchorStatus: AnchorStatus
  level: AnchorLevel | null
  confidence: number
  /** The thing in the reviewer's words: "Status badge “Failed” in Payments". */
  label: string
  /** Semantic path for a node; target summary for everything else. */
  where: string
  provenance?: {
    scope: string
    file: string
    line: number
    component: string
    instanceKey?: string
  }
  topic?: string
  layerHint?: Layer
  owner: string
  comments: Array<{ author: string; role: ActorRole; body: string; createdAt: string }>
}

/**
 * What leaves the toolbar when a reviewer presses send. Phase 1 has no agent
 * behind it, so the shape is what the next phase's change intent is built from:
 * the threads the reviewer chose, with their anchors, and the same thing again
 * as text.
 */
export interface FeedbackSubmission {
  id: string
  submittedAt: string
  submittedBy: Actor
  previewId: string
  lock: ContextLock
  buildId: string
  threads: SubmissionThread[]
  /** Open threads the reviewer left out on purpose, so the agent does not go looking for them. */
  leftOut: string[]
  /** Everything above as text: what is being asked for, in the reviewers' words. */
  digest: string
}

export function describeThread(thread: CommentThread): SubmissionThread {
  const { anchor, resolution } = thread
  const where =
    anchor.anchorType === 'visual-node'
      ? anchor.semantic
        ? formatSemanticPath(anchor.semantic, { includeElement: false })
        : '—'
      : targetSummary(anchor)
  const prov = anchor.provenance
  return {
    threadId: thread.id,
    anchorType: anchor.anchorType,
    anchorStatus: thread.anchorStatus,
    level: resolution?.level ?? null,
    confidence: resolution?.confidence ?? 0,
    label: describeAnchor(anchor),
    where,
    provenance: prov
      ? {
          scope: prov.scope,
          file: prov.file,
          line: prov.line,
          component: prov.component,
          instanceKey: prov.instanceKey,
        }
      : undefined,
    topic: anchor.target?.kind === 'general' ? anchor.target.topic : undefined,
    layerHint: thread.layerHint,
    owner: thread.owner.name,
    comments: thread.comments.map((comment) => ({
      author: comment.author.name,
      role: comment.author.role,
      body: comment.body,
      createdAt: comment.createdAt,
    })),
  }
}

export interface BuildSubmissionInput {
  id: string
  now: string
  actor: Actor
  previewId: string
  lock: ContextLock
  buildId: string
  included: CommentThread[]
  leftOut: CommentThread[]
  closed: CommentThread[]
}

export function buildSubmission(input: BuildSubmissionInput): FeedbackSubmission {
  const base: Omit<FeedbackSubmission, 'digest'> = {
    id: input.id,
    submittedAt: input.now,
    submittedBy: input.actor,
    previewId: input.previewId,
    lock: input.lock,
    buildId: input.buildId,
    threads: input.included.map(describeThread),
    leftOut: input.leftOut.map((thread) => thread.id),
  }
  return {
    ...base,
    digest: formatDigest(base, { leftOut: input.leftOut.length, closed: input.closed.length }),
  }
}

/**
 * The digest is the part a person reads before pressing send, and the part an
 * agent reads after. Element feedback comes first with its location, so a
 * change lands on the node the comment was about; preview-wide feedback is
 * kept apart, because it is not asking for a change at one place.
 */
export function formatDigest(
  submission: Omit<FeedbackSubmission, 'digest'>,
  counts: { leftOut: number; closed: number },
): string {
  const lines: string[] = []
  const { threads, lock } = submission
  lines.push(
    `Feedback for preview ${submission.previewId} · build ${submission.buildId} · lock ${lock.id.slice(0, 8)}`,
  )
  const omitted =
    counts.closed || counts.leftOut
      ? ` (not included: ${counts.closed} closed, ${counts.leftOut} left out by the reviewer)`
      : ''
  lines.push(`${threads.length} thread${threads.length === 1 ? '' : 's'} to act on${omitted}`)
  const mfes = Object.entries(lock.mfes)
    .map(([name, version]) => `${name}@${version}`)
    .join(', ')
  lines.push(`pinned: ${lock.frame}${mfes ? ` · ${mfes}` : ''}`)

  const nodes = threads.filter((thread) => thread.anchorType === 'visual-node')
  const general = threads.filter((thread) => thread.anchorType === 'general')
  const other = threads.filter(
    (thread) => thread.anchorType !== 'visual-node' && thread.anchorType !== 'general',
  )

  let n = 0
  const comments = (thread: SubmissionThread) => {
    for (const comment of thread.comments) {
      lines.push(`   - ${comment.author} (${comment.role}): ${comment.body}`)
    }
  }
  const section = (
    title: string,
    items: SubmissionThread[],
    head: (thread: SubmissionThread) => string[],
  ) => {
    if (items.length === 0) return
    lines.push('', title)
    for (const thread of items) {
      n += 1
      const [first, ...rest] = head(thread)
      lines.push(`${n}. ${first}`, ...rest.map((line) => `   ${line}`))
      comments(thread)
    }
  }

  section('On specific elements', nodes, (thread) => {
    const head = [thread.label, thread.where]
    const prov = thread.provenance
    if (prov) {
      head.push(
        `${prov.scope} · ${prov.file}:${prov.line} · ${prov.component}${prov.instanceKey ? ` · key ${prov.instanceKey}` : ''}`,
      )
    }
    head.push(
      `anchor ${thread.anchorStatus}${thread.level ? ` via ${thread.level} (${thread.confidence.toFixed(2)})` : ''}`,
    )
    return head
  })
  section('About the preview as a whole', general, (thread) => [thread.label])
  section('On network, runtime and build', other, (thread) => [
    thread.label,
    `${thread.anchorType} · ${thread.where}`,
  ])

  return lines.join('\n')
}
