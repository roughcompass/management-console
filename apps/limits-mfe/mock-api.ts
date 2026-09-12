import type { IncomingMessage, ServerResponse } from 'node:http'

const limits = [
  { id: 'l-1', name: 'Intraday credit', used: 0.62, cap: 50_000_000 },
  { id: 'l-2', name: 'Settlement exposure', used: 0.88, cap: 25_000_000 },
]

interface DevServer {
  middlewares: {
    use(path: string, handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void): void
  }
}

export function mockApi() {
  return {
    name: 'adl-mock-limits-api',
    configureServer(server: DevServer) {
      server.middlewares.use('/api/limits', (_req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ limits }))
      })
    },
  }
}
