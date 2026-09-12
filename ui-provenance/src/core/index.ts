export { ATTR, ATTR_PREFIX, GENERATED_ATTRIBUTES } from './attributes.js'
export { UIP_ERROR_CODES, UipError, isUipError } from './errors.js'
export type { ProvenanceDiagnostic, UipDiagnosticFields, UipErrorCode } from './errors.js'
export { createSourceId, isSourceId } from './ids.js'
export {
  canonicalPropNames,
  fingerprintInput,
  normalizeLiteral,
  similarity,
} from './fingerprint.js'
export type { FingerprintInput } from './fingerprint.js'
export { atLeast, requiresConfirmation, resolveConfidence } from './confidence.js'
export type { ConfidenceInput, ConfidenceResult } from './confidence.js'
export { assertSchemaVersion, validateAgainst } from './validate.js'
export type { SchemaRef } from './validate.js'
export type {
  AnchorFallback,
  AnchorResolution,
  Confidence,
  ElementKind,
  FederatedBuildRegistration,
  ManifestSourceEntry,
  ProvenanceAnchor,
  ProvenanceConfig,
  ProvenanceManifest,
  Registry,
  RegistryEntry,
  SaltCatalog,
  SaltCatalogEntry,
  SaltCompatibility,
  SchemaVersion,
} from './types.js'
