import { OVERLAY_ATTR, FeedbackStore, createContextLock } from '@adl/anchor-core'
import type {
  Actor,
  BuildReport,
  ContextLock,
  ProvenanceManifest,
  ScreenshotOptions,
} from '@adl/anchor-core'
import type { FeedbackRepository, PreviewVersion } from '@adl/feedback-store'
import { hydrateFeedbackStore } from '@adl/feedback-store'
import { SaltProvider } from '@salt-ds/core'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { FeedbackDock, FeedbackPanel } from './FeedbackPanel.js'
import { FeedbackLayer } from './FeedbackLayer.js'
import { FeedbackProvider, useFeedback } from './context.js'
import { PreviewRecorder } from './instrumentation.js'
import { injectFeedbackStyles } from './styles.js'

export type Density = 'high' | 'medium' | 'low' | 'touch'

/** Everything the Frame can change between preview versions without remounting. */
export interface FeedbackToolbarUpdate {
  lock?: ContextLock
  manifest?: ProvenanceManifest
  buildReport?: BuildReport
  buildId?: string
  label?: string
  remotes?: PreviewVersion['remotes']
  previewRoot?: HTMLElement | string
  mode?: 'light' | 'dark'
}

export interface MountFeedbackToolbarOptions extends FeedbackToolbarUpdate {
  /** The element bounding the preview. Anchors never reach outside it. */
  previewRoot: HTMLElement | string
  /** Who is reviewing. Threads are owned by a person, never by "the preview". */
  actor: Actor
  /** Stable across preview versions: threads belong to it, not to a build. */
  previewId: string
  lock: ContextLock
  repository?: FeedbackRepository
  recorder?: PreviewRecorder
  /** Defaults to a div appended to document.body. */
  container?: HTMLElement
  density?: Density
  captureCrops?: boolean | ScreenshotOptions
  settleMs?: number
  startOpen?: boolean
}

export interface FeedbackToolbarHandle {
  store: FeedbackStore
  recorder: PreviewRecorder
  container: HTMLElement
  /** Re-render against new pinned inputs. Triggers a re-anchor pass. */
  update(next: FeedbackToolbarUpdate): void
  destroy(): void
}

function resolveRoot(target: HTMLElement | string | undefined): HTMLElement | null {
  if (!target) return null
  if (typeof target !== 'string') return target
  return document.querySelector<HTMLElement>(target)
}

function PanelSlot(): ReactNode {
  const { panelOpen } = useFeedback()
  return panelOpen ? <FeedbackPanel /> : null
}

interface AppProps extends MountFeedbackToolbarOptions {
  store: FeedbackStore
  recorder: PreviewRecorder
  container: HTMLElement
}

function ToolbarApp(props: AppProps): ReactNode {
  // A live getter, not a captured element: the Frame mounts the toolbar before
  // the remotes have finished loading, so the preview root appears later.
  const previewRef = {
    get current(): HTMLElement | null {
      return resolveRoot(props.previewRoot)
    },
  }

  return (
    <SaltProvider mode={props.mode ?? 'dark'} density={props.density ?? 'high'}>
      <FeedbackProvider
        actor={props.actor}
        previewId={props.previewId}
        lock={props.lock}
        manifest={props.manifest}
        buildReport={props.buildReport}
        buildId={props.buildId}
        label={props.label}
        remotes={props.remotes}
        previewRef={previewRef}
        overlayContainer={props.container}
        store={props.store}
        recorder={props.recorder}
        repository={props.repository}
        captureCrops={props.captureCrops}
        settleMs={props.settleMs}
      >
        <FeedbackLayer />
        <FeedbackDock />
        <PanelSlot />
      </FeedbackProvider>
    </SaltProvider>
  )
}

/**
 * Mounted by the Frame in a preview environment, like a devtools bar. The
 * preview app does not import it, does not render it, and does not know it is
 * there - which is what makes it work over an MFE the reviewer's team does not
 * own.
 *
 * Resolves once the persisted threads for this preview have been loaded, so the
 * reviewer never sees an empty panel that fills in a moment later.
 */
export async function mountFeedbackToolbar(
  options: MountFeedbackToolbarOptions,
): Promise<FeedbackToolbarHandle> {
  injectFeedbackStyles(document)

  const container = options.container ?? document.createElement('div')
  container.className = 'adl-host'
  container.setAttribute(OVERLAY_ATTR, '')
  if (!container.isConnected) document.body.append(container)

  const recorder = options.recorder ?? new PreviewRecorder()
  const store = options.repository
    ? await hydrateFeedbackStore({
        repository: options.repository,
        previewId: options.previewId,
        lock: options.lock,
        buildId: options.buildId,
      })
    : new FeedbackStore({ lock: options.lock, buildId: options.buildId })

  let current: AppProps = { ...options, store, recorder, container }
  const root: Root = createRoot(container)
  const render = () => root.render(<ToolbarApp {...current} />)
  render()

  return {
    store,
    recorder,
    container,
    update(next) {
      current = { ...current, ...next }
      render()
    },
    destroy() {
      root.unmount()
      if (!options.container) container.remove()
    },
  }
}

/** Re-exported so a host can build a lock without also depending on anchor-core. */
export { createContextLock }
