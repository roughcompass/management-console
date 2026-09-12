import type { ContextLockInput } from '@adl/anchor-core'

export interface RemotePin {
  version: string
  /** The federated module the shell loads for this pin. */
  module: string
  entry: string
}

export interface PreviewBuild {
  id: string
  label: string
  /**
   * The pinned inputs, not a built lock: hashing them needs anchor-core, which
   * is review code. A production shell carries this file and none of that.
   */
  lock: ContextLockInput
  remotes: Record<string, RemotePin>
}

const PAYMENTS_ORIGIN = import.meta.env.VITE_PAYMENTS_ORIGIN ?? 'http://localhost:5274'
const LIMITS_ORIGIN = import.meta.env.VITE_LIMITS_ORIGIN ?? 'http://localhost:5275'

/** What the shell's federation config points at. See apps/shell/vite.config.ts. */
const ENTRY = import.meta.env.VITE_MF_ENTRY ?? 'remoteEntry.js'

const limits: RemotePin = {
  version: '1.2.0',
  module: 'limits_panel/LimitsPanel',
  entry: `${LIMITS_ORIGIN}/${ENTRY}`,
}

/**
 * Two pinned previews of the same page. Build B is payments-dash after a
 * refactor: new file, restructured markup, the summary card removed, the
 * version bumped, and a newer token set under it.
 *
 * In production these are separately deployed remotes and the lock pins their
 * URLs. Here one dev server exposes both, so the switch is instant.
 */
export const BUILDS: PreviewBuild[] = [
  {
    id: 'a',
    label: 'A · payments-dash 2.4.1',
    lock: {
      frame: '3.1.0',
      frameContracts: '3.1',
      designTokens: 'salt-1.45.0',
      capabilityRegistry: '2026-09-11T00:00:00Z',
      lobConventions: 'markets-1.4',
      mfes: { 'payments-dash': '2.4.1', 'limits-panel': '1.2.0' },
      repo: { name: 'roughcompass/management-console', commit: 'a41c9ef' },
    },
    remotes: {
      'payments-dash': {
        version: '2.4.1',
        module: 'payments_dash/PaymentsDash',
        entry: `${PAYMENTS_ORIGIN}/${ENTRY}`,
      },
      'limits-panel': limits,
    },
  },
  {
    id: 'b',
    label: 'B · payments-dash 2.5.0 (rebuilt)',
    lock: {
      frame: '3.1.0',
      frameContracts: '3.1',
      designTokens: 'salt-1.46.0',
      capabilityRegistry: '2026-09-11T00:00:00Z',
      lobConventions: 'markets-1.4',
      mfes: { 'payments-dash': '2.5.0', 'limits-panel': '1.2.0' },
      repo: { name: 'roughcompass/management-console', commit: '7d20b13' },
    },
    remotes: {
      'payments-dash': {
        version: '2.5.0',
        module: 'payments_dash/PaymentsDashNext',
        entry: `${PAYMENTS_ORIGIN}/${ENTRY}`,
      },
      'limits-panel': limits,
    },
  },
]
