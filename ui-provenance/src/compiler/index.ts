export { parseFileElements, humanNameOf, sha256 } from './ast.js'
export type { ParsedFile, SourceElement } from './ast.js'
export { discoverSourceFiles, toRepoRelative } from './discover.js'
export { matchesAny, matchesGlob } from './glob.js'
export { defineProvenanceConfig, loadConfig, normalizeConfig } from './config.js'
export type { LoadedConfig, ProvenanceConfigInput } from './config.js'
export {
  emptyRegistry,
  hashRegistry,
  loadRegistry,
  saveRegistry,
  serializeRegistry,
  syncRegistry,
} from './registry.js'
export type { SyncCounts, SyncOptions, SyncResult } from './registry.js'
export { createInjectorBabelPlugin } from './babel.js'
export type { BabelInjectorSource } from './babel.js'
export { decideInjection, instrumentSource } from './transform.js'
export type { InjectionRecord, InstrumentOptions, InstrumentResult } from './transform.js'
export {
  assertNoProductionInstrumentation,
  buildManifest,
  parseManifest,
} from './manifest.js'
export { emptyCatalog, loadCatalog, lookupCatalog, mayInject, resolvePackageVersions } from './salt.js'
export { prepareProject } from './project.js'
export type { PrepareOptions, Project, ProjectMode } from './project.js'
