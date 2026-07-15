import type {
  SpindleFrontendContext,
  SpindleModalHandle,
  SpindleNumericInputHandle,
  SpindleSelectHandle,
  SpindleTextAreaHandle,
} from 'lumiverse-spindle-types'
import {
  DEFAULT_FEED_FONT_SCALE,
  MAX_FEED_FONT_SCALE,
  MIN_FEED_FONT_SCALE,
  type BackendToFrontendMessage,
  type ChatMessageSummary,
  type ConnectionSummary,
  type FeedRound,
  type FrontendToBackendMessage,
  type RoundSummary,
  type ThreadverseComment,
  type ThreadverseSettingsPayload,
  type ThreadverseTab,
} from './shared'
import { toggleRangeEndpoint } from './range-selection'
import { shouldAcceptActiveChatResponse } from './chat-response'
import { serializeFeedAsPlainText } from './feed'
import { resolveFeedSwipe } from './feed-swipe'

const ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 8h10M7 12h7M7 16h4" />
    <path d="M5 3h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9l-5 3v-3a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3Z" />
  </svg>
`

const STYLES = `
  .threadverse-shell {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    color: var(--lumiverse-text);
    padding: 12px;
    gap: 12px;
  }

  .threadverse-tabs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    padding: 4px;
    border: 1px solid var(--lumiverse-border);
    border-radius: var(--lumiverse-radius);
    background: var(--lumiverse-fill);
  }

  .threadverse-tab {
    border: 0;
    border-radius: calc(var(--lumiverse-radius) - 2px);
    padding: 8px 10px;
    background: transparent;
    color: var(--lumiverse-text-muted);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
  }

  .threadverse-tab:hover { color: var(--lumiverse-text); }

  .threadverse-tab.is-active {
    color: var(--lumiverse-primary-text, var(--lumiverse-text));
    background: var(--lumiverse-primary-020, rgba(147, 112, 219, .2));
    box-shadow: inset 0 0 0 1px var(--lumiverse-primary-050, rgba(147, 112, 219, .5));
  }

  .threadverse-panel[hidden] { display: none; }

  .threadverse-card {
    border: 1px solid var(--lumiverse-border);
    border-radius: var(--lumiverse-radius);
    background: var(--lumiverse-fill);
    padding: 12px;
  }

  .threadverse-eyebrow {
    margin: 0 0 5px;
    color: var(--lumiverse-text);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .04em;
    text-transform: uppercase;
  }

  .threadverse-copy {
    margin: 0;
    color: var(--lumiverse-text-muted);
    font-size: 11px;
    line-height: 1.45;
  }

  .threadverse-context {
    display: grid;
    gap: 8px;
    margin: 10px 0;
    padding: 10px;
    border: 1px solid var(--lumiverse-border);
    border-radius: var(--lumiverse-radius);
    background: var(--lumiverse-fill-subtle);
  }

  .threadverse-context-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .threadverse-chat-name {
    overflow: hidden;
    color: var(--lumiverse-text);
    font-size: 11px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .threadverse-context-row {
    display: grid;
    grid-template-columns: 112px minmax(0, 1fr);
    gap: 8px;
    align-items: start;
  }

  .threadverse-context-label {
    color: var(--lumiverse-text-muted);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: .04em;
    text-transform: uppercase;
  }

  .threadverse-context-value {
    color: var(--lumiverse-text);
    font-size: 10px;
    line-height: 1.4;
  }

  .threadverse-context-value.is-recent { color: var(--lumiverse-success, #22c55e); }

  .threadverse-generation-progress {
    display: grid;
    grid-template-columns: 112px minmax(0, 1fr);
    gap: 8px;
    color: var(--lumiverse-primary, var(--lumiverse-accent));
    font-size: 9px;
    font-variant-numeric: tabular-nums;
    line-height: 1.4;
  }

  .threadverse-generation-progress[hidden] { display: none; }

  .threadverse-context-error {
    color: var(--lumiverse-danger, #ef4444);
    font-size: 10px;
    line-height: 1.35;
  }

  .threadverse-context-error[hidden] { display: none; }

  .threadverse-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    margin: 10px 0;
  }

  .threadverse-search,
  .threadverse-button {
    min-width: 0;
    border: 1px solid var(--lumiverse-border);
    border-radius: var(--lumiverse-radius);
    background: var(--lumiverse-fill-subtle);
    color: var(--lumiverse-text);
    font: inherit;
    font-size: 11px;
  }

  .threadverse-search { padding: 8px 10px; }
  .threadverse-button { padding: 8px 11px; cursor: pointer; }
  .threadverse-button:hover { border-color: var(--lumiverse-accent); }
  .threadverse-button:disabled { cursor: not-allowed; opacity: .5; }

  .threadverse-icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--lumiverse-btn-icon-sm, 32px);
    padding: 7px;
  }

  .threadverse-button--compact { padding: 5px 8px; font-size: 9px; }

  .threadverse-filter-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--lumiverse-text-muted);
    cursor: pointer;
    font-size: 9px;
    white-space: nowrap;
  }

  .threadverse-filter-toggle input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .threadverse-switch-track {
    position: relative;
    width: 28px;
    height: 16px;
    border: 1px solid var(--lumiverse-border);
    border-radius: 999px;
    background: var(--lumiverse-fill-subtle);
    transition: background .15s ease, border-color .15s ease;
  }

  .threadverse-switch-track::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--lumiverse-text-muted);
    transition: transform .15s ease, background .15s ease;
  }

  .threadverse-filter-toggle input:checked + .threadverse-switch-track {
    border-color: var(--lumiverse-success, #22c55e);
    background: var(--lumiverse-success-020, rgba(34, 197, 94, .2));
  }

  .threadverse-filter-toggle input:checked + .threadverse-switch-track::after {
    transform: translateX(12px);
    background: var(--lumiverse-success, #22c55e);
  }

  .threadverse-filter-toggle input:focus-visible + .threadverse-switch-track {
    outline: 2px solid var(--lumiverse-accent);
    outline-offset: 2px;
  }

  .threadverse-button--primary,
  .threadverse-button--primary:hover {
    border-color: var(--lumiverse-primary, var(--lumiverse-accent));
    background: transparent;
    color: var(--lumiverse-primary, var(--lumiverse-accent));
  }

  .threadverse-button--danger,
  .threadverse-button--danger:hover {
    border-color: var(--lumiverse-danger, #ef4444);
    background: transparent;
    color: var(--lumiverse-danger, #ef4444);
  }

  .threadverse-button--warning,
  .threadverse-button--warning:hover {
    border-color: var(--lumiverse-warning, #f59e0b);
    background: transparent;
    color: var(--lumiverse-warning, #f59e0b);
  }

  .threadverse-generating-label {
    display: inline-flex;
    align-items: baseline;
    color: var(--lumiverse-primary, var(--lumiverse-accent));
  }

  .threadverse-button.is-generating:disabled { opacity: 1; }

  .threadverse-wave-dots {
    display: inline-flex;
    align-items: baseline;
    justify-content: flex-start;
    min-width: 1.35em;
    width: 1.35em;
    margin-left: .08em;
    line-height: 1;
    vertical-align: baseline;
    white-space: nowrap;
  }

  .threadverse-wave-dot {
    display: inline-block;
    opacity: .45;
    transform: translateY(0);
  }

  .threadverse-generation-token-status {
    display: inline-flex;
    align-items: baseline;
  }

  .threadverse-generation-status-row {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .threadverse-message-list {
    display: flex;
    flex-direction: column;
    max-height: 52vh;
    overflow-y: auto;
    border: 1px solid var(--lumiverse-border);
    border-radius: var(--lumiverse-radius);
  }

  .threadverse-message {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr);
    gap: 1px;
    align-items: start;
    width: 100%;
    border: 0;
    border-bottom: 1px solid var(--lumiverse-border);
    padding: 8px;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
    font: inherit;
  }

  .threadverse-message:last-child { border-bottom: 0; }
  .threadverse-message:hover { background: var(--lumiverse-fill-subtle); }
  .threadverse-message.is-selected { background: var(--lumiverse-success-015, rgba(34, 197, 94, .15)); }
  .threadverse-message.is-endpoint { box-shadow: inset 3px 0 0 var(--lumiverse-success, #22c55e); }
  .threadverse-message.is-used {
    cursor: not-allowed;
    opacity: .38;
  }

  .threadverse-message.is-used:hover { background: transparent; }

  .threadverse-message-marker {
    display: block;
    margin-top: 3px;
    color: var(--lumiverse-success, #22c55e);
    font-size: 8px;
    font-weight: 800;
    letter-spacing: .04em;
  }

  .threadverse-message-index {
    color: var(--lumiverse-text-muted);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
  }

  .threadverse-message-content {
    overflow: hidden;
    color: var(--lumiverse-text);
    font-size: 11px;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .threadverse-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 10px;
  }

  .threadverse-empty {
    display: grid;
    place-items: center;
    min-height: 180px;
    padding: 24px;
    color: var(--lumiverse-text-muted);
    font-size: 12px;
    text-align: center;
  }

  .threadverse-feed-stack { display: grid; gap: 10px; }
  .threadverse-feed-toolbar { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; }
  .threadverse-feed-controls { grid-template-columns: minmax(0, 1fr) auto auto; }
  .threadverse-feed-round-select { min-width: 0; }
  .threadverse-version-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 30px;
  }
  .threadverse-version-count {
    min-width: 44px;
    color: var(--lumiverse-text-muted);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }
  .threadverse-feed-generation-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .threadverse-delete-choice { display: grid; gap: 16px; }
  .threadverse-delete-choice-message {
    margin: 0;
    color: var(--lumiverse-text);
    font-size: 12px;
    line-height: 1.5;
  }
  .threadverse-delete-choice-detail {
    margin: -8px 0 0;
    color: var(--lumiverse-text-muted);
    font-size: 10px;
  }
  .threadverse-delete-choice-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }
  .threadverse-reddit { overflow: hidden; padding: 0; }
  .threadverse-reddit-post { padding: 12px; border-bottom: 1px solid var(--lumiverse-border); }
  .threadverse-reddit-title { margin: 5px 0 9px; color: var(--lumiverse-text); font-size: calc(16px * var(--threadverse-feed-font-scale, 1)); line-height: 1.3; }
  .threadverse-reddit-body, .threadverse-comment-body {
    margin: 0; color: var(--lumiverse-text); font-size: calc(11px * var(--threadverse-feed-font-scale, 1)); line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere;
  }
  .threadverse-author-row { display: flex; align-items: center; gap: 7px; min-width: 0; }
  .threadverse-avatar {
    display: grid; place-items: center; flex: 0 0 auto; width: 24px; height: 24px;
    border-radius: 50%; background: hsl(var(--avatar-hue) 52% 38%); color: white;
    font-size: calc(9px * var(--threadverse-feed-font-scale, 1)); font-weight: 800; text-transform: uppercase;
  }
  .threadverse-author { overflow: hidden; color: var(--lumiverse-text); font-size: calc(10px * var(--threadverse-feed-font-scale, 1)); font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
  .threadverse-reddit-post .threadverse-reddit-body { margin-top: 10px; }
  .threadverse-reddit-actions { display: flex; align-items: center; gap: 8px; margin-top: 9px; color: var(--lumiverse-text-muted); }
  .threadverse-action-button {
    display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-width: 26px; min-height: 26px;
    padding: 3px 6px; border: 0; border-radius: 999px; background: transparent;
    color: var(--lumiverse-text-muted); cursor: default; font: inherit; font-size: calc(9px * var(--threadverse-feed-font-scale, 1));
  }
  .threadverse-action-icon { display: block; width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .threadverse-vote-group {
    display: inline-flex; align-items: center; overflow: hidden; border: 1px solid var(--lumiverse-border);
    border-radius: 999px; background: var(--lumiverse-fill-subtle);
  }
  .threadverse-vote-group .threadverse-action-button { border-radius: 0; padding: 3px 7px; }
  .threadverse-score { color: var(--lumiverse-text); font-size: calc(9px * var(--threadverse-feed-font-scale, 1)); font-weight: 700; }
  .threadverse-comments { padding: 0; }
  .threadverse-comment {
    position: relative; padding: 10px 0 0 12px; border-left: 2px solid var(--lumiverse-border);
  }
  .threadverse-comment--root {
    padding: 12px; border-left: 0; border-bottom: 6px solid var(--lumiverse-bg, #0f0d15);
  }
  .threadverse-comment--root:last-child { border-bottom: 0; }
  .threadverse-comment-content { min-width: 0; }
  .threadverse-comment-body { margin-top: 6px; }
  .threadverse-comment-replies { margin-left: 5px; }
  @media (max-width: 420px) {
    .threadverse-feed-toolbar { grid-template-columns: minmax(0, 1fr); }
    .threadverse-feed-toolbar .threadverse-button { width: 100%; }
    .threadverse-feed-controls { grid-template-columns: auto minmax(0, 1fr); }
    .threadverse-feed-controls .threadverse-feed-round-select { grid-column: 1 / -1; }
    .threadverse-feed-controls .threadverse-icon-button { width: var(--lumiverse-btn-icon-sm, 32px); }
    .threadverse-delete-choice-actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .threadverse-comment--root { padding: 11px 9px; }
    .threadverse-comment { padding-left: 8px; }
    .threadverse-comment--root { padding-left: 9px; }
    .threadverse-comment-replies { margin-left: 2px; }
    .threadverse-action-label { display: none; }
  }

  .threadverse-settings-stack {
    display: grid;
    gap: 10px;
  }

  .threadverse-settings-section {
    display: grid;
    gap: 10px;
  }

  .threadverse-settings-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .threadverse-settings-field {
    display: grid;
    gap: 5px;
    min-width: 0;
  }

  .threadverse-settings-field--wide { grid-column: 1 / -1; }

  .threadverse-secondary-input {
    background: var(--lumiverse-secondary, rgba(128, 128, 128, .15));
    border-radius: var(--lumiverse-radius, 8px);
  }

  .threadverse-settings-label {
    color: var(--lumiverse-text);
    font-size: 10px;
    font-weight: 700;
  }

  .threadverse-settings-hint {
    margin: 0;
    color: var(--lumiverse-text-muted);
    font-size: 9px;
    line-height: 1.35;
  }

  .threadverse-switch-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 30px;
  }

  .threadverse-settings-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .threadverse-preset-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 6px;
    align-items: center;
  }

  .threadverse-expandable-textarea {
    position: relative;
    width: 100%;
  }

  .threadverse-instructions-input { padding-right: 38px; }

  .threadverse-inline-expand {
    position: absolute;
    top: 5px;
    right: 5px;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--lumiverse-btn-icon-sm, 28px);
    height: var(--lumiverse-btn-icon-sm, 28px);
    padding: 0;
    border: 1px solid var(--lumiverse-border);
    border-radius: var(--lumiverse-radius-sm, 5px);
    background: var(--lumiverse-bg, #0f0d15);
    color: var(--lumiverse-text-dim);
    cursor: pointer;
    opacity: 0;
    transition: all .15s ease;
  }

  .threadverse-expandable-textarea:hover .threadverse-inline-expand,
  .threadverse-expandable-textarea:focus-within .threadverse-inline-expand {
    opacity: 1;
  }

  .threadverse-inline-expand:hover {
    color: var(--lumiverse-primary);
    border-color: var(--lumiverse-primary);
  }

  @media (any-hover: none) {
    .threadverse-inline-expand { opacity: .7; }
  }
`

export function setup(ctx: SpindleFrontendContext) {
  const removeStyle = ctx.dom.addStyle(STYLES)
  const drawer = ctx.ui.registerDrawerTab({
    id: 'threadverse',
    title: 'Threadverse',
    shortName: 'Threads',
    headerTitle: 'Threadverse',
    description: 'Turn roleplay scenes into a fictional fandom feed',
    keywords: ['fandom', 'thread', 'reddit', 'roleplay', 'feed'],
    iconSvg: ICON,
  })

  const shell = ctx.dom.createElement('div', { class: 'threadverse-shell' })
  shell.innerHTML = `
    <nav class="threadverse-tabs" aria-label="Threadverse sections">
      <button class="threadverse-tab" type="button" data-tab="feed">Feed</button>
      <button class="threadverse-tab is-active" type="button" data-tab="make">Make</button>
      <button class="threadverse-tab" type="button" data-tab="settings">Settings</button>
    </nav>

    <section class="threadverse-panel" data-panel="feed" hidden>
      <div class="threadverse-feed-stack" data-feed-list>
        <div class="threadverse-card threadverse-empty">Generated fandom threads will appear here without being added to your roleplay chat.</div>
      </div>
    </section>

    <section class="threadverse-panel" data-panel="make">
      <div class="threadverse-card">
        <h2 class="threadverse-eyebrow">Select a scene</h2>
        <p class="threadverse-copy">Choose the first and last messages of the range you want the fandom to discuss.</p>
        <div class="threadverse-context">
          <div class="threadverse-context-header">
            <span class="threadverse-chat-name" data-chat-name>No active chat</span>
            <button class="threadverse-button threadverse-button--compact" type="button" data-action="reset" disabled>Reset continuity</button>
          </div>
          <div class="threadverse-context-row">
            <span class="threadverse-context-label">Previous context</span>
            <span class="threadverse-context-value" data-previous-context>None yet</span>
          </div>
          <div class="threadverse-context-row">
            <span class="threadverse-context-label">Recent context</span>
            <span class="threadverse-context-value is-recent" data-recent-context>Select a range below</span>
          </div>
          <div class="threadverse-generation-progress" data-generation-progress role="status" aria-live="polite" hidden>
            <span aria-hidden="true"></span>
            <span class="threadverse-generation-status-row">
              <span class="threadverse-generation-token-status">
                <span data-generation-token-count>0 output tokens received</span>
                <span data-generation-token-dots></span>
              </span>
              <button class="threadverse-button threadverse-button--compact" type="button" data-action="cancel-generation" hidden>Cancel</button>
            </span>
          </div>
          <div class="threadverse-context-error" data-context-error hidden></div>
        </div>
        <div class="threadverse-toolbar">
          <input class="threadverse-search" type="search" placeholder="Search messages..." aria-label="Search messages" />
          <label class="threadverse-filter-toggle">
            <input type="checkbox" data-unused-only checked />
            <span class="threadverse-switch-track" aria-hidden="true"></span>
            <span>Unused only</span>
          </label>
        </div>
        <div class="threadverse-message-list">
          <div class="threadverse-empty" data-message-state>Loading the active chat...</div>
        </div>
        <div class="threadverse-actions">
          <button class="threadverse-button" type="button" data-action="clear">Clear</button>
          <button class="threadverse-button threadverse-button--primary" type="button" data-action="save" disabled>Generate Thread</button>
        </div>
      </div>
    </section>

    <section class="threadverse-panel" data-panel="settings" hidden>
      <div class="threadverse-settings-stack">
        <section class="threadverse-card threadverse-settings-section">
          <h3 class="threadverse-eyebrow">Connection</h3>
          <div class="threadverse-settings-field">
            <div data-setting="connection"></div>
          </div>
        </section>

        <section class="threadverse-card threadverse-settings-section">
          <h3 class="threadverse-eyebrow">Samplers</h3>
          <div class="threadverse-settings-grid">
            <label class="threadverse-settings-field threadverse-settings-field--wide">
              <span class="threadverse-settings-label">Max output tokens</span>
              <div data-setting="max-output-tokens"></div>
            </label>
            <label class="threadverse-settings-field">
              <span class="threadverse-settings-label">Temperature</span>
              <div data-setting="temperature"></div>
            </label>
            <label class="threadverse-settings-field">
              <span class="threadverse-settings-label">Top P</span>
              <div data-setting="top-p"></div>
            </label>
          </div>
          <p class="threadverse-settings-hint">Leave a field empty to use its displayed default.</p>
        </section>

        <section class="threadverse-card threadverse-settings-section">
          <h3 class="threadverse-eyebrow">Continuity</h3>
          <div class="threadverse-settings-grid">
            <label class="threadverse-settings-field">
              <span class="threadverse-settings-label">Previous story ranges</span>
              <div data-setting="previous-ranges"></div>
            </label>
            <label class="threadverse-settings-field">
              <span class="threadverse-settings-label">Previous fandom threads</span>
              <div data-setting="fandom-threads"></div>
            </label>
            <div class="threadverse-settings-field threadverse-settings-field--wide threadverse-switch-field">
              <span class="threadverse-settings-label">Maintain fandom continuity</span>
              <label class="threadverse-filter-toggle">
                <input type="checkbox" data-maintain-fandom />
                <span class="threadverse-switch-track" aria-hidden="true"></span>
              </label>
            </div>
          </div>
        </section>

        <section class="threadverse-card threadverse-settings-section">
          <h3 class="threadverse-eyebrow">Feed</h3>
          <div data-setting="feed-font-scale"></div>
        </section>

        <section class="threadverse-card threadverse-settings-section">
          <h3 class="threadverse-eyebrow">Instructions</h3>
          <div class="threadverse-preset-row">
            <div data-setting="instruction-preset"></div>
            <button class="threadverse-button threadverse-button--compact" type="button" data-action="new-instruction-preset">New</button>
            <button class="threadverse-button threadverse-button--compact threadverse-button--danger" type="button" data-action="delete-instruction-preset">Delete</button>
          </div>
          <div class="threadverse-settings-field">
            <div class="threadverse-expandable-textarea">
              <div data-setting="instructions"></div>
              <button class="threadverse-inline-expand" type="button" data-action="expand-instructions" title="Expand editor" aria-label="Expand editor">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <polyline points="9 21 3 21 3 15"></polyline>
                  <line x1="21" y1="3" x2="14" y2="10"></line>
                  <line x1="3" y1="21" x2="10" y2="14"></line>
                </svg>
              </button>
            </div>
          </div>
          <div class="threadverse-settings-actions">
            <button class="threadverse-button threadverse-button--primary" type="button" data-action="save-prompt">Save Prompt</button>
          </div>
        </section>
      </div>
    </section>
  `
  drawer.root.appendChild(shell)

  const tabs = Array.from(shell.querySelectorAll<HTMLButtonElement>('[data-tab]'))
  const panels = Array.from(shell.querySelectorAll<HTMLElement>('[data-panel]'))
  const messageList = shell.querySelector<HTMLElement>('.threadverse-message-list')!
  const search = shell.querySelector<HTMLInputElement>('.threadverse-search')!
  const unusedOnly = shell.querySelector<HTMLInputElement>('[data-unused-only]')!
  const saveButton = shell.querySelector<HTMLButtonElement>('[data-action="save"]')!
  const cancelButton = shell.querySelector<HTMLButtonElement>('[data-action="cancel-generation"]')!
  const feedList = shell.querySelector<HTMLElement>('[data-feed-list]')!
  const resetButton = shell.querySelector<HTMLButtonElement>('[data-action="reset"]')!
  const chatName = shell.querySelector<HTMLElement>('[data-chat-name]')!
  const previousContext = shell.querySelector<HTMLElement>('[data-previous-context]')!
  const recentContext = shell.querySelector<HTMLElement>('[data-recent-context]')!
  const generationProgress = shell.querySelector<HTMLElement>('[data-generation-progress]')!
  const generationTokenCount = shell.querySelector<HTMLElement>('[data-generation-token-count]')!
  const generationTokenDots = shell.querySelector<HTMLElement>('[data-generation-token-dots]')!
  const contextError = shell.querySelector<HTMLElement>('[data-context-error]')!
  const savePromptButton = shell.querySelector<HTMLButtonElement>('[data-action="save-prompt"]')!
  const deleteInstructionPresetButton = shell.querySelector<HTMLButtonElement>('[data-action="delete-instruction-preset"]')!
  const maintainFandomToggle = shell.querySelector<HTMLInputElement>('[data-maintain-fandom]')!

  let activeTab: ThreadverseTab = 'make'
  let activeChat: { id: string; name: string } | null = null
  let messages: ChatMessageSummary[] = []
  let rounds: RoundSummary[] = []
  let feeds: FeedRound[] = []
  let selectedFeedRoundId: string | null = null
  let feedRoundHandle: SpindleSelectHandle | null = null
  let deleteChoiceModal: SpindleModalHandle | null = null
  let startIndex: number | null = null
  let endIndex: number | null = null
  let operationPending = false
  let generationPending = false
  let generationCancellable = false
  let generationOperation: 'generate' | 'regenerate' | null = null
  let generationChatId: string | null = null
  let generationRoundId: string | null = null
  let generationOutputTokens = 0
  let promptSavePending = false
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
  let chatRefreshTimer: ReturnType<typeof setTimeout> | null = null
  let generationStartTimer: ReturnType<typeof setTimeout> | null = null
  let latestChatRequestId = 0
  let settingsDraft: ThreadverseSettingsPayload | null = null
  let settingsConnections: ConnectionSummary[] = []
  let defaultInstructions = ''
  let fandomThreadsHandle: SpindleNumericInputHandle | null = null
  let instructionPresetHandle: SpindleSelectHandle | null = null
  let instructionsHandle: SpindleTextAreaHandle | null = null
  let settingsComponents: Array<{ destroy(): void }> = []
  const waveAnimations = new WeakMap<HTMLElement, Animation[]>()

  const send = (payload: FrontendToBackendMessage) => ctx.sendToBackend(payload)

  function clearError(): void {
    contextError.textContent = ''
    contextError.hidden = true
  }

  function createWaveDots(): HTMLElement {
    const dots = document.createElement('span')
    dots.className = 'threadverse-wave-dots'
    dots.setAttribute('aria-hidden', 'true')
    const animations: Animation[] = []
    for (let index = 0; index < 3; index += 1) {
      const dot = document.createElement('span')
      dot.className = 'threadverse-wave-dot'
      dot.textContent = '.'
      animations.push(dot.animate([
        { transform: 'translateY(0)', opacity: .45, offset: 0 },
        { transform: 'translateY(-.34em)', opacity: 1, offset: .3 },
        { transform: 'translateY(0)', opacity: .45, offset: .6 },
        { transform: 'translateY(0)', opacity: .45, offset: 1 },
      ], {
        duration: 900,
        delay: index * 120,
        easing: 'ease-in-out',
        iterations: Infinity,
      }))
      dots.appendChild(dot)
    }
    waveAnimations.set(dots, animations)
    return dots
  }

  function cancelWaveDots(root: ParentNode): void {
    for (const dots of root.querySelectorAll<HTMLElement>('.threadverse-wave-dots')) {
      for (const animation of waveAnimations.get(dots) ?? []) animation.cancel()
      waveAnimations.delete(dots)
    }
  }

  function setAnimatedButtonLabel(button: HTMLButtonElement, label: string): void {
    button.classList.add('is-generating')
    const animated = document.createElement('span')
    animated.className = 'threadverse-generating-label'
    animated.append(document.createTextNode(label))
    const dots = createWaveDots()
    animated.appendChild(dots)
    cancelWaveDots(button)
    button.replaceChildren(animated)
    button.setAttribute('aria-label', `${label}...`)
  }

  function generationTokenText(): string {
    return generationOutputTokens === 0
      ? '0 output tokens received'
      : `~${generationOutputTokens} output token${generationOutputTokens === 1 ? '' : 's'} received`
  }

  function updateGenerationTokenText(target: HTMLElement): void {
    target.textContent = generationTokenText()
  }

  function renderFeedGenerationProgress(): void {
    const tokenCount = feedList.querySelector<HTMLElement>('[data-feed-generation-token-count]')
    if (tokenCount) updateGenerationTokenText(tokenCount)
  }

  function renderGenerationProgress(): void {
    const visible = generationPending
      && generationOperation === 'generate'
      && activeChat?.id === generationChatId
    generationProgress.hidden = !visible
    if (visible) {
      if (!generationTokenDots.firstChild) generationTokenDots.appendChild(createWaveDots())
      updateGenerationTokenText(generationTokenCount)
    } else {
      cancelWaveDots(generationTokenDots)
      generationTokenDots.replaceChildren()
    }
  }

  function setGenerationPending(
    pending: boolean,
    cancellable = false,
    details?: {
      operation?: 'generate' | 'regenerate'
      chatId?: string
      roundId?: string
      outputTokens?: number
    },
  ): void {
    generationPending = pending
    generationCancellable = pending && cancellable
    if (pending) {
      generationOperation = details?.operation ?? generationOperation
      generationChatId = details?.chatId ?? generationChatId
      generationRoundId = details?.roundId ?? generationRoundId
      generationOutputTokens = details?.outputTokens ?? generationOutputTokens
    } else {
      generationOperation = null
      generationChatId = null
      generationRoundId = null
      generationOutputTokens = 0
    }
    cancelButton.hidden = !generationCancellable
    if (pending && generationOperation === 'generate') {
      setAnimatedButtonLabel(saveButton, 'Generating')
    } else {
      cancelWaveDots(saveButton)
      saveButton.classList.remove('is-generating')
      saveButton.textContent = 'Generate Thread'
      saveButton.removeAttribute('aria-label')
    }
    renderGenerationProgress()
  }

  function clearGenerationStartTimer(): void {
    if (!generationStartTimer) return
    clearTimeout(generationStartTimer)
    generationStartTimer = null
  }

  function armGenerationStartTimer(): void {
    clearGenerationStartTimer()
    generationStartTimer = setTimeout(() => {
      generationStartTimer = null
      if (!generationPending) return
      send({ type: 'threadverse:cancel_generation' })
      setGenerationPending(false)
      showError('Threadverse could not start the generation. Please try again.')
      renderContinuity()
      renderFeed()
    }, 15_000)
  }

  function cancelGeneration(): void {
    if (!generationPending) return
    clearGenerationStartTimer()
    send({ type: 'threadverse:cancel_generation' })
    setGenerationPending(false)
    renderContinuity()
    renderFeed()
  }

  function showError(message: string): void {
    contextError.textContent = message
    contextError.hidden = false
  }

  function settingTarget(name: string): HTMLElement {
    return shell.querySelector<HTMLElement>(`[data-setting="${name}"]`)!
  }

  function destroySettingsComponents(): void {
    for (const component of settingsComponents) component.destroy()
    settingsComponents = []
    fandomThreadsHandle = null
    instructionPresetHandle = null
    instructionsHandle = null
  }

  function getActiveInstructionPreset() {
    return settingsDraft?.instructionPresets.find(
      (preset) => preset.id === settingsDraft?.activeInstructionPresetId,
    ) ?? null
  }

  function applyFeedFontScale(value: number): void {
    feedList.style.setProperty('--threadverse-feed-font-scale', String(value / 100))
  }

  function mountSettingsForm(
    settings: ThreadverseSettingsPayload,
    connections: ConnectionSummary[],
  ): void {
    destroySettingsComponents()
    settingsDraft = {
      ...settings,
      instructionPresets: settings.instructionPresets.map((preset) => ({ ...preset })),
    }
    settingsConnections = connections
    const connectionHandle = ctx.components.mountSelect(settingTarget('connection'), {
      value: settingsDraft.connectionId ?? '',
      placeholder: connections.length === 0 ? 'No connections available' : 'Choose a connection',
      searchPlaceholder: 'Search connections...',
      emptyMessage: 'No Lumiverse LLM connections are available.',
      disabled: connections.length === 0,
      triggerClassName: 'threadverse-secondary-input',
      options: connections.map((connection) => ({
        value: connection.id,
        label: connection.name,
        sublabel: `${connection.provider} · ${connection.model || 'No default model'}`,
      })),
      onChange: (connectionId) => {
        if (!settingsDraft) return
        const connection = connections.find((candidate) => candidate.id === connectionId)
        settingsDraft.connectionId = connection?.id ?? null
        scheduleAutomaticSave()
      },
    })

    const maxTokensHandle = ctx.components.mountNumericInput(settingTarget('max-output-tokens'), {
      value: settingsDraft.maxOutputTokens,
      allowEmpty: true,
      placeholder: '4096',
      min: 1,
      max: 200000,
      step: 1,
      integer: true,
      className: 'threadverse-secondary-input',
      onChange: (value) => {
        if (settingsDraft) {
          settingsDraft.maxOutputTokens = value
          scheduleAutomaticSave()
        }
      },
    })

    const temperatureHandle = ctx.components.mountNumericInput(settingTarget('temperature'), {
      value: settingsDraft.temperature,
      allowEmpty: true,
      placeholder: '1',
      min: 0,
      max: 5,
      step: 0.05,
      className: 'threadverse-secondary-input',
      onChange: (value) => {
        if (settingsDraft) {
          settingsDraft.temperature = value
          scheduleAutomaticSave()
        }
      },
    })

    const topPHandle = ctx.components.mountNumericInput(settingTarget('top-p'), {
      value: settingsDraft.topP,
      allowEmpty: true,
      placeholder: '1',
      min: 0,
      max: 1,
      step: 0.05,
      className: 'threadverse-secondary-input',
      onChange: (value) => {
        if (settingsDraft) {
          settingsDraft.topP = value
          scheduleAutomaticSave()
        }
      },
    })

    const previousRangesHandle = ctx.components.mountNumericInput(settingTarget('previous-ranges'), {
      value: settingsDraft.previousRangeLimit,
      allowEmpty: true,
      placeholder: '3',
      min: 0,
      max: 50,
      step: 1,
      integer: true,
      className: 'threadverse-secondary-input',
      onChange: (value) => {
        if (settingsDraft) {
          settingsDraft.previousRangeLimit = value
          scheduleAutomaticSave()
        }
      },
    })

    fandomThreadsHandle = ctx.components.mountNumericInput(settingTarget('fandom-threads'), {
      value: settingsDraft.fandomThreadLimit,
      allowEmpty: true,
      placeholder: '3',
      min: 0,
      max: 50,
      step: 1,
      integer: true,
      className: 'threadverse-secondary-input',
      disabled: !settingsDraft.maintainFandomContinuity,
      onChange: (value) => {
        if (settingsDraft) {
          settingsDraft.fandomThreadLimit = value
          scheduleAutomaticSave()
        }
      },
    })

    maintainFandomToggle.checked = settingsDraft.maintainFandomContinuity

    applyFeedFontScale(settingsDraft.feedFontScale)
    const feedFontScaleHandle = ctx.components.mountRangeSlider(settingTarget('feed-font-scale'), {
      label: 'Text size',
      min: MIN_FEED_FONT_SCALE,
      max: MAX_FEED_FONT_SCALE,
      value: settingsDraft.feedFontScale,
      step: 5,
      integer: true,
      format: { suffix: '%' },
      onDragValue: (value) => {
        applyFeedFontScale(value ?? settingsDraft?.feedFontScale ?? DEFAULT_FEED_FONT_SCALE)
      },
      onCommit: (value) => {
        if (!settingsDraft) return
        settingsDraft.feedFontScale = value
        applyFeedFontScale(value)
        scheduleAutomaticSave()
      },
    })

    const activePreset = getActiveInstructionPreset() ?? settingsDraft.instructionPresets[0]
    settingsDraft.activeInstructionPresetId = activePreset.id
    instructionPresetHandle = ctx.components.mountSelect(settingTarget('instruction-preset'), {
      value: activePreset.id,
      options: settingsDraft.instructionPresets.map((preset) => ({
        value: preset.id,
        label: preset.name,
      })),
      searchThreshold: 6,
      searchPlaceholder: 'Search presets...',
      onChange: (presetId) => {
        if (!settingsDraft) return
        const preset = settingsDraft.instructionPresets.find((candidate) => candidate.id === presetId)
        if (!preset) return
        settingsDraft.activeInstructionPresetId = preset.id
        instructionsHandle?.update({ value: preset.instructions })
      },
      triggerClassName: 'threadverse-secondary-input',
    })

    instructionsHandle = ctx.components.mountTextArea(settingTarget('instructions'), {
      value: activePreset.instructions,
      rows: 14,
      ariaLabel: 'Permanent Threadverse instructions',
      className: 'threadverse-secondary-input threadverse-instructions-input',
      onChange: (instructions) => {
        const preset = getActiveInstructionPreset()
        if (preset) preset.instructions = instructions
      },
    })

    settingsComponents = [
      connectionHandle,
      maxTokensHandle,
      temperatureHandle,
      topPHandle,
      previousRangesHandle,
      fandomThreadsHandle,
      feedFontScaleHandle,
      instructionPresetHandle,
      instructionsHandle,
    ]
    savePromptButton.disabled = false
    deleteInstructionPresetButton.disabled = settingsDraft.instructionPresets.length <= 1
  }

  function flushAutomaticSave(): void {
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    autoSaveTimer = null
    if (!settingsDraft) return
    send({
      type: 'threadverse:auto_save_settings',
      settings: {
        connectionId: settingsDraft.connectionId,
        maxOutputTokens: settingsDraft.maxOutputTokens,
        temperature: settingsDraft.temperature,
        topP: settingsDraft.topP,
        previousRangeLimit: settingsDraft.previousRangeLimit,
        fandomThreadLimit: settingsDraft.fandomThreadLimit,
        maintainFandomContinuity: settingsDraft.maintainFandomContinuity,
        feedFontScale: settingsDraft.feedFontScale,
      },
    })
  }

  function scheduleAutomaticSave(): void {
    if (!settingsDraft) return
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    autoSaveTimer = setTimeout(flushAutomaticSave, 350)
  }

  function handleMaintainFandomChange(): void {
    if (!settingsDraft) return
    settingsDraft.maintainFandomContinuity = maintainFandomToggle.checked
    fandomThreadsHandle?.update({ disabled: !maintainFandomToggle.checked })
    scheduleAutomaticSave()
  }

  function savePrompt(): void {
    if (!settingsDraft || promptSavePending) return
    promptSavePending = true
    savePromptButton.disabled = true
    send({
      type: 'threadverse:save_prompt',
      settings: {
        instructionPresets: settingsDraft.instructionPresets.map((preset) => ({ ...preset })),
        activeInstructionPresetId: settingsDraft.activeInstructionPresetId,
      },
    })
  }

  function requestNewInstructionPreset(): void {
    if (!settingsDraft || operationPending) return
    send({
      type: 'threadverse:request_instruction_preset_name',
      existingNames: settingsDraft.instructionPresets.map((preset) => preset.name),
    })
  }

  async function deleteInstructionPreset(): Promise<void> {
    if (!settingsDraft || operationPending) return
    if (settingsDraft.instructionPresets.length <= 1) return
    const activePreset = getActiveInstructionPreset()
    if (!activePreset) return
    const result = await ctx.ui.showConfirm({
      title: 'Delete instruction preset',
      message: `Delete "${activePreset.name}"?`,
      variant: 'danger',
      confirmLabel: 'Delete',
    })
    if (!result.confirmed || !settingsDraft) return
    settingsDraft.instructionPresets = settingsDraft.instructionPresets.filter(
      (preset) => preset.id !== activePreset.id,
    )
    settingsDraft.activeInstructionPresetId = settingsDraft.instructionPresets[0].id
    mountSettingsForm(settingsDraft, settingsConnections)
  }

  function expandInstructions(): void {
    const preset = getActiveInstructionPreset()
    if (!preset || operationPending) return
    send({
      type: 'threadverse:open_instruction_editor',
      presetId: preset.id,
      value: preset.instructions,
    })
  }

  function switchTab(next: ThreadverseTab): void {
    activeTab = next
    for (const tab of tabs) tab.classList.toggle('is-active', tab.dataset.tab === activeTab)
    for (const panel of panels) panel.hidden = panel.dataset.panel !== activeTab
    if (next === 'settings' && !settingsDraft) {
      send({ type: 'threadverse:load_settings' })
    }
  }

  function selectedBounds(): [number, number] | null {
    if (startIndex === null || endIndex === null) return null
    return [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)]
  }

  function updateSummary(): void {
    const bounds = selectedBounds()
    if (!bounds) {
      if (startIndex === null && endIndex === null) {
        recentContext.textContent = 'Select a range below'
      } else if (startIndex !== null) {
        recentContext.textContent = `Start #${messages[startIndex]?.index} selected; choose the end`
      } else {
        recentContext.textContent = `End #${messages[endIndex!]?.index} selected; choose the start`
      }
      saveButton.disabled = true
      return
    }

    const count = bounds[1] - bounds[0] + 1
    const rangeLabel = `#${messages[bounds[0]]?.index}-#${messages[bounds[1]]?.index}`
    recentContext.textContent = `${rangeLabel} · ${count} message${count === 1 ? '' : 's'}`
    saveButton.disabled = operationPending || generationPending || !activeChat
  }

  function renderContinuity(): void {
    chatName.textContent = activeChat?.name ?? 'No active chat'
    previousContext.textContent = rounds.length === 0
      ? 'None yet'
      : rounds
        .map((round) => `Round ${round.sequence} (${round.startIndex}-${round.endIndex})`)
        .join(' - ')
    resetButton.disabled = operationPending || generationPending || !activeChat || rounds.length === 0
    updateSummary()
    renderGenerationProgress()
  }

  function avatarHue(username: string): number {
    let hash = 0
    for (const character of username) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0
    return Math.abs(hash) % 360
  }

  function avatarText(username: string): string {
    return username.replace(/^u\//i, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean)
      .slice(0, 2).map((part) => part[0]).join('').slice(0, 2) || '?'
  }

  function authorRow(username: string): HTMLElement {
    const row = document.createElement('div')
    row.className = 'threadverse-author-row'
    const avatar = document.createElement('span')
    avatar.className = 'threadverse-avatar'
    avatar.style.setProperty('--avatar-hue', String(avatarHue(username)))
    avatar.textContent = avatarText(username)
    const author = document.createElement('span')
    author.className = 'threadverse-author'
    author.textContent = username
    row.append(avatar, author)
    return row
  }

  type ActionIcon = 'upvote' | 'downvote' | 'comment' | 'reply' | 'share' | 'more' | 'copy' | 'chevron-left' | 'chevron-right'

  const ACTION_ICON_PATHS: Record<ActionIcon, string[]> = {
    upvote: ['M12 3 4.5 10.5h4.25V21h6.5V10.5h4.25L12 3Z'],
    downvote: ['M12 21 4.5 13.5h4.25V3h6.5v10.5h4.25L12 21Z'],
    comment: ['M20 15a4 4 0 0 1-4 4H8l-5 3v-7a4 4 0 0 1-1-2.65V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v7Z'],
    reply: ['M9 7 4 12l5 5v-3h4c3.5 0 5.5 1.2 7 4-.4-5-2.7-8-7-8H9V7Z'],
    share: ['M15 8l5-5m0 0h-5m5 0v5', 'M11 5H7a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h9a3 3 0 0 0 3-3v-4'],
    more: ['M12 6.5h.01', 'M12 12h.01', 'M12 17.5h.01'],
    copy: ['M8 8h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V8Z', 'M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3'],
    'chevron-left': ['m15 18-6-6 6-6'],
    'chevron-right': ['m9 18 6-6-6-6'],
  }

  function actionIcon(icon: ActionIcon): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('aria-hidden', 'true')
    svg.classList.add('threadverse-action-icon')
    for (const pathData of ACTION_ICON_PATHS[icon]) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', pathData)
      svg.appendChild(path)
    }
    return svg
  }

  function visualAction(icon: ActionIcon, label: string, visibleText?: string, hideTextOnMobile = true): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'threadverse-action-button'
    button.title = label
    button.setAttribute('aria-label', label)
    button.appendChild(actionIcon(icon))
    if (visibleText) {
      const text = document.createElement('span')
      text.className = hideTextOnMobile ? 'threadverse-action-label' : 'threadverse-score'
      text.textContent = visibleText
      button.appendChild(text)
    }
    return button
  }

  function redditActions(score: number, commentCount?: number): HTMLElement {
    const actions = document.createElement('div')
    actions.className = 'threadverse-reddit-actions'
    const votes = document.createElement('div')
    votes.className = 'threadverse-vote-group'
    const upvote = visualAction('upvote', 'Upvote')
    const scoreLabel = document.createElement('span')
    scoreLabel.className = 'threadverse-score'
    scoreLabel.textContent = String(score)
    const downvote = visualAction('downvote', 'Downvote')
    votes.append(upvote, scoreLabel, downvote)
    actions.appendChild(votes)
    if (commentCount !== undefined) {
      actions.appendChild(visualAction('comment', `${commentCount} comments`, String(commentCount), false))
    } else {
      actions.appendChild(visualAction('reply', 'Reply', 'Reply'))
    }
    actions.append(visualAction('share', 'Share', 'Share'), visualAction('more', 'More options'))
    return actions
  }

  function renderComment(comment: ThreadverseComment, depth: number): HTMLElement {
    const element = document.createElement('article')
    element.className = 'threadverse-comment'
    if (depth === 0) element.classList.add('threadverse-comment--root')
    const content = document.createElement('div')
    content.className = 'threadverse-comment-content'
    content.appendChild(authorRow(comment.username))
    const body = document.createElement('p')
    body.className = 'threadverse-comment-body'
    body.textContent = comment.body
    content.append(body, redditActions(comment.score))
    element.appendChild(content)
    if (comment.replies.length > 0) {
      const replies = document.createElement('div')
      replies.className = 'threadverse-comment-replies'
      comment.replies.forEach((reply) => replies.appendChild(renderComment(reply, depth + 1)))
      element.appendChild(replies)
    }
    return element
  }

  function totalComments(comments: ThreadverseComment[]): number {
    return comments.reduce((total, comment) => total + 1 + totalComments(comment.replies), 0)
  }

  function activeVersion(round: FeedRound) {
    return round.feedVersions.find((version) => version.id === round.activeFeedVersionId)
      ?? round.feedVersions.at(-1)
      ?? null
  }

  async function copyTextToClipboard(text: string): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        return
      }
    } catch {
      // Some mobile WebViews expose the Clipboard API but reject writes.
    }

    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'
    document.body.appendChild(textarea)
    textarea.select()
    textarea.setSelectionRange(0, textarea.value.length)
    try {
      if (!document.execCommand('copy')) throw new Error('The browser refused the copy command.')
    } finally {
      textarea.remove()
    }
  }

  async function copyRound(roundId: string): Promise<void> {
    const round = feeds.find((candidate) => candidate.id === roundId)
    const version = round ? activeVersion(round) : null
    if (!version) return
    try {
      await copyTextToClipboard(serializeFeedAsPlainText(version.feed))
      send({ type: 'threadverse:copy_result', success: true })
    } catch {
      send({ type: 'threadverse:copy_result', success: false })
    }
  }

  function selectRoundVersion(roundId: string, versionId: string): void {
    if (!activeChat || operationPending) return
    const round = feeds.find((candidate) => candidate.id === roundId)
    if (!round || round.activeFeedVersionId === versionId) return
    operationPending = true
    renderFeed()
    send({ type: 'threadverse:select_feed_version', chatId: activeChat.id, roundId, versionId })
  }

  function swipeRoundVersion(roundId: string, direction: 'left' | 'right'): void {
    if (!activeChat || operationPending) return
    const round = feeds.find((candidate) => candidate.id === roundId)
    if (!round) return
    const version = activeVersion(round)
    const currentIndex = version
      ? round.feedVersions.findIndex((candidate) => candidate.id === version.id)
      : -1
    const action = resolveFeedSwipe(currentIndex, round.feedVersions.length, direction)
    if (action.type === 'select') {
      const target = round.feedVersions[action.targetIndex]
      if (target) selectRoundVersion(round.id, target.id)
    } else if (action.type === 'regenerate') {
      generateNextVersion(round.id)
    }
  }

  function versionNavigation(round: FeedRound): HTMLElement {
    const version = activeVersion(round)
    const index = version
      ? round.feedVersions.findIndex((candidate) => candidate.id === version.id)
      : -1
    const navigation = document.createElement('div')
    navigation.className = 'threadverse-version-nav'

    const button = (direction: 'left' | 'right') => {
      const action = resolveFeedSwipe(index, round.feedVersions.length, direction)
      const element = document.createElement('button')
      element.type = 'button'
      element.className = 'threadverse-button threadverse-icon-button threadverse-button--compact'
      element.dataset.action = 'swipe-feed-version'
      element.dataset.roundId = round.id
      element.dataset.direction = direction
      element.disabled = !activeChat
        || operationPending
        || action.type === 'none'
        || (action.type === 'regenerate' && generationPending)
      element.title = action.type === 'regenerate'
        ? 'Generate new version'
        : `${direction === 'left' ? 'Previous' : 'Next'} version`
      element.setAttribute('aria-label', element.title)
      element.appendChild(actionIcon(direction === 'left' ? 'chevron-left' : 'chevron-right'))
      return element
    }

    const count = document.createElement('span')
    count.className = 'threadverse-version-count'
    count.textContent = `${Math.max(0, index + 1)} / ${round.feedVersions.length}`
    navigation.append(button('left'), count, button('right'))
    return navigation
  }

  function renderFeed(): void {
    feedRoundHandle?.destroy()
    feedRoundHandle = null
    cancelWaveDots(feedList)
    feedList.replaceChildren()
    if (feeds.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'threadverse-card threadverse-empty'
      empty.textContent = 'Generated fandom threads will appear here without being added to your roleplay chat.'
      feedList.appendChild(empty)
      return
    }
    if (!selectedFeedRoundId || !feeds.some((round) => round.id === selectedFeedRoundId)) {
      selectedFeedRoundId = feeds.at(-1)!.id
    }
    const round = feeds.find((item) => item.id === selectedFeedRoundId)!
    const selectedVersion = activeVersion(round)
    const toolbar = document.createElement('div')
    toolbar.className = 'threadverse-feed-toolbar threadverse-feed-controls'
    const selectTarget = document.createElement('div')
    selectTarget.className = 'threadverse-feed-round-select'
    const copyButton = document.createElement('button')
    copyButton.type = 'button'
    copyButton.className = 'threadverse-button threadverse-icon-button'
    copyButton.dataset.action = 'copy-round'
    copyButton.dataset.roundId = round.id
    copyButton.disabled = !selectedVersion || operationPending
    copyButton.title = 'Copy thread'
    copyButton.setAttribute('aria-label', 'Copy thread')
    copyButton.appendChild(actionIcon('copy'))
    const deleteButton = document.createElement('button')
    deleteButton.type = 'button'
    deleteButton.className = 'threadverse-button threadverse-button--danger'
    deleteButton.dataset.action = 'delete-round'
    deleteButton.dataset.roundId = round.id
    deleteButton.disabled = generationPending || operationPending
    deleteButton.textContent = 'Delete'
    toolbar.append(selectTarget, copyButton, deleteButton)
    feedList.appendChild(toolbar)
    feedRoundHandle = ctx.components.mountSelect(selectTarget, {
      value: round.id,
      disabled: generationPending || operationPending,
      triggerClassName: 'threadverse-secondary-input',
      searchThreshold: 6,
      searchPlaceholder: 'Search rounds...',
      options: [...feeds].reverse().map((optionRound) => ({
        value: optionRound.id,
        label: `Round ${optionRound.sequence} (${optionRound.startIndex}-${optionRound.endIndex})`,
        sublabel: activeVersion(optionRound) ? undefined : 'No feed generated',
      })),
      onChange: (roundId) => {
        selectedFeedRoundId = roundId
        renderFeed()
      },
    })

    feedList.appendChild(versionNavigation(round))

    const isRegeneratingRound = generationPending
      && generationOperation === 'regenerate'
      && generationChatId === activeChat?.id
      && generationRoundId === round.id
    if (isRegeneratingRound) {
      const status = document.createElement('div')
      status.className = 'threadverse-card threadverse-feed-generation-status'
      status.setAttribute('role', 'status')
      status.setAttribute('aria-live', 'polite')
      const tokenStatus = document.createElement('span')
      tokenStatus.className = 'threadverse-generation-token-status'
      const tokenCount = document.createElement('span')
      tokenCount.dataset.feedGenerationTokenCount = ''
      updateGenerationTokenText(tokenCount)
      tokenStatus.append(tokenCount, createWaveDots())
      status.appendChild(tokenStatus)
      if (generationCancellable) {
        const cancel = document.createElement('button')
        cancel.type = 'button'; cancel.className = 'threadverse-button'; cancel.dataset.action = 'cancel-generation'; cancel.textContent = 'Cancel'
        status.appendChild(cancel)
      }
      feedList.appendChild(status)
    }

    if (!selectedVersion) {
      const empty = document.createElement('div')
      empty.className = 'threadverse-card threadverse-empty'
      empty.textContent = 'This round was saved before feed generation was added.'
      feedList.appendChild(empty)
      return
    }
    const feed = selectedVersion.feed
    const card = document.createElement('article')
    card.className = 'threadverse-card threadverse-reddit'
    const post = document.createElement('section')
    post.className = 'threadverse-reddit-post'
    post.appendChild(authorRow(feed.post.username))
    const title = document.createElement('h2')
    title.className = 'threadverse-reddit-title'; title.textContent = feed.title
    const body = document.createElement('p')
    body.className = 'threadverse-reddit-body'; body.textContent = feed.post.body
    post.append(title, body, redditActions(feed.post.score, totalComments(feed.comments)))
    const comments = document.createElement('section')
    comments.className = 'threadverse-comments'
    feed.comments.forEach((comment) => comments.appendChild(renderComment(comment, 0)))
    card.append(post, comments)
    feedList.appendChild(card)
  }

  function renderMessages(): void {
    const query = search.value.trim().toLocaleLowerCase()
    const bounds = selectedBounds()
    const usedIds = new Set(rounds.flatMap((round) => round.messageIds))
    messageList.replaceChildren()

    const visible = messages.filter((message) => {
      if (unusedOnly.checked && usedIds.has(message.id)) return false
      return !query || message.content.toLocaleLowerCase().includes(query)
    })

    if (visible.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'threadverse-empty'
      empty.textContent = messages.length === 0
        ? 'No messages are available in the active chat.'
        : unusedOnly.checked && !query
          ? 'Every message in this chat already belongs to a saved round.'
          : 'No messages match the current filters.'
      messageList.appendChild(empty)
      updateSummary()
      return
    }

    for (const message of visible) {
      const absoluteIndex = messages.findIndex((item) => item.id === message.id)
      const row = document.createElement('button')
      row.type = 'button'
      row.className = 'threadverse-message'
      row.dataset.messageIndex = String(absoluteIndex)
      if (usedIds.has(message.id)) {
        row.classList.add('is-used')
        row.disabled = true
        row.title = 'This message already belongs to a saved round.'
      }
      if (bounds && absoluteIndex >= bounds[0] && absoluteIndex <= bounds[1]) row.classList.add('is-selected')
      if (absoluteIndex === startIndex || absoluteIndex === endIndex) row.classList.add('is-endpoint')

      const index = document.createElement('span')
      index.className = 'threadverse-message-index'
      index.textContent = `#${message.index}`
      if (absoluteIndex === startIndex || absoluteIndex === endIndex) {
        const marker = document.createElement('span')
        marker.className = 'threadverse-message-marker'
        marker.textContent = bounds
          ? bounds[0] === bounds[1]
            ? 'START / END'
            : absoluteIndex === bounds[0] ? 'START' : 'END'
          : absoluteIndex === startIndex ? 'START' : 'END'
        index.appendChild(marker)
      }

      const content = document.createElement('span')
      content.className = 'threadverse-message-content'
      content.textContent = message.content.replace(/\s+/g, ' ').trim() || '(empty message)'

      row.append(index, content)
      messageList.appendChild(row)
    }

    updateSummary()
  }

  function clearSelection(): void {
    startIndex = null
    endIndex = null
    renderMessages()
  }

  function rangeOverlapsSavedRound(first: number, last: number): boolean {
    const usedIds = new Set(rounds.flatMap((round) => round.messageIds))
    return messages
      .slice(Math.min(first, last), Math.max(first, last) + 1)
      .some((message) => usedIds.has(message.id))
  }

  function selectMessage(index: number): void {
    clearError()

    const next = toggleRangeEndpoint({ startIndex, endIndex }, index)
    if (
      next.startIndex !== null
      && next.endIndex !== null
      && rangeOverlapsSavedRound(next.startIndex, next.endIndex)
    ) {
      showError('A range cannot include messages that already belong to a saved round.')
      return
    }

    startIndex = next.startIndex
    endIndex = next.endIndex
    renderMessages()
  }

  function loadActiveChat(): void {
    clearError()
    messageList.innerHTML = '<div class="threadverse-empty">Loading the active chat...</div>'
    requestActiveChat()
  }

  function requestActiveChat(): void {
    latestChatRequestId += 1
    send({ type: 'threadverse:load_active_chat', requestId: latestChatRequestId })
  }

  function scheduleChatRefresh(): void {
    if (chatRefreshTimer) clearTimeout(chatRefreshTimer)
    chatRefreshTimer = setTimeout(() => {
      chatRefreshTimer = null
      requestActiveChat()
    }, 120)
  }

  function scheduleActiveChatRefresh(payload: unknown): void {
    const chatId = payload && typeof payload === 'object'
      ? (payload as { chatId?: unknown }).chatId
      : undefined
    if (!activeChat || chatId === activeChat.id) scheduleChatRefresh()
  }

  function generateSelectedRange(): void {
    const bounds = selectedBounds()
    if (!bounds || !activeChat || operationPending || generationPending) return

    setGenerationPending(true, true, {
      operation: 'generate', chatId: activeChat.id, outputTokens: 0,
    })
    armGenerationStartTimer()
    clearError()
    renderContinuity()
    send({
      type: 'threadverse:generate_thread',
      chatId: activeChat.id,
      startMessageId: messages[bounds[0]].id,
      endMessageId: messages[bounds[1]].id,
    })
  }

  function generateNextVersion(roundId: string): void {
    if (!activeChat || generationPending || operationPending) return
    setGenerationPending(true, true, {
      operation: 'regenerate', chatId: activeChat.id, roundId, outputTokens: 0,
    })
    armGenerationStartTimer()
    renderFeed()
    send({ type: 'threadverse:regenerate_thread', chatId: activeChat.id, roundId })
  }

  function showVersionDeleteChoice(round: FeedRound): Promise<'cancel' | 'version' | 'round'> {
    const selectedVersion = activeVersion(round)
    const selectedIndex = selectedVersion
      ? round.feedVersions.findIndex((version) => version.id === selectedVersion.id)
      : -1
    deleteChoiceModal?.dismiss()
    const modal = ctx.ui.showModal({ title: 'Delete', width: 420 })
    deleteChoiceModal = modal

    return new Promise((resolve) => {
      let settled = false
      const finish = (choice: 'cancel' | 'version' | 'round') => {
        if (settled) return
        settled = true
        if (deleteChoiceModal === modal) deleteChoiceModal = null
        modal.dismiss()
        resolve(choice)
      }
      modal.onDismiss(() => {
        if (settled) return
        settled = true
        if (deleteChoiceModal === modal) deleteChoiceModal = null
        resolve('cancel')
      })

      const content = document.createElement('div')
      content.className = 'threadverse-delete-choice'
      const message = document.createElement('p')
      message.className = 'threadverse-delete-choice-message'
      message.textContent = 'Delete just this version, or the entire round with all versions?'
      const detail = document.createElement('p')
      detail.className = 'threadverse-delete-choice-detail'
      detail.textContent = `Round ${round.sequence} · Version ${selectedIndex + 1} of ${round.feedVersions.length}`
      const actions = document.createElement('div')
      actions.className = 'threadverse-delete-choice-actions'

      const cancel = document.createElement('button')
      cancel.type = 'button'
      cancel.className = 'threadverse-button'
      cancel.textContent = 'Cancel'
      cancel.addEventListener('click', () => finish('cancel'))
      const version = document.createElement('button')
      version.type = 'button'
      version.className = 'threadverse-button threadverse-button--warning'
      version.textContent = 'Version'
      version.addEventListener('click', () => finish('version'))
      const wholeRound = document.createElement('button')
      wholeRound.type = 'button'
      wholeRound.className = 'threadverse-button threadverse-button--danger'
      wholeRound.textContent = 'Round'
      wholeRound.addEventListener('click', () => finish('round'))
      actions.append(cancel, version, wholeRound)
      content.append(message, detail, actions)
      modal.root.appendChild(content)
    })
  }

  async function deleteRound(roundId: string): Promise<void> {
    if (!activeChat || generationPending || operationPending) return
    const round = feeds.find((candidate) => candidate.id === roundId)
    if (!round) return
    const chatId = activeChat.id
    const selectedVersion = activeVersion(round)
    let choice: 'cancel' | 'version' | 'round'
    try {
      if (selectedVersion && round.feedVersions.length > 1) {
        choice = await showVersionDeleteChoice(round)
      } else {
        const result = await ctx.ui.showConfirm({
          title: 'Delete continuity round',
          message: `Delete Round ${round.sequence}? Its messages will become available in Make again.`,
          variant: 'danger',
          confirmLabel: 'Delete',
        })
        choice = result.confirmed ? 'round' : 'cancel'
      }
    } catch {
      showError('Threadverse could not open the delete confirmation.')
      return
    }
    if (choice === 'cancel' || !activeChat || activeChat.id !== chatId) return
    operationPending = true
    renderFeed()
    if (choice === 'version' && selectedVersion) {
      send({
        type: 'threadverse:delete_feed_version',
        chatId,
        roundId,
        versionId: selectedVersion.id,
      })
    } else {
      send({ type: 'threadverse:delete_round', chatId, roundId })
    }
  }

  function resetContinuity(): void {
    if (!activeChat || operationPending || generationPending) return
    operationPending = true
    clearError()
    renderContinuity()
    send({ type: 'threadverse:reset_continuity', chatId: activeChat.id })
  }

  const onClick = (event: Event) => {
    const target = event.target as Element
    const tab = target.closest<HTMLButtonElement>('[data-tab]')
    if (tab) {
      switchTab(tab.dataset.tab as ThreadverseTab)
      return
    }

    const row = target.closest<HTMLButtonElement>('[data-message-index]')
    if (row) {
      selectMessage(Number(row.dataset.messageIndex))
      return
    }

    const action = target.closest<HTMLElement>('[data-action]')?.dataset.action
    if (action === 'clear') clearSelection()
    if (action === 'save') generateSelectedRange()
    if (action === 'cancel-generation') cancelGeneration()
    if (action === 'swipe-feed-version') {
      const control = target.closest<HTMLElement>('[data-round-id]')!
      const direction = control.dataset.direction
      if (direction === 'left' || direction === 'right') {
        swipeRoundVersion(control.dataset.roundId!, direction)
      }
    }
    if (action === 'copy-round') void copyRound(target.closest<HTMLElement>('[data-round-id]')!.dataset.roundId!)
    if (action === 'delete-round') void deleteRound(target.closest<HTMLElement>('[data-round-id]')!.dataset.roundId!)
    if (action === 'reset') resetContinuity()
    if (action === 'save-prompt') savePrompt()
    if (action === 'new-instruction-preset') requestNewInstructionPreset()
    if (action === 'delete-instruction-preset') void deleteInstructionPreset()
    if (action === 'expand-instructions') expandInstructions()
  }

  const flushPendingAutomaticSave = () => {
    if (autoSaveTimer) flushAutomaticSave()
  }

  const flushWhenHidden = () => {
    if (document.visibilityState === 'hidden') flushPendingAutomaticSave()
  }

  shell.addEventListener('click', onClick)
  search.addEventListener('input', renderMessages)
  unusedOnly.addEventListener('change', renderMessages)
  maintainFandomToggle.addEventListener('change', handleMaintainFandomChange)
  window.addEventListener('pagehide', flushPendingAutomaticSave)
  document.addEventListener('visibilitychange', flushWhenHidden)

  const unsubscribeBackend = ctx.onBackendMessage((payload: unknown) => {
    const message = payload as BackendToFrontendMessage
    if (message.type === 'threadverse:generation_state') {
      clearGenerationStartTimer()
      if (message.status === 'progress') {
        if (generationPending && generationChatId === message.chatId) {
          generationOutputTokens = message.outputTokens ?? generationOutputTokens
          renderGenerationProgress()
          renderFeedGenerationProgress()
        }
        return
      }
      setGenerationPending(message.status === 'started', message.status === 'started', {
        operation: message.operation,
        chatId: message.chatId,
        roundId: message.roundId,
        outputTokens: message.outputTokens,
      })
      if (message.status === 'completed' && activeChat?.id === message.chatId) {
        if (message.roundId) selectedFeedRoundId = message.roundId
      }
      renderContinuity()
      renderFeed()
      return
    }
    if (message.type === 'threadverse:operation_error') {
      operationPending = false
      if (activeTab !== 'settings') {
        showError(message.error)
      }
      renderContinuity()
      renderFeed()
      return
    }

    if (message.type === 'threadverse:mutation_completed') {
      operationPending = false
      renderContinuity()
      renderFeed()
      return
    }

    if (message.type === 'threadverse:settings_state') {
      defaultInstructions = message.defaultInstructions
      mountSettingsForm(message.settings, message.connections)
      return
    }

    if (message.type === 'threadverse:settings_save_result') {
      if (message.scope === 'prompt') {
        promptSavePending = false
        savePromptButton.disabled = false
      }
      return
    }

    if (message.type === 'threadverse:instruction_preset_name') {
      if (!message.name || !settingsDraft) {
        return
      }
      const source = getActiveInstructionPreset()
      const preset = {
        id: crypto.randomUUID(),
        name: message.name,
        instructions: source?.instructions ?? defaultInstructions,
      }
      settingsDraft.instructionPresets.push(preset)
      settingsDraft.activeInstructionPresetId = preset.id
      mountSettingsForm(settingsDraft, settingsConnections)
      return
    }

    if (message.type === 'threadverse:instruction_editor_result') {
      if (!message.cancelled && settingsDraft) {
        const preset = settingsDraft.instructionPresets.find((candidate) => candidate.id === message.presetId)
        if (preset) {
          preset.instructions = message.text
          if (preset.id === settingsDraft.activeInstructionPresetId) {
            instructionsHandle?.update({ value: message.text })
          }
        }
      }
      return
    }

    if (message.type === 'threadverse:active_chat') {
      if (!shouldAcceptActiveChatResponse(message.requestId, latestChatRequestId)) return
      if (message.requestId === undefined) latestChatRequestId += 1
      const previousStartId = startIndex === null ? null : messages[startIndex]?.id
      const previousEndId = endIndex === null ? null : messages[endIndex]?.id
      activeChat = message.chat
      messages = message.messages
      rounds = message.rounds
      feeds = message.feedRounds
      if (message.notice) {
        startIndex = null
        endIndex = null
      } else {
        const nextStart = previousStartId ? messages.findIndex((item) => item.id === previousStartId) : -1
        const nextEnd = previousEndId ? messages.findIndex((item) => item.id === previousEndId) : -1
        startIndex = nextStart >= 0 ? nextStart : null
        endIndex = nextEnd >= 0 ? nextEnd : null
      }
      clearError()
      if (message.error && message.chat) showError(message.error)
      renderContinuity()
      renderMessages()
      renderFeed()

      if (message.error && !message.chat) {
        messageList.replaceChildren()
        const error = document.createElement('div')
        error.className = 'threadverse-empty'
        error.textContent = message.error
        messageList.appendChild(error)
      }
    }
  })

  const unsubscribeActivate = drawer.onActivate(loadActiveChat)
  const chatEventUnsubscribers = [
    ctx.events.on('CHAT_SWITCHED', scheduleChatRefresh),
    ctx.events.on('MESSAGE_SENT', scheduleActiveChatRefresh),
    ctx.events.on('MESSAGE_EDITED', scheduleActiveChatRefresh),
    ctx.events.on('MESSAGE_DELETED', scheduleActiveChatRefresh),
    ctx.events.on('MESSAGE_SWIPED', scheduleActiveChatRefresh),
  ]
  send({ type: 'threadverse:load_settings' })
  loadActiveChat()

  return () => {
    if (autoSaveTimer) flushAutomaticSave()
    if (chatRefreshTimer) clearTimeout(chatRefreshTimer)
    clearGenerationStartTimer()
    unsubscribeActivate()
    for (const unsubscribe of chatEventUnsubscribers) unsubscribe()
    unsubscribeBackend()
    shell.removeEventListener('click', onClick)
    feedRoundHandle?.destroy()
    deleteChoiceModal?.dismiss()
    deleteChoiceModal = null
    search.removeEventListener('input', renderMessages)
    unusedOnly.removeEventListener('change', renderMessages)
    maintainFandomToggle.removeEventListener('change', handleMaintainFandomChange)
    window.removeEventListener('pagehide', flushPendingAutomaticSave)
    document.removeEventListener('visibilitychange', flushWhenHidden)
    destroySettingsComponents()
    cancelWaveDots(shell)
    drawer.destroy()
    removeStyle()
    ctx.dom.cleanup()
  }
}
