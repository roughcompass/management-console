/**
 * Anchors carry hashes, never raw visible text. The review application captures
 * approved display context separately; an anchor may travel further than the
 * screen it came from.
 *
 * WebCrypto is only available in a secure context, and a preview served over
 * plain http on a hostname other than localhost has none. The fallback keeps
 * anchors working there; it is not a security boundary, and neither is the
 * primary path - both exist so that raw copy does not travel with the anchor.
 */
export async function sha256Short(value: string, length = 16): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return fnv1a64(value).slice(0, length)
  try {
    const bytes = new TextEncoder().encode(value)
    const digest = await subtle.digest('SHA-256', bytes)
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, length)
  } catch {
    return fnv1a64(value).slice(0, length)
  }
}

function fnv1a64(input: string): string {
  let high = 0x811c9dc5
  let low = 0x01000193
  for (let index = 0; index < input.length; index++) {
    const code = input.charCodeAt(index)
    high ^= code
    high = Math.imul(high, 0x01000193) >>> 0
    low ^= code + index
    low = Math.imul(low, 0x85ebca6b) >>> 0
  }
  return high.toString(16).padStart(8, '0') + low.toString(16).padStart(8, '0')
}

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}
