/**
 * Small, dependency-free content hash. Used for context lock ids and for
 * module ids in the provenance manifest. Not cryptographic: it only needs to
 * be stable across processes and cheap enough to run at build time.
 */
export function fnv1a(input: string): string {
  // 64-bit FNV-1a carried in two 32-bit halves to stay exact in JS numbers.
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i)
    h1 ^= c
    h1 = Math.imul(h1, 0x01000193) >>> 0
    h2 ^= c + i
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')
}

/** Deterministic JSON: object keys sorted at every depth. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
}

export function contentHash(value: unknown): string {
  return fnv1a(stableStringify(value))
}
