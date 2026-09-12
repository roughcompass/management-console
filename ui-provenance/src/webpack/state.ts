import type { Project } from '../compiler/project.js'

/**
 * Webpack loaders are resolved by module path, not passed as closures, so the
 * plugin and the loader meet here. Keyed by the compiler's root context: one
 * build, one prepared project, one set of identities.
 */
const projects = new Map<string, Project>()

export function setProject(root: string, project: Project): void {
  projects.set(root, project)
}

export function getProject(root: string): Project | undefined {
  return projects.get(root)
}

export function clearProject(root: string): void {
  projects.delete(root)
  stripOnly.delete(root)
}

/**
 * A build that asked for no instrumentation still has to remove the authored
 * keys, so the loader stays in the rule and is told to strip instead of inject.
 */
const stripOnly = new Set<string>()

export function setStripOnly(root: string): void {
  stripOnly.add(root)
}

export function isStripOnly(root: string): boolean {
  return stripOnly.has(root)
}
