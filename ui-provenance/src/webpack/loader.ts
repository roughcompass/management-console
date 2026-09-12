import { relative, sep } from 'node:path'
import { isUipError } from '../core/errors.js'
import { getProject } from './state.js'

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
  const project = getProject(this.rootContext)
  if (!project || !INSTRUMENTABLE.test(this.resourcePath)) return source

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
