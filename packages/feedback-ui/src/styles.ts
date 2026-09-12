import { useEffect } from 'react'

const STYLE_ID = 'adl-feedback-styles'

export const feedbackStyles = `
.adl-root {
  --adl-bg: #14161c;
  --adl-bg-soft: #1c1f27;
  --adl-line: #2b303b;
  --adl-text: #e8eaf0;
  --adl-muted: #9aa3b5;
  --adl-accent: #5b8dff;
  --adl-resolved: #3fb27f;
  --adl-degraded: #e0a33e;
  --adl-orphaned: #e4685d;
  color: var(--adl-text);
  font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
.adl-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  pointer-events: none;
}
.adl-overlay > * { pointer-events: auto; }
.adl-highlight {
  position: fixed;
  border: 2px solid var(--adl-accent);
  border-radius: 3px;
  background: rgba(91, 141, 255, 0.12);
  pointer-events: none;
  transition: all 60ms linear;
}
.adl-highlight-label {
  position: absolute;
  left: -2px;
  bottom: 100%;
  margin-bottom: 4px;
  padding: 2px 6px;
  background: var(--adl-accent);
  color: #fff;
  border-radius: 3px;
  font: 11px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: nowrap;
  max-width: 60vw;
  overflow: hidden;
  text-overflow: ellipsis;
}
.adl-pin {
  position: fixed;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  transform: translate(-50%, -50%);
  border-radius: 11px;
  border: 2px solid #fff;
  background: var(--adl-accent);
  color: #fff;
  font: 600 11px/18px ui-sans-serif, system-ui, sans-serif;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}
.adl-pin[data-status='degraded'] { background: var(--adl-degraded); }
.adl-pin[data-status='orphaned'] { background: var(--adl-orphaned); }
.adl-pin[data-selected='true'] { outline: 3px solid rgba(91, 141, 255, 0.5); }
.adl-composer {
  position: fixed;
  width: 320px;
  padding: 12px;
  background: var(--adl-bg);
  border: 1px solid var(--adl-line);
  border-radius: 8px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
}
.adl-composer textarea {
  width: 100%;
  min-height: 68px;
  resize: vertical;
  background: var(--adl-bg-soft);
  color: inherit;
  border: 1px solid var(--adl-line);
  border-radius: 6px;
  padding: 8px;
  font: inherit;
}
.adl-panel {
  display: flex;
  flex-direction: column;
  width: 380px;
  max-height: 100%;
  background: var(--adl-bg);
  border-left: 1px solid var(--adl-line);
}
.adl-panel-header { padding: 12px 14px; border-bottom: 1px solid var(--adl-line); }
.adl-panel-body { overflow: auto; padding: 8px 10px 20px; }
.adl-tabs { display: flex; gap: 4px; padding: 8px 10px 0; }
.adl-tab {
  flex: 1;
  padding: 6px 4px;
  border: 1px solid transparent;
  border-radius: 6px 6px 0 0;
  background: transparent;
  color: var(--adl-muted);
  font: inherit;
  cursor: pointer;
}
.adl-tab[aria-selected='true'] {
  color: var(--adl-text);
  background: var(--adl-bg-soft);
  border-color: var(--adl-line);
}
.adl-card {
  border: 1px solid var(--adl-line);
  border-radius: 8px;
  background: var(--adl-bg-soft);
  padding: 10px;
  margin-bottom: 8px;
}
.adl-card[data-selected='true'] { border-color: var(--adl-accent); }
.adl-row { display: flex; align-items: center; gap: 8px; }
.adl-row-between { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.adl-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid var(--adl-line);
  font-size: 11px;
  color: var(--adl-muted);
}
.adl-chip[data-status='resolved'] { color: var(--adl-resolved); border-color: currentColor; }
.adl-chip[data-status='degraded'] { color: var(--adl-degraded); border-color: currentColor; }
.adl-chip[data-status='orphaned'] { color: var(--adl-orphaned); border-color: currentColor; }
.adl-mono {
  font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--adl-muted);
  word-break: break-word;
}
.adl-muted { color: var(--adl-muted); }
.adl-btn {
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid var(--adl-line);
  background: var(--adl-bg-soft);
  color: var(--adl-text);
  font: inherit;
  cursor: pointer;
}
.adl-btn:hover { border-color: var(--adl-accent); }
.adl-btn[data-variant='primary'] { background: var(--adl-accent); border-color: var(--adl-accent); color: #fff; }
.adl-btn[data-active='true'] { background: var(--adl-accent); border-color: var(--adl-accent); color: #fff; }
.adl-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.adl-metric { display: flex; flex-direction: column; gap: 2px; }
.adl-metric-value { font-size: 18px; font-weight: 600; }
.adl-metric-label { font-size: 11px; color: var(--adl-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.adl-list { list-style: none; margin: 0; padding: 0; }
.adl-input {
  width: 100%;
  background: var(--adl-bg);
  color: inherit;
  border: 1px solid var(--adl-line);
  border-radius: 6px;
  padding: 6px 8px;
  font: inherit;
}
.adl-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--adl-bg);
  border-bottom: 1px solid var(--adl-line);
}
.adl-stale {
  border-left: 2px solid var(--adl-degraded);
  padding-left: 8px;
  margin-top: 6px;
}
`

/** Injected once per document. No build step, no CSS import contract. */
export function useFeedbackStyles(): void {
  useEffect(() => {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = feedbackStyles
    document.head.append(style)
  }, [])
}
