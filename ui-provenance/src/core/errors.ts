/**
 * Stable error codes. Diagnostics identify the MFE, file, component, code and
 * remediation - never source text, which is why every diagnostic carries
 * structured fields rather than a formatted message.
 */
export const UIP_ERROR_CODES = [
  'UIP_INVALID_CONFIG',
  'UIP_DUPLICATE_EXPLICIT_KEY',
  'UIP_AMBIGUOUS_IDENTITY',
  'UIP_REGISTRY_OUT_OF_DATE',
  'UIP_MANIFEST_MISMATCH',
  'UIP_REMOTE_UNREGISTERED',
  'UIP_UNSUPPORTED_SALT_COMPONENT',
  'UIP_UNSUPPORTED_BOUNDARY',
  'UIP_INSTANCE_AMBIGUOUS',
  'UIP_ANCHOR_ORPHANED',
  'UIP_PRODUCTION_GUARD',
] as const

export type UipErrorCode = (typeof UIP_ERROR_CODES)[number]

export interface UipDiagnosticFields {
  applicationId?: string
  file?: string
  component?: string
  elementType?: string
  sourceId?: string
  candidates?: string[]
  remediation?: string
}

export interface ProvenanceDiagnostic extends UipDiagnosticFields {
  code: UipErrorCode
  message: string
  at: string
}

export class UipError extends Error {
  readonly code: UipErrorCode
  readonly fields: UipDiagnosticFields

  constructor(code: UipErrorCode, message: string, fields: UipDiagnosticFields = {}) {
    super(`${code}: ${message}`)
    this.name = 'UipError'
    this.code = code
    this.fields = fields
  }

  toDiagnostic(): ProvenanceDiagnostic {
    return { code: this.code, message: this.message, at: new Date().toISOString(), ...this.fields }
  }
}

export function isUipError(value: unknown): value is UipError {
  return value instanceof UipError
}
