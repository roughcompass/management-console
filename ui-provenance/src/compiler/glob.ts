/**
 * Small glob matcher for include and exclude patterns. Deliberately not a
 * dependency: the pattern surface a config file needs is `**`, `*`, `?` and
 * brace alternation, and a build tool that scans a bank's source tree is a poor
 * place to widen the supply chain.
 */
function expandBraces(pattern: string): string[] {
  const match = /\{([^{}]*)\}/.exec(pattern)
  if (!match) return [pattern]
  const [placeholder, body] = match
  const head = pattern.slice(0, match.index)
  const tail = pattern.slice(match.index + placeholder.length)
  return body!
    .split(',')
    .flatMap((option) => expandBraces(`${head}${option}${tail}`))
}

function toRegExp(pattern: string): RegExp {
  let out = ''
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]!
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        // `**/` may match zero directories, so the slash is part of the group.
        if (pattern[i + 2] === '/') {
          out += '(?:.*/)?'
          i += 2
        } else {
          out += '.*'
          i += 1
        }
      } else {
        out += '[^/]*'
      }
      continue
    }
    if (char === '?') {
      out += '[^/]'
      continue
    }
    out += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${out}$`)
}

export function matchesGlob(path: string, pattern: string): boolean {
  return expandBraces(pattern).some((expanded) => toRegExp(expanded).test(path))
}

export function matchesAny(path: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => matchesGlob(path, pattern))
}
