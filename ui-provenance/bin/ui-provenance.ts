#!/usr/bin/env node
import { access, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { isUipError } from '../src/core/errors.js'
import { loadConfig } from '../src/compiler/config.js'
import { emptyRegistry, saveRegistry } from '../src/compiler/registry.js'
import { prepareProject } from '../src/compiler/project.js'

const CONFIG_TEMPLATE = `import { defineProvenanceConfig } from '@de/ui-provenance/compiler'

export default defineProvenanceConfig({
  applicationId: 'APPLICATION_ID',
  repository: 'REPOSITORY',
  include: ['src/**/*.{jsx,tsx}'],
  exclude: ['**/*.test.*', '**/*.stories.*', '**/generated/**'],
  registry: '.ui-provenance/registry.json',
  saltPackages: ['@salt-ds/core', '@salt-ds/lab', '@salt-ds/icons'],
  ambiguousMatchThreshold: 0.9,
  tombstoneRetentionDays: 90,
  productionDisabled: true,
})
`

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Never overwrites. Running init twice is a no-op, not a reset. */
async function init(root: string, applicationId?: string): Promise<number> {
  const configPath = join(root, 'ui-provenance.config.ts')
  if (await exists(configPath)) {
    console.log('ui-provenance.config.ts already exists, left unchanged')
  } else {
    await writeFile(
      configPath,
      CONFIG_TEMPLATE.replace('APPLICATION_ID', applicationId ?? 'my-app').replace(
        'REPOSITORY',
        'org/repo',
      ),
      'utf8',
    )
    console.log('created ui-provenance.config.ts')
  }

  const registryPath = join(root, '.ui-provenance/registry.json')
  if (await exists(registryPath)) {
    console.log('.ui-provenance/registry.json already exists, left unchanged')
  } else {
    await mkdir(join(root, '.ui-provenance'), { recursive: true })
    await saveRegistry(registryPath, emptyRegistry(applicationId ?? 'my-app'))
    console.log('created .ui-provenance/registry.json')
  }
  return 0
}

function report(label: string, project: Awaited<ReturnType<typeof prepareProject>>): void {
  const { added, preserved, moved, tombstoned } = project.counts
  const total = project.files.reduce((sum, file) => sum + file.elements.length, 0)
  console.log(
    `${label} ${project.config.applicationId}: ${total} elements in ${project.files.length} files`,
  )
  console.log(
    `  added ${added}  preserved ${preserved}  moved ${moved}  tombstoned ${tombstoned}`,
  )
  console.log(`  registry ${project.registryHash.slice(0, 19)}…`)
}

async function main(): Promise<number> {
  const [command = 'help', ...rest] = process.argv.slice(2)
  const rootArgument = rest.find((argument) => !argument.startsWith('-'))
  const root = resolve(rootArgument ?? process.cwd())

  if (command === 'init') return init(root, rest.find((a) => a.startsWith('--app='))?.slice(6))

  if (command === 'sync' || command === 'check') {
    const { config } = await loadConfig(root)
    const project = await prepareProject({ root, config, mode: command })
    report(command === 'sync' ? 'synced' : 'checked', project)
    return 0
  }

  console.log(`ui-provenance <command> [dir]

  init    create a config and an empty registry, without overwriting either
  sync    assign and preserve source ids, and write the registry
  check   the same analysis without writing; fails when the registry is stale`)
  return command === 'help' ? 0 : 1
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    if (isUipError(error)) {
      const diagnostic = error.toDiagnostic()
      console.error(`\n${diagnostic.code}: ${error.message.replace(`${diagnostic.code}: `, '')}`)
      for (const [key, value] of Object.entries(diagnostic)) {
        if (key === 'code' || key === 'message' || key === 'at' || value === undefined) continue
        console.error(`  ${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
      }
      process.exit(1)
    }
    console.error(error)
    process.exit(1)
  })
