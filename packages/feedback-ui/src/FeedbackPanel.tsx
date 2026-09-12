import type { CommentThread, NonVisualTarget } from '@adl/anchor-core'
import {
  Button,
  Card,
  Input,
  Tab,
  TabBar,
  TabList,
  TabPanel,
  TabTrigger,
  Tabs,
  Text,
} from '@salt-ds/core'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useFeedback } from './context.js'
import { AnchorSummary, LevelChip, Metric, StaleNotice, StatusChip, percent } from './parts.js'
import { useFeedbackStyles } from './styles.js'

type TabId = 'comments' | 'network' | 'runtime' | 'build'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'comments', label: 'Comments' },
  { id: 'network', label: 'Network' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'build', label: 'Build' },
]

/** Salt's Card is not polymorphic, so list semantics live on the wrapper. */
function RowCard({
  children,
  selected,
  onClick,
  className,
}: {
  children: ReactNode
  selected?: boolean
  onClick?: () => void
  className?: string
}): ReactNode {
  return (
    <li>
      <Card
        className={className ? `adl-card ${className}` : 'adl-card'}
        data-selected={selected}
        onClick={onClick}
      >
        {children}
      </Card>
    </li>
  )
}

/** Inline composer used by every non-visual anchor row. */
function RowComposer({ onSubmit }: { onSubmit: (body: string) => void }): ReactNode {
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')

  if (!open) {
    return (
      <Button appearance="transparent" onClick={() => setOpen(true)}>
        Comment
      </Button>
    )
  }
  return (
    <form
      style={{ marginTop: 6 }}
      onSubmit={(event) => {
        event.preventDefault()
        if (!body.trim()) return
        onSubmit(body.trim())
        setBody('')
        setOpen(false)
      }}
    >
      <Input
        value={body}
        placeholder="What should change here?"
        inputProps={{
          'aria-label': 'comment',
          autoFocus: true,
          onChange: (event) => setBody(event.target.value),
        }}
      />
      <div className="adl-row" style={{ marginTop: 6, justifyContent: 'flex-end' }}>
        <Button appearance="transparent" type="button" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button appearance="solid" sentiment="accented" type="submit">
          Save
        </Button>
      </div>
    </form>
  )
}

function ThreadCard({ thread, index }: { thread: CommentThread; index: number }): ReactNode {
  const { reply, setThreadStatus, selectThread, selectedThreadId } = useFeedback()
  const [draft, setDraft] = useState('')

  return (
    <RowCard
      className="adl-thread"
      selected={selectedThreadId === thread.id}
      onClick={() => selectThread(thread.id)}
    >
      <div className="adl-row-between">
        <div className="adl-row">
          <span className="adl-chip">#{index + 1}</span>
          <StatusChip status={thread.anchorStatus} />
          <LevelChip resolution={thread.resolution} />
        </div>
        <Button
          appearance="transparent"
          onClick={() => setThreadStatus(thread.id, thread.status === 'open' ? 'resolved' : 'open')}
        >
          {thread.status === 'open' ? 'Resolve' : 'Reopen'}
        </Button>
      </div>

      <div style={{ margin: '8px 0' }}>
        <AnchorSummary anchor={thread.anchor} resolution={thread.resolution} />
      </div>

      <ul className="adl-list">
        {thread.comments.map((comment) => (
          <li key={comment.id} style={{ marginBottom: 6 }}>
            <Text styleAs="label" color="secondary">
              {comment.author.name} · {comment.author.role}
            </Text>
            <Text>{comment.body}</Text>
          </li>
        ))}
      </ul>

      <StaleNotice entries={thread.staleAgainst} />

      <Text styleAs="label" color="secondary">
        owner: {thread.owner.name}
      </Text>

      <form
        style={{ marginTop: 6 }}
        onSubmit={(event) => {
          event.preventDefault()
          if (!draft.trim()) return
          reply(thread.id, draft.trim())
          setDraft('')
        }}
      >
        <Input
          value={draft}
          placeholder="Reply"
          inputProps={{
            'aria-label': `reply to comment ${index + 1}`,
            onChange: (event) => setDraft(event.target.value),
          }}
        />
      </form>
    </RowCard>
  )
}

function CommentsTab(): ReactNode {
  const { threads } = useFeedback()
  const open = threads.filter((thread) => thread.status === 'open')
  const resolved = threads.filter((thread) => thread.status === 'resolved')
  const orphaned = open.filter((thread) => thread.anchorStatus === 'orphaned')

  if (threads.length === 0) {
    return (
      <Text color="secondary">No feedback yet. Pick a node in the preview to start a thread.</Text>
    )
  }

  return (
    <>
      {orphaned.length > 0 ? (
        <p className="adl-chip" data-status="orphaned" style={{ marginBottom: 8 }}>
          {orphaned.length} lost their anchor in this build
        </p>
      ) : null}
      <ul className="adl-list">
        {open.map((thread, index) => (
          <ThreadCard key={thread.id} thread={thread} index={index} />
        ))}
      </ul>
      {resolved.length > 0 ? (
        <details>
          <summary>{resolved.length} resolved</summary>
          <ul className="adl-list" style={{ marginTop: 8 }}>
            {resolved.map((thread, index) => (
              <ThreadCard key={thread.id} thread={thread} index={index} />
            ))}
          </ul>
        </details>
      ) : null}
    </>
  )
}

function NetworkTab(): ReactNode {
  const { recorder, commentOnTarget } = useFeedback()
  if (recorder.network.length === 0) return <Text color="secondary">No requests recorded yet.</Text>

  return (
    <ul className="adl-list">
      {recorder.network.map((entry) => {
        const target: NonVisualTarget = {
          kind: 'network',
          method: entry.method,
          url: entry.url,
          urlPattern: entry.urlPattern,
          status: entry.status,
          durationMs: entry.durationMs,
          initiator: entry.initiator,
        }
        return (
          <RowCard key={entry.id}>
            <div className="adl-row-between">
              <span className="adl-mono">
                {entry.method} {entry.urlPattern}
              </span>
              <span className="adl-chip">{entry.failed ? 'failed' : (entry.status ?? '—')}</span>
            </div>
            <div className="adl-mono">
              {entry.url} · {entry.durationMs ?? '—'}ms · {entry.initiator}
            </div>
            <RowComposer onSubmit={(body) => commentOnTarget(target, body)} />
          </RowCard>
        )
      })}
    </ul>
  )
}

function RuntimeTab(): ReactNode {
  const { recorder, commentOnTarget } = useFeedback()
  if (recorder.events.length === 0) {
    return <Text color="secondary">No runtime events recorded yet.</Text>
  }

  return (
    <ul className="adl-list">
      {recorder.events.map((entry) => {
        const target: NonVisualTarget = {
          kind: 'runtime-event',
          channel: entry.channel,
          type: entry.type,
          capability: entry.capability,
          entitlement: entry.entitlement,
        }
        return (
          <RowCard key={entry.id}>
            <div className="adl-mono">
              {entry.channel}:{entry.type}
            </div>
            {entry.capability || entry.entitlement ? (
              <div className="adl-mono">
                {entry.capability ? `capability ${entry.capability}` : ''}
                {entry.entitlement ? ` · entitlement ${entry.entitlement}` : ''}
              </div>
            ) : null}
            <RowComposer onSubmit={(body) => commentOnTarget(target, body)} />
          </RowCard>
        )
      })}
    </ul>
  )
}

function BuildTab(): ReactNode {
  const { buildReport, commentOnTarget, lock } = useFeedback()
  return (
    <ul className="adl-list">
      <RowCard>
        <span className="adl-metric-label">context lock {lock.id}</span>
        <ul className="adl-list adl-mono">
          <li>
            frame {lock.frame} · contracts {lock.frameContracts}
          </li>
          <li>tokens {lock.designTokens}</li>
          <li>capability registry {lock.capabilityRegistry}</li>
          <li>lob conventions {lock.lobConventions}</li>
          <li>
            {lock.repo.name}@{lock.repo.commit}
          </li>
          {Object.entries(lock.mfes).map(([name, version]) => (
            <li key={name}>
              MFE {name} {version}
            </li>
          ))}
        </ul>
      </RowCard>
      {!buildReport
        ? null
        : buildReport.artifacts.map((artifact) => (
            <RowCard key={`${artifact.kind}:${artifact.name}`}>
              <div className="adl-row-between">
                <span className="adl-mono">{artifact.name}</span>
                <span className="adl-chip">{artifact.kind}</span>
              </div>
              {artifact.value || artifact.bytes ? (
                <div className="adl-mono">
                  {artifact.value ?? ''}
                  {artifact.bytes ? `${(artifact.bytes / 1024).toFixed(1)} kB` : ''}
                </div>
              ) : null}
              <RowComposer
                onSubmit={(body) =>
                  commentOnTarget(
                    {
                      kind: 'build-artifact',
                      artifact: artifact.kind,
                      name: artifact.name,
                      value: artifact.value,
                    },
                    body,
                  )
                }
              />
            </RowCard>
          ))}
    </ul>
  )
}

/** The reviewer-side surface: threads, the instrumented panel, and the lock. */
export function FeedbackPanel(): ReactNode {
  useFeedbackStyles()
  const { metrics, threads, lock, setPanelOpen } = useFeedback()
  const [tab, setTab] = useState<TabId>('comments')
  const open = threads.filter((thread) => thread.status === 'open').length

  // The panel overlays the right edge. A host that wants to keep its own
  // content visible can inset on this attribute; one that does not, ignores it.
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-adl-panel', 'open')
    root.style.setProperty('--adl-panel-width', '400px')
    return () => {
      root.removeAttribute('data-adl-panel')
      root.style.removeProperty('--adl-panel-width')
    }
  }, [])

  return (
    <aside className="adl-root adl-panel" aria-label="Preview feedback">
      <header className="adl-panel-header">
        <div className="adl-row-between">
          <Text styleAs="h4">Feedback</Text>
          <div className="adl-row">
            <span className="adl-mono">lock {lock.id.slice(0, 8)}</span>
            <Button
              appearance="transparent"
              aria-label="Close feedback panel"
              onClick={() => setPanelOpen(false)}
            >
              ✕
            </Button>
          </div>
        </div>
        <div className="adl-row" style={{ marginTop: 10, gap: 18 }}>
          <Metric value={String(open)} label="open" />
          <Metric value={percent(metrics.orphanRate)} label="orphan rate" />
          <Metric value={percent(metrics.degradedRate)} label="degraded" />
          <Metric value={metrics.meanConfidence.toFixed(2)} label="confidence" />
        </div>
      </header>

      <Tabs value={tab} onChange={(_event, value) => setTab(value as TabId)}>
        <TabBar divider inset>
          <TabList appearance="transparent">
            {TABS.map((entry) => (
              <Tab key={entry.id} value={entry.id}>
                <TabTrigger>{entry.label}</TabTrigger>
              </Tab>
            ))}
          </TabList>
        </TabBar>
        <div className="adl-panel-body">
          <TabPanel value="comments">
            <CommentsTab />
          </TabPanel>
          <TabPanel value="network">
            <NetworkTab />
          </TabPanel>
          <TabPanel value="runtime">
            <RuntimeTab />
          </TabPanel>
          <TabPanel value="build">
            <BuildTab />
          </TabPanel>
        </div>
      </Tabs>
    </aside>
  )
}

/**
 * The always-visible bar the Frame mounts into a preview. Everything else is
 * reachable from here, and nothing here depends on the preview app.
 */
export function FeedbackDock(): ReactNode {
  useFeedbackStyles()
  const { picking, setPicking, panelOpen, setPanelOpen, metrics, threads, refresh } = useFeedback()
  const open = threads.filter((thread) => thread.status === 'open').length

  return (
    <div className="adl-root adl-dock" aria-label="Feedback toolbar">
      <Button
        appearance={picking ? 'solid' : 'bordered'}
        sentiment="accented"
        onClick={() => setPicking(!picking)}
      >
        {picking ? 'Picking… (esc)' : 'Comment on a node'}
      </Button>
      <Button appearance="transparent" onClick={() => refresh({ record: false })}>
        Re-anchor
      </Button>
      <span className="adl-chip" data-status={metrics.orphanRate > 0 ? 'orphaned' : 'resolved'}>
        {percent(metrics.orphanRate)} orphaned
      </span>
      <Button appearance="bordered" onClick={() => setPanelOpen(!panelOpen)}>
        {panelOpen ? 'Hide' : 'Show'} feedback ({open})
      </Button>
    </div>
  )
}
