import type { GoldenFile } from './generate.js'

export type EditKind = 'formatting' | 'ordinary' | 'destructive'

export interface Edit {
  name: string
  kind: EditKind
  apply(files: GoldenFile[]): GoldenFile[]
  /** Truth markers this edit deliberately removes. */
  removes?: string[]
}

const map = (files: GoldenFile[], path: string, fn: (code: string) => string): GoldenFile[] =>
  files.map((file) => (file.path === path ? { ...file, code: fn(file.code) } : file))

/**
 * The deterministic edit suite. Every entry is something a developer does in an
 * ordinary morning; none of them is a rewrite, and none is meant to be survived
 * by luck.
 */
export const EDITS: Edit[] = [
  {
    name: 'reindent every line',
    kind: 'formatting',
    apply: (files) =>
      files.map((file) => ({ ...file, code: file.code.replace(/^ {2}/gm, '    ') })),
  },
  {
    name: 'insert blank lines and comments',
    kind: 'formatting',
    apply: (files) =>
      files.map((file) => ({
        ...file,
        code: file.code.replace(/\nexport function/g, '\n// reviewed 2026-09-12\n\nexport function'),
      })),
  },
  {
    name: 'reorder props',
    kind: 'formatting',
    apply: (files) =>
      map(files, 'src/PositionsTable.tsx', (code) =>
        code.replace(
          /<TR key=\{position\.id\} data-truth="(row-\d+)" data-de-instance-key=\{position\.id\}>/g,
          '<TR data-de-instance-key={position.id} data-truth="$1" key={position.id}>',
        ),
      ),
  },
  {
    name: 'rename class names',
    kind: 'formatting',
    apply: (files) =>
      files.map((file) => ({
        ...file,
        code: file.code.replace(/className="([a-z-]+)"/g, 'className="ui-$1"'),
      })),
  },
  {
    name: 'add an unrelated sibling',
    kind: 'ordinary',
    apply: (files) =>
      map(files, 'src/LimitsOverview.tsx', (code) =>
        code.replace(
          '<div className="limits-grid" data-truth="limits-grid">',
          '<p className="note" data-truth="added-note">Updated hourly</p>\n      <div className="limits-grid" data-truth="limits-grid">',
        ),
      ),
  },
  {
    name: 'edit literal text',
    kind: 'ordinary',
    apply: (files) =>
      map(files, 'src/InstructionForm.tsx', (code) =>
        code.replace('>New instruction<', '>Create instruction<').replace('>Submit<', '>Send<'),
      ),
  },
  {
    name: 'add a prop to an existing element',
    kind: 'ordinary',
    apply: (files) =>
      map(files, 'src/InstructionForm.tsx', (code) =>
        code.replace('<Button appearance="solid" sentiment="accented"', '<Button appearance="solid" sentiment="accented" disabled={false}'),
      ),
  },
  {
    name: 'move a file',
    kind: 'ordinary',
    apply: (files) =>
      files.map((file) =>
        file.path === 'src/LimitsOverview.tsx'
          ? { ...file, path: 'src/limits/LimitsOverview.tsx' }
          : file,
      ),
  },
  {
    name: 'rename a component',
    kind: 'ordinary',
    apply: (files) =>
      map(files, 'src/InstructionForm.tsx', (code) =>
        code.replace(/InstructionForm/g, 'PaymentInstructionForm'),
      ),
  },
  {
    name: 'wrap a subtree in a new element',
    kind: 'ordinary',
    apply: (files) =>
      map(files, 'src/PositionsTable.tsx', (code) =>
        code
          .replace(
            '<div className="table-wrap" data-truth="table-wrap">',
            '<div className="table-wrap" data-truth="table-wrap">\n      <div className="scroll" data-truth="added-scroll">',
          )
          .replace('      </Table>\n    </div>', '      </Table>\n      </div>\n    </div>'),
      ),
  },
  {
    name: 'delete an element',
    kind: 'destructive',
    removes: ['limits-link'],
    apply: (files) =>
      map(files, 'src/LimitsOverview.tsx', (code) =>
        code.replace('        <a href="#all" data-truth="limits-link">See all</a>\n', ''),
      ),
  },
  {
    name: 'duplicate an element',
    kind: 'destructive',
    apply: (files) =>
      map(files, 'src/InstructionForm.tsx', (code) =>
        code.replace(
          '<Button appearance="transparent" data-truth="form-cancel">Cancel</Button>',
          '<Button appearance="transparent" data-truth="form-cancel">Cancel</Button>\n        <Button appearance="transparent" data-truth="form-cancel-copy">Cancel</Button>',
        ),
      ),
  },
]
