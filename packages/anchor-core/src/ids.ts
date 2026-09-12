let counter = 0

/**
 * Ids are generated client-side so a comment exists the instant it is written,
 * before any round trip. Collision risk is irrelevant at preview scale; the
 * counter makes ids monotonic within a session so ordering is stable.
 */
export function createId(prefix: string): string {
  counter += 1
  const random = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${random}`
}

/** Test seam: reset the monotonic counter. */
export function __resetIdCounter(): void {
  counter = 0
}
