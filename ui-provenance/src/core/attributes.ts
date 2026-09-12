/**
 * The preview-only DOM contract. Every generated attribute is prefixed
 * `data-de-provenance-`, so a production artifact check is a single substring
 * scan rather than a list of names to keep in sync.
 */
export const ATTR_PREFIX = 'data-de-provenance-'

export const ATTR = {
  /** Generated: the registry source id for this element. */
  sourceId: 'data-de-provenance-id',
  /** Authored: identity input, and the escape hatch for ambiguous elements. */
  explicitKey: 'data-de-provenance-key',
  /** Authored: distinguishes repeated renders of one source element. */
  instanceKey: 'data-de-instance-key',
  /** Generated on an MFE mount root by the runtime registration. */
  applicationId: 'data-de-provenance-app',
  buildId: 'data-de-provenance-build',
} as const

/** Attributes the production guard must never find in an artifact. */
export const GENERATED_ATTRIBUTES = [
  ATTR.sourceId,
  ATTR.applicationId,
  ATTR.buildId,
] as const
