/**
 * Deterministic golden fixture: a source tree with more than 100 reviewable
 * elements, every one of them carrying a `data-truth` marker.
 *
 * The marker is ground truth for the stability evaluation, not identity: it is
 * an ordinary prop, so its name is part of every element's fingerprint and its
 * value is part of none of them. Nothing in the instrumenter reads it.
 */
export interface GoldenFile {
  path: string
  code: string
}

function row(index: number): string {
  const id = String(index).padStart(2, '0')
  return `        <TR key={position.id} data-truth="row-${id}" data-de-instance-key={position.id}>
          <TD data-truth="cell-account-${id}">{position.account}</TD>
          <TD data-truth="cell-instrument-${id}">
            <span className="mono" data-truth="instrument-${id}">{position.instrument}</span>
          </TD>
          <TD data-truth="cell-notional-${id}">{position.notional}</TD>
          <TD data-truth="cell-status-${id}">
            <StatusBadge status={position.status} data-truth="badge-${id}" />
          </TD>
        </TR>`
}

function field(index: number): string {
  const id = String(index).padStart(2, '0')
  return `      <div className="field" data-truth="field-${id}">
        <label htmlFor="input-${id}" data-truth="label-${id}">Field ${id}</label>
        <Input id="input-${id}" data-truth="input-${id}" />
      </div>`
}

function card(index: number): string {
  const id = String(index).padStart(2, '0')
  return `      <Card data-truth="card-${id}">
        <Text styleAs="h4" data-truth="card-title-${id}">Limit ${id}</Text>
        <p className="figure" data-truth="card-figure-${id}">{limits[${index}]?.cap}</p>
      </Card>`
}

export function goldenFiles(): GoldenFile[] {
  const rows = Array.from({ length: 10 }, (_value, index) => row(index)).join('\n')
  const fields = Array.from({ length: 12 }, (_value, index) => field(index)).join('\n')
  const cards = Array.from({ length: 8 }, (_value, index) => card(index)).join('\n')

  return [
    {
      path: 'src/PositionsTable.tsx',
      code: `import { TBody, TD, TH, THead, TR, Table } from '@salt-ds/core'

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className="badge" data-truth="status-badge-root">
      <i className="dot" data-truth="status-badge-dot" />
      {status}
    </span>
  )
}

export function PositionsTable({ positions }: { positions: any[] }) {
  return (
    <div className="table-wrap" data-truth="table-wrap">
      <Table data-truth="table">
        <THead data-truth="thead">
          <TR data-truth="head-row">
            <TH data-truth="th-account">Account</TH>
            <TH data-truth="th-instrument">Instrument</TH>
            <TH data-truth="th-notional">Notional</TH>
            <TH data-truth="th-status">Status</TH>
          </TR>
        </THead>
        <TBody data-truth="tbody">
${rows}
        </TBody>
      </Table>
    </div>
  )
}
`,
    },
    {
      path: 'src/InstructionForm.tsx',
      code: `import { Button, Input } from '@salt-ds/core'

export function InstructionForm() {
  return (
    <form className="instruction-form" data-truth="form-root">
      <h2 data-truth="form-title">New instruction</h2>
${fields}
      <div className="actions" data-truth="form-actions">
        <Button appearance="transparent" data-truth="form-cancel">Cancel</Button>
        <Button appearance="solid" sentiment="accented" data-truth="form-submit">Submit</Button>
      </div>
    </form>
  )
}
`,
    },
    {
      path: 'src/LimitsOverview.tsx',
      code: `import { Card, Text } from '@salt-ds/core'

export function LimitsOverview({ limits }: { limits: any[] }) {
  return (
    <section className="limits" data-truth="limits-root">
      <header className="limits-head" data-truth="limits-head">
        <Text styleAs="h3" data-truth="limits-title">Limits</Text>
        <a href="#all" data-truth="limits-link">See all</a>
      </header>
      <div className="limits-grid" data-truth="limits-grid">
${cards}
      </div>
    </section>
  )
}
`,
    },
  ]
}

export const GOLDEN_CONFIG = {
  applicationId: 'golden-app',
  repository: 'test/golden',
  include: ['src/**/*.{jsx,tsx}'],
  exclude: [],
  registry: '.ui-provenance/registry.json',
  saltPackages: ['@salt-ds/core'],
  ambiguousMatchThreshold: 0.9,
  tombstoneRetentionDays: 90,
  productionDisabled: true,
}
