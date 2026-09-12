import type { CommentThread, NonVisualTarget } from '@adl/anchor-core'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useFeedback } from './context.js'
import { AnchorSummary, LevelChip, Metric, StaleNotice, StatusChip, percent } from './parts.js'
import { useFeedbackStyles } from './styles.js'

type TabId = 'comments' | 'network' | 'runtime' | 'build' | 'submit'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'comments', label: 'Comments' },
  { id: 'network', label: 'Network' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'build', label: 'Build' },
  { id: 'submit', label: 'Submit' },
]

const GENERAL_TOPICS = ['spacing', 'forms', 'navigation', 'content', 'accessibility', 'other']

/**
 * The toolbar is deliberately not built from the host's design system. It
 * mounts over whatever the preview happens to be, reads design tokens when they
 * are there and falls back when they are not, and adds no second root-level
 * provider to the page.
 */
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
    <li
      className={className ? `adl-card ${className}` : 'adl-card'}
      data-selected={selected}
      onClick={onClick}
    >
      {children}
    </li>
  )
}

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
        aria-label="comment"
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

function ThreadCard({ thread, number }: { thread: CommentThread; number: number }): ReactNode {
  const {
    reply,
    setThreadStatus,
    selectThread,
    selectedThreadId,
    excludedThreadIds,
    setIncluded,
  } = useFeedback()
  const [draft, setDraft] = useState('')
  const open = thread.status === 'open'
  const included = open && !excludedThreadIds.has(thread.id)

  return (
    <RowCard
      className="adl-thread"
      selected={selectedThreadId === thread.id}
      onClick={() => selectThread(thread.id)}
    >
      <div className="adl-row-between">
        <div className="adl-row">
          <span className="adl-chip">#{number}</span>
          <StatusChip status={thread.anchorStatus} />
          <LevelChip resolution={thread.resolution} />
        </div>
        <button
          type="button"
          className="adl-btn"
          onClick={(event) => {
            event.stopPropagation()
            setThreadStatus(thread.id, open ? 'resolved' : 'open')
          }}
        >
          {open ? 'Close' : 'Reopen'}
        </button>
      </div>

      <div style={{ margin: '8px 0' }}>
        <AnchorSummary anchor={thread.anchor} resolution={thread.resolution} />
      </div>

      <ul className="adl-list">
        {thread.comments.map((comment) => (
          <li key={comment.id} style={{ marginBottom: 6 }}>
            <span className="adl-label">
              {comment.author.name} · {comment.author.role}
            </span>
            <div>{comment.body}</div>
          </li>
        ))}
      </ul>

      <StaleNotice entries={thread.staleAgainst} />

      <div className="adl-row-between">
        <span className="adl-label">owner: {thread.owner.name}</span>
        {open ? (
          <label className="adl-include" onClick={(event) => event.stopPropagation()}>
            <input
              type="checkbox"
              checked={included}
              aria-label={`send comment ${number} to the agent`}
              onChange={(event) => setIncluded(thread.id, event.target.checked)}
            />
            send to agent
          </label>
        ) : (
          <span className="adl-label">closed · not sent</span>
        )}
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
          aria-label={`reply to comment ${number}`}
          value={draft}
          placeholder="Reply"
          onChange={(event) => setDraft(event.target.value)}
        />
      </form>
    </RowCard>
  )
}

function CommentsTab(): ReactNode {
  const { threads } = useFeedback()
  const open = threads.filter((thread) => thread.status === 'open')
  const closed = threads.filter((thread) => thread.status !== 'open')
  const orphaned = open.filter((thread) => thread.anchorStatus === 'orphaned')
  // Numbered by creation, the same as the pins, so #3 in the list is pin 3.
  const numberOf = (thread: CommentThread) => threads.indexOf(thread) + 1

  if (threads.length === 0) {
    return (
      <p className="adl-muted">
        No feedback yet. Pick a node in the preview, or leave general feedback from the toolbar.
      </p>
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
        {open.map((thread) => (
          <ThreadCard key={thread.id} thread={thread} number={numberOf(thread)} />
        ))}
      </ul>
      {closed.length > 0 ? (
        <details>
          <summary>{closed.length} closed</summary>
          <ul className="adl-list" style={{ marginTop: 8 }}>
            {closed.map((thread) => (
              <ThreadCard key={thread.id} thread={thread} number={numberOf(thread)} />
            ))}
          </ul>
        </details>
      ) : null}
    </>
  )
}

/**
 * The reviewer reads exactly what will leave, then sends it. Open threads go
 * unless they were left out; closed ones never do. Nothing here decides what
 * the agent does with it - that is the next phase.
 */
function SubmitTab(): ReactNode {
  const { threads, includedThreads, previewSubmission, submit, lastSubmission } = useFeedback()
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = threads.filter((thread) => thread.status === 'open')
  const closed = threads.length - open.length
  const leftOut = open.length - includedThreads.length
  const preview = includedThreads.length > 0 ? previewSubmission() : null

  const send = async () => {
    if (!preview || sending) return
    setSending(true)
    setError(null)
    try {
      await submit()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="adl-stack">
      <div className="adl-row" style={{ gap: 18 }}>
        <Metric value={String(includedThreads.length)} label="to send" />
        <Metric value={String(leftOut)} label="left out" />
        <Metric value={String(closed)} label="closed" />
      </div>
      <p className="adl-muted">
        Open comments go to the agent unless you leave them out. Closed comments never do.
      </p>

      {preview ? (
        <pre className="adl-digest" aria-label="what will be sent">
          {preview.digest}
        </pre>
      ) : (
        <p className="adl-muted">Nothing to send.</p>
      )}

      <button
        type="button"
        className="adl-btn"
        data-variant="primary"
        disabled={!preview || sending}
        onClick={send}
      >
        {sending
          ? 'Sending…'
          : `Send ${includedThreads.length} ${includedThreads.length === 1 ? 'thread' : 'threads'} to the agent`}
      </button>
      {error ? (
        <span className="adl-chip" data-status="orphaned">
          {error}
        </span>
      ) : null}

      {lastSubmission ? (
        <div className="adl-card adl-stack" data-testid="last-submission">
          <span className="adl-metric-label">last sent</span>
          <div className="adl-mono">
            {lastSubmission.threads.length} threads · {new Date(lastSubmission.submittedAt).toLocaleTimeString()}{' '}
            · {lastSubmission.id}
          </div>
          <p className="adl-muted">
            Pin the next build when it lands: these threads re-anchor against it, and you close
            the ones it fixed.
          </p>
        </div>
      ) : null}
    </div>
  )
}

function NetworkTab(): ReactNode {
  const { recorder, commentOnTarget } = useFeedback()
  if (recorder.network.length === 0) return <p className="adl-muted">No requests recorded yet.</p>

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
  const { metrics, threads, includedThreads, lock, setPanelOpen } = useFeedback()
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
          <strong>Feedback</strong>
          <div className="adl-row">
            <span className="adl-mono">lock {lock.id.slice(0, 8)}</span>
            <button type="button" className="adl-btn"
              aria-label="Close feedback panel"
              onClick={() => setPanelOpen(false)}
            >
              ✕
            </button>
          </div>
        </div>
        <div className="adl-row" style={{ marginTop: 10, gap: 18 }}>
          <Metric value={String(open)} label="open" />
          <Metric value={String(includedThreads.length)} label="to send" />
          <Metric value={percent(metrics.orphanRate)} label="orphan rate" />
          <Metric value={metrics.meanConfidence.toFixed(2)} label="confidence" />
        </div>
      </header>

      <nav className="adl-tabs" role="tablist" aria-label="Feedback views">
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
      <div className="adl-panel-body" role="tabpanel">
        {tab === 'comments' ? <CommentsTab /> : null}
        {tab === 'network' ? <NetworkTab /> : null}
        {tab === 'runtime' ? <RuntimeTab /> : null}
        {tab === 'build' ? <BuildTab /> : null}
        {tab === 'submit' ? <SubmitTab /> : null}
      </div>
    </aside>
  )
}

/** Feedback that is about the preview, not a node in it. Opens from the dock. */
function GeneralComposer({ onClose }: { onClose: () => void }): ReactNode {
  const { commentGeneral, selectThread, setPanelOpen } = useFeedback()
  const [topic, setTopic] = useState(GENERAL_TOPICS[0]!)
  const [body, setBody] = useState('')

  return (
    <form
      className="adl-composer adl-general-composer"
      aria-label="general feedback"
      onSubmit={(event) => {
        event.preventDefault()
        const text = body.trim()
        if (!text) return
        const thread = commentGeneral(topic, text)
        selectThread(thread.id)
        setPanelOpen(true)
        onClose()
      }}
    >
      <div className="adl-stack">
        <div className="adl-row-between">
          <strong>General feedback</strong>
          <span className="adl-label">not tied to an element</span>
        </div>
        <select
          className="adl-input"
          aria-label="topic"
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
        >
          {GENERAL_TOPICS.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
        <textarea
          className="adl-input adl-textarea"
          rows={3}
          autoFocus
          aria-label="general feedback body"
          placeholder="Spacing, form patterns, copy - anything wider than one element"
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <div className="adl-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="adl-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="adl-btn" data-variant="primary">
            Comment
          </button>
        </div>
      </div>
    </form>
  )
}

/**
 * The always-visible bar the Frame mounts into a preview. Everything else is
 * reachable from here, and nothing here depends on the preview app.
 */
export function FeedbackDock(): ReactNode {
  useFeedbackStyles()
  const { picking, setPicking, panelOpen, setPanelOpen, metrics, threads, refresh } = useFeedback()
  const [generalOpen, setGeneralOpen] = useState(false)
  const open = threads.filter((thread) => thread.status === 'open').length

  return (
    <>
      {generalOpen ? <GeneralComposer onClose={() => setGeneralOpen(false)} /> : null}
      <div className="adl-root adl-dock" aria-label="Feedback toolbar">
        <button
          type="button"
          className="adl-btn"
          data-active={picking}
          onClick={() => {
            setGeneralOpen(false)
            setPicking(!picking)
          }}
        >
          {picking ? 'Picking… (esc)' : 'Comment on a node'}
        </button>
        <button
          type="button"
          className="adl-btn"
          data-active={generalOpen}
          onClick={() => {
            setPicking(false)
            setGeneralOpen(!generalOpen)
          }}
        >
          General feedback
        </button>
        <button type="button" className="adl-btn" onClick={() => refresh({ record: false })}>
          Re-anchor
        </button>
        <span className="adl-chip" data-status={metrics.orphanRate > 0 ? 'orphaned' : 'resolved'}>
          {percent(metrics.orphanRate)} orphaned
        </span>
        <button type="button" className="adl-btn" onClick={() => setPanelOpen(!panelOpen)}>
          {panelOpen ? 'Hide' : 'Show'} feedback ({open})
        </button>
      </div>
    </>
  )
}
