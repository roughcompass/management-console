export type SchemaVersion = '1.0'

export type ElementKind = 'host' | 'application' | 'salt'

/**
 * What a design-system invocation was, as the build saw it. In a Salt
 * application the reviewable decision is which sentiment or density was used,
 * so those travel with the anchor rather than being reconstructed later.
 */
export interface LibraryProvenance {
  name: string
  version: string
  component: string
  /** The local name the file imported it as. */
  alias?: string
  /** Statically observable design-system props on this invocation. */
  props?: Record<string, string>
  /** Density, mode and theme from the nearest SaltProvider above it. */
  context?: Record<string, string>
}

// ---------------------------------------------------------------------------
// Registry: the durable, source-controlled identity
// ---------------------------------------------------------------------------

export interface RegistryEntry {
  sourceId: string
  /** Readable, non-unique. For display only, never a key. */
  humanName: string
  file: string
  enclosingComponent: string
  elementType: string
  elementKind: ElementKind
  /** Authored `data-de-provenance-key`, when present. */
  explicitKey: string | null
  /** `sha256:...` over semantic shape. Never over position or formatting. */
  astFingerprint: string
  parentSourceId: string | null
  /**
   * Index of the element within its file, in document order. Location
   * metadata like line and column - never hashed, never an identity - but it
   * is what tells two genuinely identical siblings apart.
   */
  order: number
  /** Position among same-type siblings under the same parent. */
  siblingOrder: number
  firstSeen: string
  status: 'active' | 'tombstoned'
  tombstonedAt?: string
}

export interface Registry {
  schemaVersion: SchemaVersion
  applicationId: string
  entries: RegistryEntry[]
}

// ---------------------------------------------------------------------------
// Manifest: one immutable artifact per build
// ---------------------------------------------------------------------------

export interface ManifestSourceEntry {
  sourceId: string
  humanName: string
  file: string
  line?: number
  column?: number
  enclosingComponent: string
  elementType: string
  elementKind: ElementKind
  parentSourceId: string | null
  /** Set for recognised design-system invocations. */
  library?: LibraryProvenance
  /** Whether the build injected an attribute, and why not when it did not. */
  instrumented: boolean
  instrumentationNote?: string
}

export interface ProvenanceManifest {
  schemaVersion: SchemaVersion
  applicationId: string
  federation: {
    name: string
    role: 'host' | 'remote'
    exposes: string[]
  }
  repository: string
  commitSha: string
  buildId: string
  packageVersions: Record<string, string>
  /** Hash of the registry this build was compiled against. */
  registryHash: string
  generatedAt: string
  sources: Record<string, ManifestSourceEntry>
}

// ---------------------------------------------------------------------------
// Anchors
// ---------------------------------------------------------------------------

export type Confidence = 'exact' | 'strong' | 'weak' | 'unresolved'

export interface AnchorFallback {
  route: string
  accessibleRole?: string
  accessibleNameHash?: string
  textHash?: string
  domShapeHash?: string
  viewport: { width: number; height: number }
  boundingBox?: { x: number; y: number; width: number; height: number }
}

export interface ProvenanceAnchor {
  schemaVersion: SchemaVersion
  applicationId: string
  federationName: string
  buildId: string
  commitSha: string
  sourceId?: string
  instanceKey?: string
  humanName?: string
  source?: {
    file: string
    line?: number
    column?: number
    enclosingComponent?: string
    elementType?: string
  }
  library?: LibraryProvenance
  /**
   * Hashes, never raw text. The review application captures approved display
   * context separately; this payload travels with the anchor.
   */
  fallback: AnchorFallback
  confidence: Confidence
  resolutionReason: string
}

export interface AnchorResolution {
  anchor?: ProvenanceAnchor
  element?: Element
  confidence: Confidence
  resolutionReason: string
  diagnostics: import('./errors.js').ProvenanceDiagnostic[]
}

export interface FederatedBuildRegistration {
  applicationId: string
  federationName: string
  federationRole: 'host' | 'remote'
  buildId: string
  commitSha: string
  manifestUrl: string
  root?: Element
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface ProvenanceConfig {
  applicationId: string
  repository: string
  include: string[]
  exclude: string[]
  registry: string
  saltPackages: string[]
  ambiguousMatchThreshold: number
  tombstoneRetentionDays: number
  productionDisabled: boolean
  /** Federation identity recorded in the manifest. */
  federation?: { name: string; role: 'host' | 'remote'; exposes?: string[] }
}

// ---------------------------------------------------------------------------
// Salt compatibility catalog (generated by the browser suite)
// ---------------------------------------------------------------------------

export type SaltCompatibility =
  | 'forwards-data-attributes'
  | 'requires-slot-target'
  | 'composite-no-single-root'
  | 'unsupported'

export interface SaltCatalogEntry {
  component: string
  package: string
  version: string
  compatibility: SaltCompatibility
  /** Only set for requires-slot-target, and only when a test proved it. */
  slotTarget?: string
  evidence: string
  testedAt: string
}

export interface SaltCatalog {
  schemaVersion: SchemaVersion
  generatedAt: string
  entries: SaltCatalogEntry[]
}
