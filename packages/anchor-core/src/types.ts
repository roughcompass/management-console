/**
 * Core types for Phase 1 of the Agentic UI Delivery Loop: anchored feedback on
 * pinned previews. Nothing here generates code. These are the data structures
 * that later phases (change intent, revision sets) build on, so the shapes are
 * deliberately conservative.
 */

/** Federation layers. L0 firm, L1 platform, L2 LOB, L3 product. */
export type Layer = 'firm' | 'platform' | 'lob' | 'product'

/** Where in the resolution chain an anchor matched. Most specific first. */
export type AnchorLevel = 'provenance' | 'semantic' | 'token' | 'text' | 'visual'

/** Resolution order. Exported so callers cannot invent their own ordering. */
export const ANCHOR_LEVELS: readonly AnchorLevel[] = [
  'provenance',
  'semantic',
  'token',
  'text',
  'visual',
] as const

/**
 * Feedback targets more than rendered nodes. A developer commenting on a fetch
 * that should go through the entitlement-gated hook needs the same comment,
 * thread and (later) change-intent machinery as a spacing correction.
 */
export type AnchorType =
  | 'visual-node'
  | 'network-interaction'
  | 'runtime-event'
  | 'build-artifact'
  | 'source-symbol'
  | 'general'

/** DOM attributes that make up the provenance instrumentation contract. */
export const ATTR = {
  /** The registry source id, emitted by @de/ui-provenance. */
  prov: 'data-de-provenance-id',
  /** Authored opt-in: a stable identity for one instance in a list. */
  provKey: 'data-de-instance-key',
  /** Semicolon-separated design token ids that produce this node's styling. */
  tokens: 'data-tokens',
  /** Set by the host Frame. */
  frame: 'data-frame',
  frameVersion: 'data-frame-version',
  zone: 'data-zone',
  /** Set by each mounted MFE root. */
  mfe: 'data-mfe',
  mfeVersion: 'data-mfe-version',
  theme: 'data-theme',
} as const

// --------------------------------------------------------------------------
// 5.1 Anchor
// --------------------------------------------------------------------------

export interface ProvenanceRef {
  /** The registry source id. Immutable, and stable across ordinary edits. */
  token: string
  /** Which federated participant built this node. */
  scope: string
  repo: string
  commit: string
  file: string
  line: number
  column: number
  /** Enclosing component display name at build time. */
  component: string
  /** Host element tag the attribute was emitted on. */
  element: string
  /** Authored instance identity (data-prov-key), when the app opted in. */
  instanceKey?: string
  /** Ordinal among nodes carrying the same token, at capture time. */
  ordinal: number
}

export type SemanticSegmentKind = 'frame' | 'zone' | 'mfe' | 'component' | 'element'

export interface SemanticSegment {
  kind: SemanticSegmentKind
  name: string
  /** Only meaningful for frame and mfe segments. */
  version?: string
}

export interface SemanticPath {
  segments: SemanticSegment[]
}

export interface TokenRef {
  /** Design token id, e.g. "color.action.primary.background". */
  token: string
  /** CSS property the token was observed producing, when known. */
  property?: string
  /** Computed value at capture time. Used to detect token-value drift. */
  value?: string
  /** Which layer owns the token, when the token set declares it. */
  layer?: Layer
}

export interface TextAnchor {
  text: string
  /** Whitespace-collapsed, case-folded form used for matching. */
  normalized: string
  /** Ordinal among nodes with the same normalized text. */
  ordinal: number
  tag: string
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface VisualAnchor {
  /** Document-relative box. */
  rect: Rect
  viewport: { width: number; height: number }
  theme: string
  devicePixelRatio: number
  /** Optional screenshot crop supplied by the preview host. */
  crop?: string
}

/** Targets for the four non-visual anchor types. */
export type NonVisualTarget =
  | {
      kind: 'network'
      method: string
      url: string
      /** Path with ids normalised, e.g. /accounts/:id/positions. */
      urlPattern: string
      status?: number
      durationMs?: number
      initiator?: string
    }
  | {
      kind: 'runtime-event'
      channel: string
      type: string
      capability?: string
      entitlement?: string
    }
  | {
      kind: 'build-artifact'
      artifact: 'env-var' | 'bundle-size' | 'remote' | 'dependency'
      name: string
      value?: string
    }
  | {
      kind: 'source-symbol'
      repo: string
      file: string
      symbol: string
      line?: number
    }
  | {
      /** Feedback about the preview as a whole: spacing, form patterns, tone. */
      kind: 'general'
      topic: string
    }

/**
 * How a person points at the node in the words of the page: "the Failed status
 * in Payments". Captured for the reviewer who does not read paths.
 */
export interface AnchorDisplay {
  /** Component display name at capture time, e.g. StatusBadge. */
  component?: string
  /** The node's visible text, when it is short enough to be a name. */
  text?: string
  /** Heading of the section the node sits in, e.g. "Payments". */
  region?: string
}

export interface AnchorDescriptor {
  anchorType: AnchorType
  capturedAt: string
  display?: AnchorDisplay
  /** Highest level available when the comment was written. */
  capturedLevel: AnchorLevel
  /** Context lock the preview was pinned to at capture time. */
  contextLockId: string
  provenance?: ProvenanceRef
  semantic?: SemanticPath
  tokens?: TokenRef[]
  text?: TextAnchor
  visual?: VisualAnchor
  /** Present for every anchorType other than visual-node. */
  target?: NonVisualTarget
}

export type AnchorStatus = 'resolved' | 'degraded' | 'orphaned'

export interface StrategyAttempt {
  level: AnchorLevel
  matched: boolean
  confidence: number
  reason: string
}

export interface AnchorResolution {
  status: AnchorStatus
  /** Level that produced the match, null when orphaned. */
  level: AnchorLevel | null
  confidence: number
  element: Element | null
  /** Every level tried, in order, with why it did or did not match. */
  attempts: StrategyAttempt[]
  resolvedAt: string
}

// --------------------------------------------------------------------------
// 5.4 Context lock
// --------------------------------------------------------------------------

export interface ContextLockInput {
  frame: string
  frameContracts: string
  designTokens: string
  capabilityRegistry: string
  lobConventions: string
  /** MFE name -> pinned version. */
  mfes: Record<string, string>
  repo: { name: string; commit: string }
  createdAt?: string
}

export interface ContextLock extends ContextLockInput {
  /** Content hash over every pinned input. Stable across key ordering. */
  id: string
  createdAt: string
}

export interface ContextLockDiffEntry {
  key: string
  from: string | undefined
  to: string | undefined
}

// --------------------------------------------------------------------------
// Feedback
// --------------------------------------------------------------------------

export type ActorRole =
  | 'product'
  | 'design'
  | 'engineering'
  | 'accessibility'
  | 'release'

export interface Actor {
  id: string
  name: string
  role: ActorRole
}

export interface Comment {
  id: string
  threadId: string
  author: Actor
  body: string
  createdAt: string
}

export interface CommentThread {
  id: string
  anchor: AnchorDescriptor
  /** Named accountable owner. Assigned at creation, never implicit. */
  owner: Actor
  comments: Comment[]
  createdAt: string
  status: 'open' | 'resolved'
  anchorStatus: AnchorStatus
  resolution?: AnchorResolution
  /** True when the lock the comment was written against has moved on. */
  stale: boolean
  staleAgainst?: ContextLockDiffEntry[]
  /** Best guess at the owning layer, used later for routing. Never enforced. */
  layerHint?: Layer
}

// --------------------------------------------------------------------------
// Provenance manifest (emitted by the build-time plugin)
// --------------------------------------------------------------------------

/** Build identity of one federated participant: an MFE, or the shell itself. */
export interface ProvenanceScopeEntry {
  repo: string
  commit: string
  buildId: string
}

export interface ProvenanceModuleEntry {
  file: string
  scope: string
}

export interface ProvenanceNodeEntry {
  module: string
  component: string
  element: string
  line: number
  column: number
}

/**
 * Under Module Federation each remote is built separately and publishes its own
 * manifest. The shell merges them, so the manifest is keyed by scope rather
 * than carrying one repo and commit for everything on the page.
 */
export interface ProvenanceManifest {
  version: 1
  scopes: Record<string, ProvenanceScopeEntry>
  modules: Record<string, ProvenanceModuleEntry>
  nodes: Record<string, ProvenanceNodeEntry>
}

// --------------------------------------------------------------------------
// Build report (attached to the preview, surfaced by the instrumented panel)
// --------------------------------------------------------------------------

export interface BuildArtifactEntry {
  kind: 'env-var' | 'bundle-size' | 'remote' | 'dependency'
  name: string
  value?: string
  bytes?: number
}

export interface BuildReport {
  buildId: string
  commit: string
  generatedAt: string
  artifacts: BuildArtifactEntry[]
}
