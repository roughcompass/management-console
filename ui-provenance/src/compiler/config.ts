import { randomBytes } from 'node:crypto'
import { readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { UipError } from '../core/errors.js'
import { validateAgainst } from '../core/validate.js'
import type { ProvenanceConfig } from '../core/types.js'
import configSchema from '../../schemas/config.schema.json' with { type: 'json' }

const SCHEMA = { name: 'config-1.0', schema: configSchema as Record<string, unknown> }

const DEFAULTS = {
  exclude: ['**/*.test.*', '**/*.spec.*', '**/*.stories.*', '**/generated/**'],
  registry: '.ui-provenance/registry.json',
  saltPackages: ['@salt-ds/core', '@salt-ds/lab', '@salt-ds/icons'],
  ambiguousMatchThreshold: 0.9,
  tombstoneRetentionDays: 90,
  productionDisabled: true,
} satisfies Partial<ProvenanceConfig>

export type ProvenanceConfigInput = Partial<ProvenanceConfig> &
  Pick<ProvenanceConfig, 'applicationId' | 'repository' | 'include'>

/** Identity helper, so a config file gets types without importing them. */
export function defineProvenanceConfig(config: ProvenanceConfigInput): ProvenanceConfigInput {
  return config
}

export function normalizeConfig(input: unknown): ProvenanceConfig {
  validateAgainst<ProvenanceConfigInput>(SCHEMA, input, 'UIP_INVALID_CONFIG')
  return { ...DEFAULTS, ...(input as ProvenanceConfigInput) } as ProvenanceConfig
}

const CANDIDATES = [
  'ui-provenance.config.ts',
  'ui-provenance.config.mts',
  'ui-provenance.config.mjs',
  'ui-provenance.config.js',
  'ui-provenance.config.json',
]

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * A TypeScript config is transpiled beside the original and imported from
 * there, then removed. A data: URL would be tidier but cannot resolve the bare
 * specifier the config imports, and moving the file elsewhere would change how
 * its imports resolve.
 */
async function importConfigModule(path: string): Promise<unknown> {
  if (path.endsWith('.json')) return JSON.parse(await readFile(path, 'utf8'))
  if (!path.endsWith('.ts') && !path.endsWith('.mts')) {
    const module = (await import(pathToFileURL(path).href)) as { default?: unknown }
    return module.default
  }

  const { transform } = await import('esbuild')
  const source = await readFile(path, 'utf8')
  const result = await transform(source, { loader: 'ts', format: 'esm', target: 'node20' })
  const temporary = join(dirname(path), `.ui-provenance.config.${randomBytes(6).toString('hex')}.mjs`)
  await writeFile(temporary, result.code, 'utf8')
  try {
    const module = (await import(pathToFileURL(temporary).href)) as { default?: unknown }
    return module.default
  } finally {
    await unlink(temporary).catch(() => {})
  }
}

export interface LoadedConfig {
  config: ProvenanceConfig
  path: string
  root: string
}

export async function loadConfig(root: string): Promise<LoadedConfig> {
  for (const candidate of CANDIDATES) {
    const path = join(root, candidate)
    if (!(await exists(path))) continue
    const raw = await importConfigModule(path)
    if (!raw || typeof raw !== 'object') {
      throw new UipError('UIP_INVALID_CONFIG', `${candidate} has no default export`, {
        file: candidate,
        remediation: 'export default defineProvenanceConfig({ ... })',
      })
    }
    return { config: normalizeConfig(raw), path, root: resolve(root) }
  }
  throw new UipError('UIP_INVALID_CONFIG', 'no ui-provenance config found', {
    remediation: `create one of: ${CANDIDATES.join(', ')} (or run: ui-provenance init)`,
  })
}
