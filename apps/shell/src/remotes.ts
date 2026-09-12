import { lazy } from 'react'
import type { ComponentType, LazyExoticComponent } from 'react'

type RemoteModule = { default: ComponentType }

/**
 * Static import specifiers so the federation plugin can resolve them at build
 * time; which one is used is still a runtime decision driven by the pinned
 * preview version.
 */
const LOADERS: Record<string, () => Promise<RemoteModule>> = {
  'payments_dash/PaymentsDash': () =>
    import('payments_dash/PaymentsDash') as Promise<RemoteModule>,
  'payments_dash/PaymentsDashNext': () =>
    import('payments_dash/PaymentsDashNext') as Promise<RemoteModule>,
  'limits_panel/LimitsPanel': () => import('limits_panel/LimitsPanel') as Promise<RemoteModule>,
}

type LoadListener = (id: string) => void
const listeners = new Set<LoadListener>()

/**
 * A remote finishing its load is the signal to re-read the provenance
 * manifests: in dev a remote only lists the modules it has actually served.
 */
export function onRemoteLoaded(listener: LoadListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const cache = new Map<string, LazyExoticComponent<ComponentType>>()

export function remoteComponent(id: string): LazyExoticComponent<ComponentType> {
  const existing = cache.get(id)
  if (existing) return existing

  const component = lazy(async () => {
    const loader = LOADERS[id]
    if (!loader) throw new Error(`no federated module registered for ${id}`)
    const module = await loader()
    // The Frame publishes federation activity as a runtime event, so a
    // developer can anchor feedback to "this remote loaded the wrong version".
    window.dispatchEvent(
      new CustomEvent('frame:remote-loaded', { detail: { module: id, capability: id.split('/')[0] } }),
    )
    for (const listener of listeners) listener(id)
    return module
  })

  cache.set(id, component)
  return component
}
