import type {
  SpindleFrontendContext,
  SpindleNumericInputHandle,
  SpindleSelectHandle,
  SpindleTextAreaHandle,
} from 'lumiverse-spindle-types'
import type {
  BackendToFrontendMessage,
  ChatMessageSummary,
  ConnectionSummary,
  FrontendToBackendMessage,
  RoundSummary,
  ThreadverseSettingsPayload,
  ThreadverseTab,
} from './shared'
import { toggleRangeEndpoint } from './range-selection'

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
    color: var(--lumiverse-text);
    background: var(--lumiverse-fill-subtle);
    box-shadow: inset 0 0 0 1px var(--lumiverse-border);
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

  .threadverse-context-error {
    color: var(--lumiverse-danger, #ef4444);
    font-size: 10px;
    line-height: 1.35;
  }

  .threadverse-context-error[hidden] { display: none; }

  .threadverse-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
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

  .threadverse-button--primary {
    background: var(--lumiverse-accent);
    color: var(--lumiverse-accent-contrast, white);
    border-color: var(--lumiverse-accent);
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

  .threadverse-settings-status {
    min-height: 15px;
    color: var(--lumiverse-success, #22c55e);
    font-size: 10px;
  }

  .threadverse-settings-status.is-error { color: var(--lumiverse-danger, #ef4444); }

  .threadverse-settings-actions {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  .threadverse-preset-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 6px;
    align-items: center;
  }

  .threadverse-preset-actions {
    display: flex;
    gap: 6px;
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
      <div class="threadverse-card threadverse-empty">
        Generated fandom threads will appear here without being added to your roleplay chat.
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
          <div class="threadverse-context-error" data-context-error hidden></div>
        </div>
        <div class="threadverse-toolbar">
          <input class="threadverse-search" type="search" placeholder="Search messages..." aria-label="Search messages" />
          <label class="threadverse-filter-toggle">
            <input type="checkbox" data-unused-only />
            <span class="threadverse-switch-track" aria-hidden="true"></span>
            <span>Unused only</span>
          </label>
          <button class="threadverse-button" type="button" data-action="refresh">Refresh</button>
        </div>
        <div class="threadverse-message-list">
          <div class="threadverse-empty" data-message-state>Loading the active chat...</div>
        </div>
        <div class="threadverse-actions">
          <button class="threadverse-button" type="button" data-action="clear">Clear</button>
          <button class="threadverse-button threadverse-button--primary" type="button" data-action="save" disabled>Save Range</button>
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
              <div data-setting="maintain-fandom"></div>
            </div>
          </div>
        </section>

        <section class="threadverse-card threadverse-settings-section">
          <h3 class="threadverse-eyebrow">Instructions</h3>
          <div class="threadverse-preset-row">
            <div data-setting="instruction-preset"></div>
            <button class="threadverse-button threadverse-button--compact" type="button" data-action="new-instruction-preset">New</button>
            <button class="threadverse-button threadverse-button--compact" type="button" data-action="delete-instruction-preset">Delete</button>
          </div>
          <div class="threadverse-settings-field">
            <div data-setting="instructions"></div>
          </div>
          <p class="threadverse-settings-hint">The context section headers are assembled by Threadverse. This prompt controls the fandom's behavior and output.</p>
          <div class="threadverse-preset-actions">
            <button class="threadverse-button" type="button" data-action="expand-instructions">Expand editor</button>
          </div>
          <div class="threadverse-settings-status" data-settings-status>Loading settings...</div>
          <div class="threadverse-settings-actions">
            <button class="threadverse-button" type="button" data-action="reset-instructions">Reset prompt</button>
            <button class="threadverse-button threadverse-button--primary" type="button" data-action="save-settings" disabled>Save Settings</button>
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
  const resetButton = shell.querySelector<HTMLButtonElement>('[data-action="reset"]')!
  const chatName = shell.querySelector<HTMLElement>('[data-chat-name]')!
  const previousContext = shell.querySelector<HTMLElement>('[data-previous-context]')!
  const recentContext = shell.querySelector<HTMLElement>('[data-recent-context]')!
  const contextError = shell.querySelector<HTMLElement>('[data-context-error]')!
  const settingsStatus = shell.querySelector<HTMLElement>('[data-settings-status]')!
  const saveSettingsButton = shell.querySelector<HTMLButtonElement>('[data-action="save-settings"]')!

  let activeTab: ThreadverseTab = 'make'
  let activeChat: { id: string; name: string } | null = null
  let messages: ChatMessageSummary[] = []
  let rounds: RoundSummary[] = []
  let startIndex: number | null = null
  let endIndex: number | null = null
  let operationPending = false
  let settingsDraft: ThreadverseSettingsPayload | null = null
  let settingsConnections: ConnectionSummary[] = []
  let defaultInstructions = ''
  let instructionPresetHandle: SpindleSelectHandle | null = null
  let instructionsHandle: SpindleTextAreaHandle | null = null
  let settingsComponents: Array<{ destroy(): void }> = []

  const send = (payload: FrontendToBackendMessage) => ctx.sendToBackend(payload)

  function clearError(): void {
    contextError.textContent = ''
    contextError.hidden = true
  }

  function showError(message: string): void {
    contextError.textContent = message
    contextError.hidden = false
  }

  function settingTarget(name: string): HTMLElement {
    return shell.querySelector<HTMLElement>(`[data-setting="${name}"]`)!
  }

  function setSettingsStatus(message: string, error = false): void {
    settingsStatus.textContent = message
    settingsStatus.classList.toggle('is-error', error)
  }

  function destroySettingsComponents(): void {
    for (const component of settingsComponents) component.destroy()
    settingsComponents = []
    instructionPresetHandle = null
    instructionsHandle = null
  }

  function getActiveInstructionPreset() {
    return settingsDraft?.instructionPresets.find(
      (preset) => preset.id === settingsDraft?.activeInstructionPresetId,
    ) ?? null
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
    let fandomThreadsHandle: SpindleNumericInputHandle | null = null

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
        if (settingsDraft) settingsDraft.maxOutputTokens = value
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
        if (settingsDraft) settingsDraft.temperature = value
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
        if (settingsDraft) settingsDraft.topP = value
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
        if (settingsDraft) settingsDraft.previousRangeLimit = value
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
        if (settingsDraft) settingsDraft.fandomThreadLimit = value
      },
    })

    const fandomSwitchHandle = ctx.components.mountSwitch(settingTarget('maintain-fandom'), {
      checked: settingsDraft.maintainFandomContinuity,
      size: 'sm',
      ariaLabel: 'Maintain fandom continuity',
      onChange: (checked) => {
        if (!settingsDraft) return
        settingsDraft.maintainFandomContinuity = checked
        fandomThreadsHandle?.update({ disabled: !checked })
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
      className: 'threadverse-secondary-input',
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
      fandomSwitchHandle,
      instructionPresetHandle,
      instructionsHandle,
    ]
    saveSettingsButton.disabled = connections.length === 0
  }

  function saveSettings(): void {
    if (!settingsDraft || operationPending) return
    operationPending = true
    saveSettingsButton.disabled = true
    setSettingsStatus('Saving settings...')
    send({
      type: 'threadverse:save_settings',
      settings: {
        ...settingsDraft,
        instructionPresets: settingsDraft.instructionPresets.map((preset) => ({ ...preset })),
      },
    })
  }

  function resetInstructions(): void {
    const preset = getActiveInstructionPreset()
    if (!preset || !instructionsHandle) return
    preset.instructions = defaultInstructions
    instructionsHandle.update({ value: defaultInstructions })
    setSettingsStatus('Default prompt restored. Save settings to keep it.')
  }

  function requestNewInstructionPreset(): void {
    if (!settingsDraft || operationPending) return
    setSettingsStatus('Waiting for a preset name...')
    send({ type: 'threadverse:request_instruction_preset_name' })
  }

  async function deleteInstructionPreset(): Promise<void> {
    if (!settingsDraft || operationPending) return
    if (settingsDraft.instructionPresets.length <= 1) {
      setSettingsStatus('Keep at least one instruction preset.', true)
      return
    }
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
    setSettingsStatus('Preset deleted. Save settings to keep this change.')
  }

  function expandInstructions(): void {
    const preset = getActiveInstructionPreset()
    if (!preset || operationPending) return
    setSettingsStatus('Expanded editor opened...')
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
    if (next === 'settings') {
      setSettingsStatus('Loading settings...')
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
    saveButton.disabled = operationPending || !activeChat
  }

  function renderContinuity(): void {
    chatName.textContent = activeChat?.name ?? 'No active chat'
    previousContext.textContent = rounds.length === 0
      ? 'None yet'
      : rounds
        .map((round) => `Round ${round.sequence} (${round.startIndex}-${round.endIndex})`)
        .join(' - ')
    resetButton.disabled = operationPending || !activeChat || rounds.length === 0
    updateSummary()
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
    send({ type: 'threadverse:load_active_chat' })
  }

  function saveSelectedRange(): void {
    const bounds = selectedBounds()
    if (!bounds || !activeChat || operationPending) return

    operationPending = true
    clearError()
    renderContinuity()
    send({
      type: 'threadverse:save_range',
      chatId: activeChat.id,
      startMessageId: messages[bounds[0]].id,
      endMessageId: messages[bounds[1]].id,
    })
  }

  function resetContinuity(): void {
    if (!activeChat || operationPending) return
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
    if (action === 'refresh') loadActiveChat()
    if (action === 'clear') clearSelection()
    if (action === 'save') saveSelectedRange()
    if (action === 'reset') resetContinuity()
    if (action === 'save-settings') saveSettings()
    if (action === 'reset-instructions') resetInstructions()
    if (action === 'new-instruction-preset') requestNewInstructionPreset()
    if (action === 'delete-instruction-preset') void deleteInstructionPreset()
    if (action === 'expand-instructions') expandInstructions()
  }

  shell.addEventListener('click', onClick)
  search.addEventListener('input', renderMessages)
  unusedOnly.addEventListener('change', renderMessages)

  const unsubscribeBackend = ctx.onBackendMessage((payload: unknown) => {
    const message = payload as BackendToFrontendMessage
    if (message.type === 'threadverse:operation_error') {
      operationPending = false
      if (activeTab === 'settings') {
        saveSettingsButton.disabled = false
        setSettingsStatus(message.error, true)
      } else {
        showError(message.error)
      }
      renderContinuity()
      return
    }

    if (message.type === 'threadverse:settings_state') {
      operationPending = false
      defaultInstructions = message.defaultInstructions
      mountSettingsForm(message.settings, message.connections)
      setSettingsStatus(message.error ?? message.notice ?? '', Boolean(message.error))
      return
    }

    if (message.type === 'threadverse:instruction_preset_name') {
      if (!message.name || !settingsDraft) {
        setSettingsStatus('Preset creation cancelled.')
        return
      }
      if (settingsDraft.instructionPresets.some(
        (preset) => preset.name.toLocaleLowerCase() === message.name!.toLocaleLowerCase(),
      )) {
        setSettingsStatus(`A preset named "${message.name}" already exists.`, true)
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
      setSettingsStatus('Preset created. Save settings to keep it.')
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
        setSettingsStatus('Expanded edit applied. Save settings to keep it.')
      } else {
        setSettingsStatus('Expanded edit cancelled.')
      }
      return
    }

    if (message.type === 'threadverse:active_chat') {
      operationPending = false
      activeChat = message.chat
      messages = message.messages
      rounds = message.rounds
      startIndex = null
      endIndex = null
      clearError()
      if (message.error && message.chat) showError(message.error)
      renderContinuity()
      renderMessages()

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
  send({ type: 'threadverse:get_status' })
  send({ type: 'threadverse:load_settings' })
  loadActiveChat()

  return () => {
    unsubscribeActivate()
    unsubscribeBackend()
    shell.removeEventListener('click', onClick)
    search.removeEventListener('input', renderMessages)
    unusedOnly.removeEventListener('change', renderMessages)
    destroySettingsComponents()
    drawer.destroy()
    removeStyle()
    ctx.dom.cleanup()
  }
}
