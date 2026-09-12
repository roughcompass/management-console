import { useEffect } from 'react'

const STYLE_ID = 'adl-feedback-styles'

/**
 * Geometry and chrome only. Colour, type and spacing come from Salt tokens, so
 * the toolbar follows whatever theme the Frame is running.
 *
 * Every rule is scoped under `.adl-root`, and the root sets the properties a
 * preview's global CSS is most likely to leak (box-sizing, font, line-height).
 * Full isolation would need a shadow root, which Salt's runtime CSS injection
 * does not target in this version - see docs/embedding.md.
 */
export const feedbackStyles = `
.adl-root {
  box-sizing: border-box;
  font-family: var(--salt-text-fontFamily, ui-sans-serif, system-ui, sans-serif);
  font-size: var(--salt-text-fontSize, 13px);
  line-height: var(--salt-text-lineHeight, 1.4);
  color: var(--salt-content-primary-foreground, #e8eaf0);
}
.adl-root *, .adl-root *::before, .adl-root *::after { box-sizing: inherit; }

.adl-host {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  pointer-events: none;
}
.adl-host .adl-dock,
.adl-host .adl-panel,
.adl-host .adl-composer,
.adl-host .adl-pin { pointer-events: auto; }

.adl-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  pointer-events: none;
}
.adl-overlay > * { pointer-events: auto; }

.adl-highlight {
  position: fixed;
  border: 2px solid var(--salt-accent-borderColor, #2d7ff9);
  border-radius: 2px;
  background: color-mix(in srgb, var(--salt-accent-background, #2d7ff9) 14%, transparent);
  pointer-events: none;
}
.adl-highlight-label {
  position: absolute;
  left: -2px;
  bottom: 100%;
  margin-bottom: 4px;
  padding: 2px 6px;
  background: var(--salt-accent-background, #2d7ff9);
  color: var(--salt-content-primary-foreground-inverse, #fff);
  border-radius: 2px;
  font: 11px/1.3 var(--salt-text-code-fontFamily, ui-monospace, monospace);
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
  border: 2px solid var(--salt-container-primary-background, #fff);
  background: var(--salt-accent-background, #2d7ff9);
  color: var(--salt-content-primary-foreground-inverse, #fff);
  font: 600 11px/18px var(--salt-text-fontFamily, system-ui, sans-serif);
  cursor: pointer;
  box-shadow: var(--salt-overlayable-shadow-popout, 0 2px 8px rgba(0, 0, 0, 0.35));
}
.adl-pin[data-status='degraded'] { background: var(--salt-status-warning-borderColor, #e0a33e); }
.adl-pin[data-status='orphaned'] { background: var(--salt-status-error-borderColor, #e4685d); }
.adl-pin[data-selected='true'] { outline: 3px solid color-mix(in srgb, var(--salt-accent-background, #2d7ff9) 45%, transparent); }
.adl-pin[data-thread-status='resolved'] { opacity: 0.45; }

.adl-composer {
  position: fixed;
  width: 320px;
  padding: var(--salt-spacing-100, 8px);
  background: var(--salt-container-primary-background, #1c1f27);
  border: var(--salt-size-border, 1px) solid var(--salt-container-primary-borderColor, #2b303b);
  border-radius: var(--salt-palette-corner, 0);
  box-shadow: var(--salt-overlayable-shadow-popout, 0 16px 40px rgba(0, 0, 0, 0.45));
}

.adl-dock {
  position: fixed;
  bottom: var(--salt-spacing-200, 16px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: var(--salt-spacing-100, 8px);
  padding: var(--salt-spacing-75, 6px) var(--salt-spacing-100, 8px);
  background: var(--salt-container-primary-background, #1c1f27);
  border: var(--salt-size-border, 1px) solid var(--salt-container-primary-borderColor, #2b303b);
  box-shadow: var(--salt-overlayable-shadow-popout, 0 10px 30px rgba(0, 0, 0, 0.45));
}

.adl-panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 400px;
  max-width: 100vw;
  display: flex;
  flex-direction: column;
  background: var(--salt-container-primary-background, #14161c);
  border-left: var(--salt-size-border, 1px) solid var(--salt-container-primary-borderColor, #2b303b);
  box-shadow: var(--salt-overlayable-shadow-popout, -8px 0 30px rgba(0, 0, 0, 0.4));
}
.adl-panel-header { padding: var(--salt-spacing-150, 12px); border-bottom: var(--salt-size-border, 1px) solid var(--salt-container-primary-borderColor, #2b303b); }
.adl-panel-body { overflow: auto; padding: var(--salt-spacing-100, 8px); flex: 1; }

.adl-card { padding: var(--salt-spacing-100, 8px); margin-bottom: var(--salt-spacing-100, 8px); }
.adl-card[data-selected='true'] { border-color: var(--salt-accent-borderColor, #2d7ff9); }
.adl-crop {
  display: block;
  max-width: 100%;
  border: var(--salt-size-border, 1px) solid var(--salt-container-primary-borderColor, #2b303b);
  margin: var(--salt-spacing-50, 4px) 0;
}
.adl-mono {
  font: 11px/1.45 var(--salt-text-code-fontFamily, ui-monospace, SFMono-Regular, Menlo, monospace);
  color: var(--salt-content-secondary-foreground, #9aa3b5);
  word-break: break-word;
}
.adl-stack { display: grid; gap: var(--salt-spacing-100, 8px); }
.adl-label {
  font-size: 11px;
  color: var(--salt-content-secondary-foreground, #9aa3b5);
}
.adl-muted { color: var(--salt-content-secondary-foreground, #9aa3b5); margin: 0; }
.adl-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.adl-metric-value { font-size: 18px; font-weight: 600; }
.adl-btn {
  padding: 4px 10px;
  border: var(--salt-size-border, 1px) solid var(--salt-container-primary-borderColor, #2b303b);
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.adl-btn:hover { border-color: var(--salt-accent-borderColor, #2d7ff9); }
.adl-btn[data-variant='primary'],
.adl-btn[data-active='true'],
.adl-btn[aria-pressed='true'] {
  background: var(--salt-accent-background, #2d7ff9);
  border-color: var(--salt-accent-background, #2d7ff9);
  color: var(--salt-content-primary-foreground-inverse, #fff);
}
.adl-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.adl-input {
  width: 100%;
  padding: 5px 8px;
  border: var(--salt-size-border, 1px) solid var(--salt-container-primary-borderColor, #2b303b);
  background: var(--salt-container-secondary-background, #14161c);
  color: inherit;
  font: inherit;
}
.adl-textarea { resize: vertical; min-height: 64px; }
.adl-general-composer { top: auto; bottom: 64px; left: 50%; transform: translateX(-50%); }
.adl-thread-title { font-weight: 600; margin: 8px 0 4px; }
.adl-disclosure { margin-top: 6px; }
.adl-disclosure > summary {
  cursor: pointer;
  list-style: none;
  font-size: 11px;
  color: var(--salt-content-secondary-foreground, #9aa3b5);
}
.adl-disclosure > summary::-webkit-details-marker { display: none; }
.adl-disclosure > summary::before { content: '▸ '; }
.adl-disclosure[open] > summary::before { content: '▾ '; }
.adl-disclosure > :not(summary) { margin-top: 6px; }
.adl-send-list { margin: 0; padding-left: 18px; }
.adl-send-list li { margin-bottom: 8px; }
.adl-send-list .adl-thread-title { margin: 0 0 2px; }
.adl-include {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--salt-content-secondary-foreground, #9aa3b5);
  cursor: pointer;
}
.adl-include input { margin: 0; accent-color: var(--salt-accent-background, #2d7ff9); }
.adl-digest {
  margin: 0;
  padding: var(--salt-spacing-100, 8px);
  max-height: 44vh;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font: 11px/1.5 var(--salt-text-code-fontFamily, ui-monospace, SFMono-Regular, Menlo, monospace);
  color: inherit;
  background: var(--salt-container-secondary-background, #14161c);
  border: var(--salt-size-border, 1px) solid var(--salt-container-primary-borderColor, #2b303b);
}
.adl-tab {
  flex: 1;
  padding: 6px 4px;
  border: var(--salt-size-border, 1px) solid transparent;
  border-bottom-width: 2px;
  background: transparent;
  color: var(--salt-content-secondary-foreground, #9aa3b5);
  font: inherit;
  cursor: pointer;
}
.adl-tab[aria-selected='true'] {
  color: var(--salt-content-primary-foreground, #e8eaf0);
  border-bottom-color: var(--salt-accent-borderColor, #2d7ff9);
}
.adl-card {
  border: var(--salt-size-border, 1px) solid var(--salt-container-primary-borderColor, #2b303b);
  background: var(--salt-container-primary-background, #1c1f27);
}
.adl-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  border: var(--salt-size-border, 1px) solid var(--salt-container-primary-borderColor, #2b303b);
  font-size: 11px;
  color: var(--salt-content-secondary-foreground, #9aa3b5);
  white-space: nowrap;
}
.adl-chip[data-status='resolved'] { color: var(--salt-status-success-foreground, #3fb27f); border-color: currentColor; }
.adl-chip[data-status='degraded'] { color: var(--salt-status-warning-foreground, #e0a33e); border-color: currentColor; }
.adl-chip[data-status='orphaned'] { color: var(--salt-status-error-foreground, #e4685d); border-color: currentColor; }
.adl-list { list-style: none; margin: 0; padding: 0; }
.adl-row { display: flex; align-items: center; gap: var(--salt-spacing-100, 8px); flex-wrap: wrap; }
.adl-row-between { display: flex; align-items: center; justify-content: space-between; gap: var(--salt-spacing-100, 8px); }
.adl-stale {
  border-left: 2px solid var(--salt-status-warning-borderColor, #e0a33e);
  padding-left: var(--salt-spacing-100, 8px);
  margin-top: var(--salt-spacing-75, 6px);
}
.adl-metric { display: flex; flex-direction: column; }
.adl-metric-label { font-size: 11px; color: var(--salt-content-secondary-foreground, #9aa3b5); text-transform: uppercase; letter-spacing: 0.04em; }
.adl-tabs { display: flex; gap: var(--salt-spacing-50, 4px); padding: var(--salt-spacing-100, 8px) var(--salt-spacing-100, 8px) 0; }
`

/** Injected once per document, next to the CSS Salt injects for its own components. */
export function injectFeedbackStyles(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = feedbackStyles
  doc.head.append(style)
}

export function useFeedbackStyles(): void {
  useEffect(() => {
    if (typeof document !== 'undefined') injectFeedbackStyles(document)
  }, [])
}
