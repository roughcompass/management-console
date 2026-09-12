// The schemas declare draft 2020-12, which is a separate Ajv entry point.
import { Ajv2020 as Ajv } from 'ajv/dist/2020.js'
import type { ErrorObject, ValidateFunction } from 'ajv'
import { UipError } from './errors.js'
import type { UipErrorCode } from './errors.js'

const ajv = new Ajv({ allErrors: true, strict: false })
const cache = new Map<string, ValidateFunction>()

export interface SchemaRef {
  name: string
  schema: Record<string, unknown>
}

function compile(ref: SchemaRef): ValidateFunction {
  const existing = cache.get(ref.name)
  if (existing) return existing
  const validator = ajv.compile(ref.schema)
  cache.set(ref.name, validator)
  return validator
}

function describe(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? [])
    .map((error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`)
    .join('; ')
}

/**
 * Schemas are versioned and an unknown major version is rejected rather than
 * best-effort parsed: a manifest written by a newer instrumenter may mean
 * something different by the same field name.
 */
export function assertSchemaVersion(value: unknown, expected: string, code: UipErrorCode): void {
  const version = (value as { schemaVersion?: string } | null)?.schemaVersion
  if (version === undefined) {
    throw new UipError(code, 'document has no schemaVersion', {
      remediation: 'regenerate it with a matching @de/ui-provenance version',
    })
  }
  const [major] = version.split('.')
  const [expectedMajor] = expected.split('.')
  if (major !== expectedMajor) {
    throw new UipError(code, `unsupported schema version ${version}, expected ${expectedMajor}.x`, {
      remediation: 'upgrade @de/ui-provenance or regenerate the document',
    })
  }
}

export function validateAgainst<T>(ref: SchemaRef, value: unknown, code: UipErrorCode): T {
  const validator = compile(ref)
  if (!validator(value)) {
    throw new UipError(code, describe(validator.errors), {
      remediation: `fix the document so it satisfies ${ref.name}`,
    })
  }
  return value as T
}
