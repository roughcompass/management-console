import { relative, sep } from 'node:path'
import { stripProvenanceSource } from '../compiler/transform.js'
import { isUipError } from '../core/errors.js'
import { getProject, isStripOnly } from './state.js'

export interface LoaderContextLike {
  rootContext: string
  resourcePath: string
  callback?: (error: Error | null, code?: string, map?: unknown) => void
}

const INSTRUMENTABLE = /\.(jsx|tsx)$/

/**
 * The Webpack half of the transformation. It runs the same instrumentation the
 * Vite adapter runs, against the same prepared project, so equivalent source
 * yields equivalent identities in both bundlers.
 */
export default function uiProvenanceLoader(this: LoaderContextLike, source: string): string {
  if (!INSTRUMENTABLE.test(this.resourcePath)) return source
  const project = getProject(this.rootContext)

  // Instrumentation off: the pass still runs, and removes rather than adds.
  if (!project) {
    if (!isStripOnly(this.rootContext)) return source
    const stripped = stripProvenanceSource(source, this.resourcePath)
    if (!stripped) return source
    if (this.callback) {
      this.callback(null, stripped.code, stripped.map)
      return ''
    }
    return stripped.code
  }

  const file = relative(this.rootContext, this.resourcePath).split(sep).join('/')
  if (file.startsWith('..')) return source

  try {
    const result = project.instrument(source, file)
    if (!result) return source
    if (this.callback) {
      this.callback(null, result.code, result.map)
      return ''
    }
    return result.code
  } catch (error) {
    if (isUipError(error)) throw new Error(error.message)
    throw error
  }
}
