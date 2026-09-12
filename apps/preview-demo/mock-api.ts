import type { IncomingMessage, ServerResponse } from 'node:http'

const positions = [
  { id: 'p-4411', account: '8891-USD', instrument: 'US912828M80', notional: 12_500_000, ccy: 'USD', status: 'settled' },
  { id: 'p-4412', account: '8891-USD', instrument: 'DE0001102309', notional: 4_250_000, ccy: 'EUR', status: 'pending' },
  { id: 'p-4413', account: '4402-GBP', instrument: 'GB00B058DQ55', notional: 980_000, ccy: 'GBP', status: 'failed' },
  { id: 'p-4414', account: '4402-GBP', instrument: 'US91282CJL61', notional: 7_100_000, ccy: 'USD', status: 'settled' },
]

const limits = [
  { id: 'l-1', name: 'Intraday credit', used: 0.62, cap: 50_000_000 },
  { id: 'l-2', name: 'Settlement exposure', used: 0.88, cap: 25_000_000 },
]

/**
 * Preview data fidelity is a budget item, not a nicety. When mock data is poor,
 * reviewers comment on the data instead of the UI and the feedback channel
 * turns into a bug tracker for the mock service.
 */
export function mockApi() {
  return {
    name: 'adl-mock-api',
    configureServer(server: {
      middlewares: {
        use(path: string, handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void): void
      }
    }) {
      const json = (res: ServerResponse, body: unknown) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(body))
      }
      server.middlewares.use('/api/accounts', (_req, res) => json(res, { positions }))
      server.middlewares.use('/api/limits', (_req, res) => json(res, { limits }))
    },
  }
}
