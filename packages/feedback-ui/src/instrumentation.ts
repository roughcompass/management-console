import { createId } from '@adl/anchor-core'

export interface NetworkEntry {
  id: string
  method: string
  url: string
  urlPattern: string
  status?: number
  durationMs?: number
  startedAt: string
  initiator: string
  failed?: boolean
}

export interface RuntimeEventEntry {
  id: string
  channel: string
  type: string
  capability?: string
  entitlement?: string
  detail?: unknown
  at: string
}

const ID_SEGMENT = /^(?:\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,})$/i

/** /accounts/8891/positions -> /accounts/:id/positions */
export function toUrlPattern(rawUrl: string): string {
  let path = rawUrl
  try {
    path = new URL(rawUrl, 'http://preview.local').pathname
  } catch {
    // Relative or malformed: pattern the string as given.
  }
  return path
    .split('/')
    .map((segment) => (ID_SEGMENT.test(segment) ? ':id' : segment))
    .join('/')
}

export type RecorderListener = () => void

export interface RecorderOptions {
  /** Window CustomEvent types with this prefix are captured as runtime events. */
  eventPrefix?: string
  maxEntries?: number
}

/**
 * The instrumented preview panel is a real build item, not a nicety. Without
 * it a developer cannot say "this call should go through the entitlement-gated
 * hook" and have the comment anchor to anything durable.
 */
export class PreviewRecorder {
  network: NetworkEntry[] = []
  events: RuntimeEventEntry[] = []
  private listeners = new Set<RecorderListener>()
  private stopFns: Array<() => void> = []
  private maxEntries: number
  private eventPrefix: string

  constructor(options: RecorderOptions = {}) {
    this.maxEntries = options.maxEntries ?? 200
    this.eventPrefix = options.eventPrefix ?? 'frame:'
  }

  subscribe(listener: RecorderListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  recordNetwork(entry: Omit<NetworkEntry, 'id' | 'urlPattern'> & { urlPattern?: string }): NetworkEntry {
    const full: NetworkEntry = {
      ...entry,
      id: createId('net'),
      urlPattern: entry.urlPattern ?? toUrlPattern(entry.url),
    }
    this.network = [full, ...this.network].slice(0, this.maxEntries)
    this.emit()
    return full
  }

  recordEvent(entry: Omit<RuntimeEventEntry, 'id' | 'at'> & { at?: string }): RuntimeEventEntry {
    const full: RuntimeEventEntry = {
      ...entry,
      id: createId('evt'),
      at: entry.at ?? new Date().toISOString(),
    }
    this.events = [full, ...this.events].slice(0, this.maxEntries)
    this.emit()
    return full
  }

  /** Patches fetch and listens for framed runtime events. Returns the undo. */
  start(target: Window & typeof globalThis = window): () => void {
    this.stopFns.push(this.patchFetch(target))
    this.stopFns.push(this.listenForEvents(target))
    const stop = () => {
      for (const fn of this.stopFns.splice(0)) fn()
    }
    return stop
  }

  private patchFetch(target: Window & typeof globalThis): () => void {
    const original = target.fetch
    if (typeof original !== 'function') return () => {}
    const recorder = this
    const patched: typeof fetch = async function patchedFetch(input, init) {
      const started = Date.now()
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const method = init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')
      try {
        const response = await original.call(target, input as RequestInfo, init)
        recorder.recordNetwork({
          method: (method ?? 'GET').toUpperCase(),
          url,
          status: response.status,
          durationMs: Date.now() - started,
          startedAt: new Date(started).toISOString(),
          initiator: 'fetch',
        })
        return response
      } catch (error) {
        recorder.recordNetwork({
          method: (method ?? 'GET').toUpperCase(),
          url,
          durationMs: Date.now() - started,
          startedAt: new Date(started).toISOString(),
          initiator: 'fetch',
          failed: true,
        })
        throw error
      }
    }
    target.fetch = patched
    return () => {
      target.fetch = original
    }
  }

  private listenForEvents(target: Window & typeof globalThis): () => void {
    const prefix = this.eventPrefix
    const handler = (event: Event) => {
      if (!event.type.startsWith(prefix)) return
      const detail = (event as CustomEvent).detail as
        | { capability?: string; entitlement?: string }
        | undefined
      this.recordEvent({
        channel: prefix.replace(/:$/, ''),
        type: event.type.slice(prefix.length),
        capability: detail?.capability,
        entitlement: detail?.entitlement,
        detail,
      })
    }
    // CustomEvent types are not enumerable, so the host declares which it emits.
    const types = (target as unknown as { __ADL_EVENT_TYPES__?: string[] }).__ADL_EVENT_TYPES__ ?? []
    for (const type of types) target.addEventListener(type, handler)
    return () => {
      for (const type of types) target.removeEventListener(type, handler)
    }
  }

  clear(): void {
    this.network = []
    this.events = []
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

/** Declare the runtime event types a Frame emits, so the recorder can listen. */
export function declareRuntimeEvents(types: string[], target: Window = window): void {
  ;(target as unknown as { __ADL_EVENT_TYPES__?: string[] }).__ADL_EVENT_TYPES__ = types
}
