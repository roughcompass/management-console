const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const RANDOM_LENGTH = 16
const TIME_LENGTH = 10

function encodeTime(now: number): string {
  let out = ''
  let value = now
  for (let i = TIME_LENGTH - 1; i >= 0; i--) {
    out = CROCKFORD[value % 32] + out
    value = Math.floor(value / 32)
  }
  return out
}

function randomChars(length: number): string {
  const bytes = new Uint8Array(length)
  globalThis.crypto.getRandomValues(bytes)
  let out = ''
  for (const byte of bytes) out += CROCKFORD[byte % 32]
  return out
}

/**
 * Opaque and immutable. Identity durability comes from the registry, not from
 * anything derivable about the element - a hash of file and position would
 * change on the first edit, which is the failure this design exists to avoid.
 */
export function createSourceId(now: number = Date.now()): string {
  return `prv_${encodeTime(now)}${randomChars(RANDOM_LENGTH)}`
}

const SOURCE_ID = /^prv_[0-9A-HJKMNP-TV-Z]{26}$/

export function isSourceId(value: unknown): value is string {
  return typeof value === 'string' && SOURCE_ID.test(value)
}
