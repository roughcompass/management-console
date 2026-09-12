/**
 * Canonical description of a source element's semantic shape.
 *
 * What goes in decides what survives an edit. Position, whitespace, formatting,
 * prop order and generated class names are all excluded on purpose: every one
 * of them changes under ordinary work, and an identity that changes with them
 * is not an identity.
 */
export interface FingerprintInput {
  elementType: string
  /** Prop names only, sorted. Values are excluded: they are usually data. */
  propNames: string[]
  /** Literal accessibility labels, which are meaningful and usually stable. */
  accessibleLabels: string[]
  /** Literal text children, whitespace-collapsed. */
  literalText: string[]
  parentFingerprint: string | null
  /**
   * Element types of the immediate siblings. Deliberately NOT hashed: adding an
   * unrelated sibling must not change an existing element's identity, and it
   * would change every neighbour's fingerprint at once. Kept for scoring a
   * move, where a changed fingerprint is expected anyway.
   */
  neighborShapes: string[]
}

const NON_SEMANTIC_PROPS = new Set(['className', 'style', 'key', 'ref'])

export function canonicalPropNames(names: readonly string[]): string[] {
  return [...new Set(names.filter((name) => !NON_SEMANTIC_PROPS.has(name)))].sort()
}

export function normalizeLiteral(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * The exact string that gets hashed. Kept separate from hashing so the compiler
 * can hash with node:crypto and the runtime with WebCrypto, without the two
 * ever disagreeing about what was hashed.
 */
export function fingerprintInput(input: FingerprintInput): string {
  return [
    `type=${input.elementType}`,
    `props=${canonicalPropNames(input.propNames).join(',')}`,
    `a11y=${input.accessibleLabels.map(normalizeLiteral).sort().join('|')}`,
    `text=${input.literalText.map(normalizeLiteral).filter(Boolean).join('|')}`,
    `parent=${input.parentFingerprint ?? 'root'}`,
  ].join('\n')
}

/**
 * Structural similarity used only for the file-move and rename case, where the
 * exact fingerprint has legitimately changed. Compared field by field so a
 * single changed label cannot drag a score over the threshold on its own.
 */
export function similarity(a: FingerprintInput, b: FingerprintInput): number {
  if (a.elementType !== b.elementType) return 0
  const parts = [
    jaccard(canonicalPropNames(a.propNames), canonicalPropNames(b.propNames)),
    jaccard(a.accessibleLabels.map(normalizeLiteral), b.accessibleLabels.map(normalizeLiteral)),
    jaccard(a.literalText.map(normalizeLiteral), b.literalText.map(normalizeLiteral)),
    jaccard(a.neighborShapes, b.neighborShapes),
  ]
  // Element type already matched, and counts for a third of the score.
  return round(1 / 3 + ((2 / 3) * parts.reduce((sum, part) => sum + part, 0)) / parts.length)
}

function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 1
  const left = new Set(a)
  const right = new Set(b)
  let shared = 0
  for (const value of left) if (right.has(value)) shared += 1
  const union = new Set([...left, ...right]).size
  return union === 0 ? 1 : shared / union
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
