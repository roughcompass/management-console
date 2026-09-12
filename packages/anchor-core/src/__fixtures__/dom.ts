import { createContextLock } from '../context-lock.js'
import type { ContextLock, ProvenanceManifest } from '../types.js'

const V1_FILE = 'src/mfes/payments/v1/PaymentsDash.tsx'
const V2_FILE = 'src/mfes/payments/v2/PaymentsDash.tsx'

/**
 * Source ids come from the instrumenter's committed registry, so the same
 * element keeps its id when it moves to a new file in build B. Only the
 * summary heading, which build B deletes, is absent there.
 */
export const ID = {
  badge: 'prv_01M29J9WHH63Q297TKCABQZWTX',
  row: 'prv_01M29J9WHHGRG1NBGGXR9SPY7R',
  cell: 'prv_01M29J9WHHYSHQ7HHYD1FYX05Y',
  heading: 'prv_01M29J9WHHXT6CPJ28MKWYY3FA',
  button: 'prv_01M29J9WHHPD8GQ5YMCBN18KF5',
} as const

export const manifestV1: ProvenanceManifest = {
  version: 1,
  scopes: {
    'payments-dash': {
      repo: 'roughcompass/management-console',
      commit: 'a41c9ef',
      buildId: 'build-a',
    },
  },
  modules: { m1: { file: V1_FILE, scope: 'payments-dash' } },
  nodes: {
    [ID.badge]: { module: 'm1', component: 'StatusBadge', element: 'span', line: 9, column: 5 },
    [ID.row]: { module: 'm1', component: 'PositionsTable', element: 'tr', line: 21, column: 11 },
    [ID.cell]: { module: 'm1', component: 'PositionsTable', element: 'td', line: 22, column: 13 },
    [ID.heading]: { module: 'm1', component: 'SummaryCard', element: 'h3', line: 31, column: 7 },
    [ID.button]: { module: 'm1', component: 'PaymentsDash', element: 'button', line: 40, column: 7 },
  },
}

export const manifestV2: ProvenanceManifest = {
  version: 1,
  scopes: {
    'payments-dash': {
      repo: 'roughcompass/management-console',
      commit: '7d20b13',
      buildId: 'build-b',
    },
  },
  modules: { m2: { file: V2_FILE, scope: 'payments-dash' } },
  nodes: {
    [ID.badge]: { module: 'm2', component: 'StatusBadge', element: 'span', line: 14, column: 5 },
    [ID.row]: { module: 'm2', component: 'PositionsTable', element: 'tr', line: 29, column: 13 },
    [ID.cell]: { module: 'm2', component: 'PositionsTable', element: 'td', line: 30, column: 15 },
    [ID.button]: { module: 'm2', component: 'PaymentsDash', element: 'button', line: 52, column: 7 },
  },
}

export const lockV1: ContextLock = createContextLock({
  frame: '3.1.0',
  frameContracts: '3.1',
  designTokens: '4.2.1',
  capabilityRegistry: '2026-09-11T00:00:00Z',
  lobConventions: 'markets-1.4',
  mfes: { 'payments-dash': '2.4.1' },
  repo: { name: 'roughcompass/management-console', commit: 'a41c9ef' },
  createdAt: '2026-09-11T09:00:00.000Z',
})

export const lockV2: ContextLock = createContextLock({
  frame: '3.1.0',
  frameContracts: '3.1',
  designTokens: '4.3.0',
  capabilityRegistry: '2026-09-11T00:00:00Z',
  lobConventions: 'markets-1.4',
  mfes: { 'payments-dash': '2.5.0' },
  repo: { name: 'roughcompass/management-console', commit: '7d20b13' },
  createdAt: '2026-09-11T15:00:00.000Z',
})

const ROWS = [
  { id: 'p-4411', account: '8891-USD', status: 'settled' },
  { id: 'p-4412', account: '8891-USD', status: 'pending' },
  { id: 'p-4413', account: '4402-GBP', status: 'failed' },
]

const badgeTokens = (status: string) =>
  `color.status.${status}.background=background-color;radius.pill=border-radius`

/** Build A: the preview the feedback is written against. */
export function htmlV1(): string {
  const rows = ROWS.map(
    (row) => `
      <tr data-de-provenance-id="${ID.row}" data-de-instance-key="${row.id}">
        <td data-de-provenance-id="${ID.cell}">${row.account}</td>
        <td data-de-provenance-id="${ID.cell}">
          <span data-de-provenance-id="${ID.badge}" data-de-instance-key="${row.id}" data-tokens="${badgeTokens(row.status)}">${row.status}</span>
        </td>
      </tr>`,
  ).join('')

  return `
    <div data-frame="cib-frame" data-frame-version="3.1">
      <main data-zone="main">
        <section data-mfe="payments-dash" data-mfe-version="2.4.1">
          <button data-de-provenance-id="${ID.button}" data-tokens="color.action.primary.background=background-color">New instruction</button>
          <section class="card">
            <h3 data-de-provenance-id="${ID.heading}" data-tokens="type.display.sm=font-size">Unsettled exposure</h3>
          </section>
          <table><tbody>${rows}</tbody></table>
        </section>
      </main>
    </div>`
}

/**
 * Build B: same component names, new module and line numbers, restructured
 * markup, the summary card removed, and the MFE version bumped.
 */
export function htmlV2(): string {
  const rows = ROWS.map(
    (row) => `
      <tr data-de-provenance-id="${ID.row}" data-de-instance-key="${row.id}">
        <td data-de-provenance-id="${ID.cell}"><span class="stack">${row.account}</span></td>
        <td data-de-provenance-id="${ID.cell}">
          <span data-de-provenance-id="${ID.badge}" data-de-instance-key="${row.id}" data-tokens="${badgeTokens(row.status)}"><i></i>${row.status}</span>
        </td>
      </tr>`,
  ).join('')

  return `
    <div data-frame="cib-frame" data-frame-version="3.1">
      <main data-zone="main">
        <section data-mfe="payments-dash" data-mfe-version="2.5.0">
          <button data-de-provenance-id="${ID.button}" data-tokens="color.action.primary.background=background-color">New instruction</button>
          <div class="table-wrap"><table><tbody>${rows}</tbody></table></div>
        </section>
      </main>
    </div>`
}

export function mount(html: string): HTMLElement {
  document.body.innerHTML = ''
  const host = document.createElement('div')
  host.innerHTML = html.trim()
  document.body.append(host)
  return host
}
