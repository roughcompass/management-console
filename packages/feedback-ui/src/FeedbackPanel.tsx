import type { CommentThread, NonVisualTarget } from '@adl/anchor-core'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { useFeedback } from './context.js'
import { AnchorSummary, LevelChip, Metric, StaleNotice, StatusChip, percent } from './parts.js'
import { useFeedbackStyles } from './styles.js'

type Tab = 'comments' | 'network' | 'runtime' | 'build'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'comments', label: 'Comments' },
  { id: 'network', label: 'Network' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'build', label: 'Build' },
]

/** Inline composer used by every non-visual anchor row. */
function RowComposer({ onSubmit }: { onSubmit: (body: string) => void }): ReactNode {
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  if (!open) {
    return (
      <button type="button" className="adl-btn" onClick={() => setOpen(true)}>
        Comment
      </button>
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
      <input
        className="adl-input"
        autoFocus
        value={body}
        placeholder="What should change here?"
        onChange={(event) => setBody(event.target.value)}
      />
      <div className="adl-row" style={{ marginTop: 6, justifyContent: 'flex-end' }}>
        <button type="button" className="adl-btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" className="adl-btn" data-variant="primary">
          Save
        </button>
      </div>
    </form>
  )
}

function ThreadCard({ thread, index }: { thread: CommentThread; index: number }): ReactNode {
  const { reply, setThreadStatus, selectThread, selectedThreadId } = useFeedback()
  const [draft, setDraft] = useState('')

  return (
    <li
      className="adl-card"
      data-selected={selectedThreadId === thread.id}
      onClick={() => selectThread(thread.id)}
    >
      <div className="adl-row-between">
        <div className="adl-row">
          <span className="adl-chip">#{index + 1}</span>
          <StatusChip status={thread.anchorStatus} />
          <LevelChip resolution={thread.resolution} />
        </div>
        <button
          type="button"
          className="adl-btn"
          onClick={() => setThreadStatus(thread.id, thread.status === 'open' ? 'resolved' : 'open')}
        >
          {thread.status === 'open' ? 'Resolve' : 'Reopen'}
        </button>
      </div>

      <div style={{ margin: '8px 0' }}>
        <AnchorSummary anchor={thread.anchor} resolution={thread.resolution} />
      </div>

      <ul className="adl-list">
        {thread.comments.map((comment) => (
          <li key={comment.id} style={{ marginBottom: 6 }}>
            <div className="adl-muted" style={{ fontSize: 11 }}>
              {comment.author.name} · {comment.author.role}
            </div>
            <div>{comment.body}</div>
          </li>
        ))}
      </ul>

      <StaleNotice entries={thread.staleAgainst} />

      <div className="adl-row-between" style={{ marginTop: 8 }}>
        <span className="adl-muted" style={{ fontSize: 11 }}>
          owner: {thread.owner.name}
        </span>
      </div>

      <form
        style={{ marginTop: 6 }}
        onSubmit={(event) => {
          event.preventDefault()
          if (!draft.trim()) return
          reply(thread.id, draft.trim())
          setDraft('')
        }}
      >
        <input
          className="adl-input"
          value={draft}
          placeholder="Reply"
          onChange={(event) => setDraft(event.target.value)}
        />
      </form>
    </li>
  )
}

function CommentsTab(): ReactNode {
  const { threads } = useFeedback()
  const open = threads.filter((thread) => thread.status === 'open')
  const resolved = threads.filter((thread) => thread.status === 'resolved')
  const orphaned = open.filter((thread) => thread.anchorStatus === 'orphaned')

  if (threads.length === 0) {
    return <p className="adl-muted">No feedback yet. Pick a node in the preview to start a thread.</p>
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
          <summary className="adl-muted">{resolved.length} resolved</summary>
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
  if (recorder.network.length === 0) {
    return <p className="adl-muted">No requests recorded yet.</p>
  }
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
          <li key={entry.id} className="adl-card">
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
          </li>
        )
      })}
    </ul>
  )
}

function RuntimeTab(): ReactNode {
  const { recorder, commentOnTarget } = useFeedback()
  if (recorder.events.length === 0) {
    return <p className="adl-muted">No runtime events recorded yet.</p>
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
          <li key={entry.id} className="adl-card">
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
          </li>
        )
      })}
    </ul>
  )
}

function BuildTab(): ReactNode {
  const { buildReport, commentOnTarget, lock } = useFeedback()
  return (
    <>
      <div className="adl-card">
        <div className="adl-metric-label">context lock {lock.id}</div>
        <ul className="adl-list adl-mono">
          <li>frame {lock.frame} · contracts {lock.frameContracts}</li>
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
      </div>
      {!buildReport ? (
        <p className="adl-muted">No build report attached to this preview.</p>
      ) : (
        <ul className="adl-list">
          {buildReport.artifacts.map((artifact) => (
            <li key={`${artifact.kind}:${artifact.name}`} className="adl-card">
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
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/** The reviewer-side surface: threads, the instrumented panel, and the lock. */
export function FeedbackPanel(): ReactNode {
  useFeedbackStyles()
  const { metrics, threads, lock } = useFeedback()
  const [tab, setTab] = useState<Tab>('comments')
  const open = threads.filter((thread) => thread.status === 'open').length

  return (
    <aside className="adl-root adl-panel">
      <header className="adl-panel-header">
        <div className="adl-row-between">
          <strong>Feedback</strong>
          <span className="adl-mono">lock {lock.id.slice(0, 8)}</span>
        </div>
        <div className="adl-row" style={{ marginTop: 10, gap: 18 }}>
          <Metric value={String(open)} label="open" />
          <Metric value={percent(metrics.orphanRate)} label="orphan rate" />
          <Metric value={percent(metrics.degradedRate)} label="degraded" />
          <Metric value={metrics.meanConfidence.toFixed(2)} label="confidence" />
        </div>
      </header>
      <nav className="adl-tabs" role="tablist">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            className="adl-tab"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </nav>
      <div className="adl-panel-body">
        {tab === 'comments' ? <CommentsTab /> : null}
        {tab === 'network' ? <NetworkTab /> : null}
        {tab === 'runtime' ? <RuntimeTab /> : null}
        {tab === 'build' ? <BuildTab /> : null}
      </div>
    </aside>
  )
}

/** Minimal control bar for hosts that do not want to build their own chrome. */
export function FeedbackToolbar(): ReactNode {
  useFeedbackStyles()
  const { picking, setPicking, metrics, refresh } = useFeedback()
  return (
    <div className="adl-root adl-toolbar">
      <button
        type="button"
        className="adl-btn"
        data-active={picking}
        onClick={() => setPicking(!picking)}
      >
        {picking ? 'Picking… (esc)' : 'Comment on a node'}
      </button>
      <button type="button" className="adl-btn" onClick={() => refresh()}>
        Re-anchor
      </button>
      <span className="adl-muted">
        {metrics.total} anchors · {percent(metrics.orphanRate)} orphaned
      </span>
    </div>
  )
}
