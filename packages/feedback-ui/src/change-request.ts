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

export interface RequestedComment {
  commentId: string
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
  replies: Array<{ author: string; role: ActorRole; body: string; createdAt: string }>
}

/**
 * What the reviewer sends when she asks for the next version. Phase 1 has
 * nothing on the other end of it, so the shape is what the phase that adds one
 * builds from: the comments she chose, with their anchors, and the same thing
 * again as a brief someone could act on without opening the tool.
 */
export interface ChangeRequest {
  id: string
  requestedAt: string
  requestedBy: Actor
  previewId: string
  /** The version the reviewer was looking at when she asked. */
  fromVersion: { id: string; label: string }
  lock: ContextLock
  comments: RequestedComment[]
  /** Feedback explicitly declined. A decision worth carrying, not an omission. */
  rejected: string[]
  /** Everything above as text: what is being asked for, in the reviewers' words. */
  brief: string
}

export function describeComment(thread: CommentThread): RequestedComment {
  const { anchor, resolution } = thread
  const where =
    anchor.anchorType === 'visual-node'
      ? anchor.semantic
        ? formatSemanticPath(anchor.semantic, { includeElement: false })
        : '—'
      : targetSummary(anchor)
  const prov = anchor.provenance
  return {
    commentId: thread.id,
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
    replies: thread.comments.map((comment) => ({
      author: comment.author.name,
      role: comment.author.role,
      body: comment.body,
      createdAt: comment.createdAt,
    })),
  }
}

export interface BuildRequestInput {
  id: string
  now: string
  actor: Actor
  previewId: string
  fromVersion: { id: string; label: string }
  lock: ContextLock
  accepted: CommentThread[]
  rejected: CommentThread[]
  undecided: CommentThread[]
}

export function buildChangeRequest(input: BuildRequestInput): ChangeRequest {
  const base: Omit<ChangeRequest, 'brief'> = {
    id: input.id,
    requestedAt: input.now,
    requestedBy: input.actor,
    previewId: input.previewId,
    fromVersion: input.fromVersion,
    lock: input.lock,
    comments: input.accepted.map(describeComment),
    rejected: input.rejected.map((thread) => thread.id),
  }
  return {
    ...base,
    brief: formatBrief(base, {
      rejected: input.rejected.length,
      undecided: input.undecided.length,
    }),
  }
}

/**
 * The brief is the part a reviewer reads before she sends it, and the part
 * whoever builds the next version reads after. Feedback on one part of the page
 * comes first with its location, so a change lands where the comment was;
 * page-wide feedback is kept apart, because it is not asking for a change at
 * one place.
 */
export function formatBrief(
  request: Omit<ChangeRequest, 'brief'>,
  counts: { rejected: number; undecided: number },
): string {
  const lines: string[] = []
  const { comments, lock } = request
  lines.push(`Change request for ${request.previewId}, from ${request.fromVersion.label}`)
  const omitted =
    counts.rejected || counts.undecided
      ? ` (not included: ${counts.rejected} rejected, ${counts.undecided} still undecided)`
      : ''
  lines.push(`${comments.length} accepted comment${comments.length === 1 ? '' : 's'}${omitted}`)
  const mfes = Object.entries(lock.mfes)
    .map(([name, version]) => `${name}@${version}`)
    .join(', ')
  lines.push(`built from: ${lock.frame}${mfes ? ` · ${mfes}` : ''}`)

  const nodes = comments.filter((comment) => comment.anchorType === 'visual-node')
  const general = comments.filter((comment) => comment.anchorType === 'general')
  const other = comments.filter(
    (comment) => comment.anchorType !== 'visual-node' && comment.anchorType !== 'general',
  )

  let n = 0
  const section = (
    title: string,
    items: RequestedComment[],
    head: (comment: RequestedComment) => string[],
  ) => {
    if (items.length === 0) return
    lines.push('', title)
    for (const comment of items) {
      n += 1
      const [first, ...rest] = head(comment)
      lines.push(`${n}. ${first}`, ...rest.map((line) => `   ${line}`))
      for (const reply of comment.replies) {
        lines.push(`   - ${reply.author} (${reply.role}): ${reply.body}`)
      }
    }
  }

  section('On parts of the page', nodes, (comment) => {
    const head = [comment.label, comment.where]
    const prov = comment.provenance
    if (prov) {
      head.push(
        `${prov.scope} · ${prov.file}:${prov.line} · ${prov.component}${prov.instanceKey ? ` · key ${prov.instanceKey}` : ''}`,
      )
    }
    head.push(
      `anchor ${comment.anchorStatus}${comment.level ? ` via ${comment.level} (${comment.confidence.toFixed(2)})` : ''}`,
    )
    return head
  })
  section('About the whole page', general, (comment) => [comment.label])
  section('Behind the page', other, (comment) => [
    comment.label,
    `${comment.anchorType} · ${comment.where}`,
  ])

  return lines.join('\n')
}
