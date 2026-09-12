import type { CommentThread, NonVisualTarget } from '@adl/anchor-core'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useFeedback } from './context.js'
import { AnchorSummary, LevelChip, Metric, StaleNotice, StatusChip, percent } from './parts.js'
import { describeAnchor, plainStatus } from './plain.js'
import { useFeedbackStyles } from './styles.js'
import { versionPosition } from './versions.js'

type TabId = 'comments' | 'versions' | 'network' | 'runtime' | 'build'

/**
 * Two people read this panel. The reviewer who left the comments sees the page
 * in the words of the page, and the loop she came for: say what is wrong, ask
 * for the next version, keep it or go back. The engineer who builds that
 * version turns on Technical details and gets paths, source references, anchor
 * levels and the Network, Runtime and Build views. Nothing technical shows
 * until it is asked for, and it is asked for in one place.
 */
const TABS: Array<{ id: TabId; label: string; technical?: boolean }> = [
  { id: 'comments', label: 'Comments' },
  { id: 'versions', label: 'Versions' },
  { id: 'network', label: 'Network', technical: true },
  { id: 'runtime', label: 'Runtime', technical: true },
  { id: 'build', label: 'Build', technical: true },
]

const GENERAL_TOPICS = ['Spacing', 'Forms', 'Navigation', 'Wording', 'Accessibility', 'Something else']

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function when(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${plural(minutes, 'minute')} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${plural(hours, 'hour')} ago`
  return new Date(iso).toLocaleDateString()
}

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

/** Inline composer used by the Network, Runtime and Build rows. */
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

/** Shown in full with Technical details on; one click away without. */
function Disclosure({ children }: { children: ReactNode }): ReactNode {
  const { details } = useFeedback()
  if (details) return <>{children}</>
  return (
    <details className="adl-disclosure">
      <summary>Details</summary>
      {children}
    </details>
  )
}

function CommentCard({ thread, number }: { thread: CommentThread; number: number }): ReactNode {
  const { reply, setThreadStatus, selectThread, selectedThreadId, details } = useFeedback()
  const [draft, setDraft] = useState('')
  const open = thread.status === 'open'
  const trouble = plainStatus(thread.anchorStatus)
  // The crop is for the reviewer: when the thing a comment was on has moved or
  // gone, a picture of it is the only thing that says what she meant.
  const crop = thread.anchorStatus !== 'resolved' ? thread.anchor.visual?.crop : undefined
  const [first, ...replies] = thread.comments

  return (
    <RowCard
      className="adl-thread"
      selected={selectedThreadId === thread.id}
      onClick={() => selectThread(thread.id)}
    >
      <div className="adl-row-between">
        <div className="adl-row">
          <span className="adl-chip">#{number}</span>
          {trouble ? (
            <span className="adl-chip" data-status={thread.anchorStatus} title={trouble.hint}>
              <i className="adl-dot" aria-hidden="true" />
              {trouble.label}
            </span>
          ) : null}
          {!open ? <span className="adl-chip">Done</span> : null}
        </div>
        <button
          type="button"
          className="adl-btn"
          onClick={(event) => {
            event.stopPropagation()
            setThreadStatus(thread.id, open ? 'resolved' : 'open')
          }}
        >
          {open ? 'Mark done' : 'Reopen'}
        </button>
      </div>

      <div className="adl-thread-title">{describeAnchor(thread.anchor)}</div>
      {trouble ? <div className="adl-label">{trouble.hint}</div> : null}
      {crop ? <img className="adl-crop" src={crop} alt="what this comment was left on" /> : null}

      {first ? (
        <div className="adl-comment">
          <span className="adl-label">
            {first.author.name} · {when(first.createdAt)}
          </span>
          <div>{first.body}</div>
        </div>
      ) : null}

      {replies.length > 0 ? (
        <ul className="adl-list adl-replies">
          {replies.map((comment) => (
            <li key={comment.id} className="adl-comment">
              <span className="adl-label">
                {comment.author.name} · {when(comment.createdAt)}
              </span>
              <div>{comment.body}</div>
            </li>
          ))}
        </ul>
      ) : null}

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
          placeholder="Reply…"
          onChange={(event) => setDraft(event.target.value)}
        />
      </form>

      <Disclosure>
        <div className="adl-stack" style={{ gap: 4 }}>
          <div className="adl-row">
            <StatusChip status={thread.anchorStatus} />
            <LevelChip resolution={thread.resolution} />
          </div>
          <AnchorSummary anchor={thread.anchor} resolution={thread.resolution} />
          <StaleNotice entries={thread.staleAgainst} />
          {details ? <span className="adl-label">owner: {thread.owner.name}</span> : null}
        </div>
      </Disclosure>
    </RowCard>
  )
}

/** Feedback about the whole page rather than one part of it. */
function WholePageComposer(): ReactNode {
  const { commentGeneral, selectThread } = useFeedback()
  const [open, setOpen] = useState(false)
  const [topic, setTopic] = useState(GENERAL_TOPICS[0]!)
  const [body, setBody] = useState('')

  if (!open) {
    return (
      <button
        type="button"
        className="adl-btn adl-wide"
        style={{ marginBottom: 10 }}
        onClick={() => setOpen(true)}
      >
        Comment on the whole page
      </button>
    )
  }

  return (
    <form
      className="adl-card adl-stack"
      aria-label="whole page comment"
      style={{ marginBottom: 10 }}
      onSubmit={(event) => {
        event.preventDefault()
        const text = body.trim()
        if (!text) return
        const thread = commentGeneral(topic.toLowerCase(), text)
        selectThread(thread.id)
        setBody('')
        setOpen(false)
      }}
    >
      <span className="adl-label">Something wider than one part of the page</span>
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
        aria-label="whole page comment body"
        placeholder="Spacing, form patterns, wording…"
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      <div className="adl-row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="adl-btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" className="adl-btn" data-variant="primary">
          Comment
        </button>
      </div>
    </form>
  )
}

/**
 * She reads exactly what will go, and takes out anything she wants kept but not
 * acted on yet. Comments marked done never go.
 */
function RequestSheet({ onClose }: { onClose: () => void }): ReactNode {
  const {
    threads,
    includedThreads,
    excludedThreadIds,
    setIncluded,
    draftRequest,
    requestChanges,
    requesting,
    details,
  } = useFeedback()
  const [error, setError] = useState<string | null>(null)
  const open = threads.filter((thread) => thread.status === 'open')
  const numberOf = (thread: CommentThread) => threads.indexOf(thread) + 1
  const brief = includedThreads.length > 0 ? draftRequest().brief : null

  const send = async () => {
    if (requesting || includedThreads.length === 0) return
    setError(null)
    try {
      await requestChanges()
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <div className="adl-stack" aria-label="request changes">
      <div className="adl-row-between">
        <strong>Request changes</strong>
        <button type="button" className="adl-btn" onClick={onClose} disabled={requesting}>
          Back
        </button>
      </div>
      <p className="adl-muted">
        {plural(includedThreads.length, 'comment')} will go to the team, who will build the next
        version of this page. Untick anything you want to keep but not act on yet.
      </p>

      <ul className="adl-list">
        {open.map((thread) => {
          const number = numberOf(thread)
          return (
            <li key={thread.id} className="adl-pick">
              <label>
                <input
                  type="checkbox"
                  checked={!excludedThreadIds.has(thread.id)}
                  aria-label={`include comment ${number}`}
                  onChange={(event) => setIncluded(thread.id, event.target.checked)}
                />
                <span>
                  <span className="adl-thread-title" style={{ margin: 0 }}>
                    {describeAnchor(thread.anchor)}
                  </span>
                  <span className="adl-label">{thread.comments[0]?.body}</span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      {brief ? (
        details ? (
          <pre className="adl-digest" aria-label="the brief">
            {brief}
          </pre>
        ) : (
          <details className="adl-disclosure">
            <summary>Exactly what will be sent</summary>
            <pre className="adl-digest" aria-label="the brief">
              {brief}
            </pre>
          </details>
        )
      ) : null}

      <button
        type="button"
        className="adl-btn adl-wide"
        data-variant="primary"
        disabled={requesting || includedThreads.length === 0}
        onClick={send}
      >
        {requesting ? 'Building the next version…' : `Send ${plural(includedThreads.length, 'comment')}`}
      </button>
      {error ? (
        <span className="adl-chip" data-status="orphaned">
          {error}
        </span>
      ) : null}
    </div>
  )
}

function CommentsTab(): ReactNode {
  const { threads, includedThreads } = useFeedback()
  const [requesting, setRequesting] = useState(false)
  const open = threads.filter((thread) => thread.status === 'open')
  const done = threads.filter((thread) => thread.status !== 'open')
  const numberOf = (thread: CommentThread) => threads.indexOf(thread) + 1

  if (requesting) return <RequestSheet onClose={() => setRequesting(false)} />

  return (
    <>
      <WholePageComposer />

      {threads.length === 0 ? (
        <p className="adl-muted">
          Click anything on the page to comment on it.
        </p>
      ) : (
        <>
          <ul className="adl-list">
            {open.map((thread) => (
              <CommentCard key={thread.id} thread={thread} number={numberOf(thread)} />
            ))}
          </ul>
          {done.length > 0 ? (
            <details>
              <summary>{plural(done.length, 'comment')} marked done</summary>
              <ul className="adl-list" style={{ marginTop: 8 }}>
                {done.map((thread) => (
                  <CommentCard key={thread.id} thread={thread} number={numberOf(thread)} />
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}

      {includedThreads.length > 0 ? (
        <div className="adl-panel-footer">
          <button
            type="button"
            className="adl-btn adl-wide"
            data-variant="primary"
            onClick={() => setRequesting(true)}
          >
            Request changes ({includedThreads.length})
          </button>
        </div>
      ) : null}
    </>
  )
}

/** Where she is in the history, and the two decisions she can make about it. */
function VersionsTab(): ReactNode {
  const {
    versions,
    currentVersion,
    viewVersion,
    approveCurrentVersion,
    threads,
    lastRequest,
    details,
  } = useFeedback()
  const [approving, setApproving] = useState(false)
  const previous = versions[versions.indexOf(currentVersion) - 1]

  const approve = async () => {
    setApproving(true)
    try {
      await approveCurrentVersion()
    } finally {
      setApproving(false)
    }
  }

  return (
    <ul className="adl-list">
      {[...versions].reverse().map((entry) => {
        const isCurrent = entry.id === currentVersion.id
        const addressed = entry.addressing?.length ?? 0
        return (
          <RowCard key={entry.id} className="adl-version" selected={isCurrent}>
            <div className="adl-row-between">
              <div className="adl-row">
                <strong>{entry.label}</strong>
                {isCurrent ? <span className="adl-chip">You're viewing this</span> : null}
                {entry.approvedAt ? (
                  <span className="adl-chip" data-status="resolved">
                    <i className="adl-dot" aria-hidden="true" />
                    Ready to deploy
                  </span>
                ) : null}
              </div>
              {!isCurrent ? (
                <button type="button" className="adl-btn" onClick={() => viewVersion(entry.id)}>
                  View
                </button>
              ) : null}
            </div>

            <div className="adl-label">
              {addressed > 0
                ? `Built from ${plural(addressed, 'comment')} · ${when(entry.createdAt)}`
                : versions.indexOf(entry) === 0
                  ? `The version you started from · ${when(entry.createdAt)}`
                  : when(entry.createdAt)}
            </div>
            {entry.approvedAt ? (
              <div className="adl-label">
                Approved by {entry.approvedBy?.name ?? 'someone'} · {when(entry.approvedAt)}
              </div>
            ) : null}

            {isCurrent && !entry.approvedAt ? (
              <div className="adl-row" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="adl-btn"
                  data-variant="primary"
                  disabled={approving}
                  onClick={approve}
                >
                  Approve for deployment
                </button>
                {previous ? (
                  <button type="button" className="adl-btn" onClick={() => viewVersion(previous.id)}>
                    Go back to {previous.label}
                  </button>
                ) : null}
              </div>
            ) : null}

            {details ? <div className="adl-mono">build {entry.id}</div> : null}
          </RowCard>
        )
      })}

      {lastRequest ? (
        <RowCard>
          <span className="adl-metric-label">last request</span>
          <div className="adl-label">
            {plural(lastRequest.comments.length, 'comment')} sent from{' '}
            {lastRequest.fromVersion.label} · {when(lastRequest.requestedAt)}
          </div>
          <p className="adl-muted" style={{ marginTop: 6 }}>
            Your comments follow the page into each new version. Mark done the ones it fixed.
          </p>
          {details ? <div className="adl-mono">{lastRequest.id}</div> : null}
        </RowCard>
      ) : null}

      {threads.length === 0 && versions.length === 1 ? (
        <p className="adl-muted">Comment on the page, then ask for the next version.</p>
      ) : null}
    </ul>
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

export function FeedbackPanel(): ReactNode {
  useFeedbackStyles()
  const { metrics, threads, lock, setPanelOpen, details, setDetails } = useFeedback()
  const [tab, setTab] = useState<TabId>('comments')
  const open = threads.filter((thread) => thread.status === 'open').length
  const tabs = TABS.filter((entry) => details || !entry.technical)

  // Turning details off while on an engineering view leaves nothing to show there.
  useEffect(() => {
    if (!tabs.some((entry) => entry.id === tab)) setTab('comments')
  }, [tab, tabs])

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
    <aside className="adl-root adl-panel" aria-label="Feedback">
      <header className="adl-panel-header">
        <div className="adl-row-between">
          <strong>{plural(open, 'open comment')}</strong>
          <div className="adl-row">
            <button
              type="button"
              className="adl-btn"
              aria-pressed={details}
              title="Paths, source references, anchor levels and the Network, Runtime and Build views"
              onClick={() => setDetails(!details)}
            >
              Technical details
            </button>
            <button type="button" className="adl-btn"
              aria-label="Close feedback"
              onClick={() => setPanelOpen(false)}
            >
              ✕
            </button>
          </div>
        </div>
        {details ? (
          <div className="adl-row" style={{ marginTop: 10, gap: 18 }}>
            <Metric value={percent(metrics.orphanRate)} label="orphan rate" />
            <Metric value={metrics.meanConfidence.toFixed(2)} label="confidence" />
            <span className="adl-mono">lock {lock.id.slice(0, 8)}</span>
          </div>
        ) : null}
      </header>

      <nav className="adl-tabs" role="tablist" aria-label="Feedback views">
        {tabs.map((entry) => (
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
        {tab === 'versions' ? <VersionsTab /> : null}
        {tab === 'network' ? <NetworkTab /> : null}
        {tab === 'runtime' ? <RuntimeTab /> : null}
        {tab === 'build' ? <BuildTab /> : null}
      </div>
    </aside>
  )
}

/**
 * The only thing always on screen. Mode, which version she is looking at, and
 * the way into her comments - nothing else competes with the page.
 */
export function FeedbackDock(): ReactNode {
  useFeedbackStyles()
  const {
    mode,
    setMode,
    panelOpen,
    setPanelOpen,
    threads,
    versions,
    currentVersion,
    onLatestVersion,
    viewVersion,
  } = useFeedback()
  const open = threads.filter((thread) => thread.status === 'open').length
  const latest = versions[versions.length - 1]!

  return (
    <div className="adl-root adl-dock" aria-label="Review">
      <div className="adl-segmented" role="group" aria-label="Mode">
        <button
          type="button"
          className="adl-btn"
          aria-pressed={mode === 'comment'}
          onClick={() => setMode('comment')}
        >
          Comment
        </button>
        <button
          type="button"
          className="adl-btn"
          aria-pressed={mode === 'browse'}
          onClick={() => setMode('browse')}
        >
          Browse
        </button>
      </div>

      {versions.length > 1 ? (
        <select
          className="adl-input adl-version-select"
          aria-label="Version"
          value={currentVersion.id}
          onChange={(event) => viewVersion(event.target.value)}
        >
          {versions.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
              {entry.approvedAt ? ' · approved' : ''}
            </option>
          ))}
        </select>
      ) : (
        <span className="adl-label">{versionPosition(versions, currentVersion.id)}</span>
      )}

      {!onLatestVersion ? (
        <button type="button" className="adl-btn" onClick={() => viewVersion(latest.id)}>
          Back to {latest.label}
        </button>
      ) : null}

      <button
        type="button"
        className="adl-btn"
        aria-pressed={panelOpen}
        onClick={() => setPanelOpen(!panelOpen)}
      >
        {plural(open, 'comment')}
      </button>
    </div>
  )
}
