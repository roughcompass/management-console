import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * Measurement-based requirements link to a machine-readable result produced by
 * the current build, so the reports are written by the tests that measure them.
 */
export async function writeReport(name: string, payload: unknown): Promise<string> {
  const path = join(process.cwd(), 'ui-provenance/validation', name)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(
    path,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), ...(payload as object) }, null, 2)}\n`,
    'utf8',
  )
  return path
}
