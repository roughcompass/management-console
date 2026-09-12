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
}
