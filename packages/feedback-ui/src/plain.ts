import type { AnchorDescriptor, AnchorStatus } from '@adl/anchor-core'

/** StatusBadge -> "Status badge", LimitBar -> "Limit bar", TD -> "TD". */
export function humanize(name: string): string {
  const words = name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim()
  if (!words) return name
  const [first, ...rest] = words.split(' ')
  return [first, ...rest.map((w) => (w === w.toUpperCase() ? w : w.toLowerCase()))].join(' ')
}

function capitalize(text: string): string {
  return text ? text[0]!.toUpperCase() + text.slice(1) : text
}

/**
 * What a reviewer would call the thing, without reading a path: the component
 * as a plain phrase, its visible text, and the section heading it sits under.
 * "Status badge “Failed” in Payments".
 */
export function describeAnchor(anchor: AnchorDescriptor): string {
  if (anchor.anchorType === 'visual-node') {
    const display = anchor.display
    const name = display?.component
      ? humanize(display.component)
      : anchor.text?.tag
        ? `The ${anchor.text.tag} element`
        : 'This element'
    const text = display?.text ?? (anchor.text && anchor.text.text.length <= 40 ? anchor.text.text : undefined)
    return `${name}${text ? ` “${text}”` : ''}${display?.region ? ` in ${display.region}` : ''}`
  }
  const target = anchor.target
  if (!target) return 'Something that is not on screen'
  switch (target.kind) {
    case 'general':
      return `${capitalize(target.topic)} — about the whole preview`
    case 'network':
      return `The request ${target.method} ${target.urlPattern}`
    case 'runtime-event':
      return `The app event “${target.type}”`
    case 'build-artifact':
      return `The build's ${target.name}`
    case 'source-symbol':
      return `The code at ${target.file}`
  }
}

/** Only trouble gets a label. A comment that is where it was left needs none. */
export function plainStatus(status: AnchorStatus): { label: string; hint: string } | null {
  switch (status) {
    case 'resolved':
      return null
    case 'degraded':
      return {
        label: 'Best match',
        hint: 'What this comment was on has changed; this is the closest thing in this build.',
      }
    case 'orphaned':
      return {
        label: 'Not in this build',
        hint: 'What this comment was on could not be found in this build.',
      }
  }
}
