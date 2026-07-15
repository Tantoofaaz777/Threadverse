import {
  DEFAULT_FEED_FONT_SCALE,
  MAX_FEED_FONT_SCALE,
  MIN_FEED_FONT_SCALE,
  isFrontendMessage,
  type BackendToFrontendMessage,
  type ChatMessageSummary,
  type ConnectionSummary,
  type FeedVersion,
  type InstructionPreset,
  type ThreadverseAutomaticSettings,
  type ThreadverseFeed,
  type ThreadversePromptSettings,
} from './shared'
import { parseThreadverseFeed, serializeFeedForContinuity } from './feed'
import { buildThreadversePrompt } from './prompt'
import {
  DEFAULT_INSTRUCTIONS,
  activeFeedVersion,
  applyAutomaticSettings,
  applyPromptSettings,
  emptyStore,
  feedRounds,
  normalizeStore,
  pruneInactiveFeedVersions,
  removeFeedVersion,
  resolveContinuity,
  resolveSamplers,
  selectFeedVersion,
  summarizeRounds,
  type StoredRound,
  type ThreadverseStore,
} from './state'

declare const spindle: import('lumiverse-spindle-types').SpindleAPI

const STORE_PATH = 'threadverse-state.json'
const storeWriteQueues = new Map<string, Promise<void>>()
interface ActiveGeneration {
  controller: AbortController
  chatId: string
  operation: 'generate' | 'regenerate'
  roundId?: string
}
const activeGenerations = new Map<string, ActiveGeneration>()

function send(payload: BackendToFrontendMessage, userId: string): void {
  spindle.sendToFrontend(payload, userId)
}

function beginGeneration(
  userId: string,
  chatId: string,
  operation: 'generate' | 'regenerate',
  roundId?: string,
): ActiveGeneration {
  if (activeGenerations.has(userId)) throw new Error('A Threadverse generation is already running.')
  const active = { controller: new AbortController(), chatId, operation, roundId }
  activeGenerations.set(userId, active)
  try {
    send({
      type: 'threadverse:generation_state', status: 'started', chatId,
      operation, roundId, outputTokens: 0,
    }, userId)
  } catch (error) {
    activeGenerations.delete(userId)
    active.controller.abort()
    throw error
  }
  return active
}

function endGeneration(userId: string, active: ActiveGeneration): void {
  if (activeGenerations.get(userId) === active) activeGenerations.delete(userId)
}

function throwIfAborted(active: ActiveGeneration): void {
  if (!active.controller.signal.aborted) return
  const error = new Error('Generation cancelled.')
  error.name = 'AbortError'
  throw error
}

function cancelActiveGeneration(userId: string): void {
  const active = activeGenerations.get(userId)
  if (!active) return
  active.controller.abort()
  activeGenerations.delete(userId)
  send({
    type: 'threadverse:generation_state', status: 'cancelled', chatId: active.chatId,
    operation: active.operation, roundId: active.roundId,
  }, userId)
}

async function loadStore(userId: string): Promise<ThreadverseStore> {
  const value = await spindle.userStorage.getJson<ThreadverseStore>(STORE_PATH, {
    fallback: emptyStore(), userId,
  })
  return normalizeStore(value)
}

async function saveStore(store: ThreadverseStore, userId: string): Promise<void> {
  await spindle.userStorage.setJson(STORE_PATH, store, { indent: 2, userId })
}

async function queueStoreWrite(userId: string, operation: () => Promise<void>): Promise<void> {
  const previous = storeWriteQueues.get(userId) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(operation)
  storeWriteQueues.set(userId, current)
  try { await current } finally {
    if (storeWriteQueues.get(userId) === current) storeWriteQueues.delete(userId)
  }
}

function hasChatPermissions(): boolean {
  return spindle.permissions.has('chats') && spindle.permissions.has('chat_mutation')
}

function toConnectionSummary(connection: { id: string; name: string; provider: string; model: string; is_default: boolean }): ConnectionSummary {
  return { id: connection.id, name: connection.name, provider: connection.provider, model: connection.model, isDefault: connection.is_default }
}

async function getConnections(userId: string): Promise<ConnectionSummary[]> {
  if (!spindle.permissions.has('generation')) return []
  return (await spindle.connections.list(userId)).map(toConnectionSummary)
}

async function sendSettingsState(userId: string): Promise<void> {
  const [store, connections] = await Promise.all([loadStore(userId), getConnections(userId)])
  const settings = { ...store.settings }
  const selected = connections.find((item) => item.id === settings.connectionId)
    ?? connections.find((item) => item.isDefault) ?? connections[0]
  if (!selected) settings.connectionId = null
  else if (!connections.some((item) => item.id === settings.connectionId)) settings.connectionId = selected.id
  send({
    type: 'threadverse:settings_state', settings, defaultInstructions: DEFAULT_INSTRUCTIONS, connections,
  }, userId)
}

function requireNumber(value: unknown, label: string, minimum: number, maximum: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a number.`)
  if (value < minimum || value > maximum || (integer && !Number.isInteger(value))) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}${integer ? ' and use a whole number' : ''}.`)
  }
  return value
}

function optionalNumber(value: unknown, label: string, minimum: number, maximum: number, integer = false): number | null {
  return value === null || value === undefined || value === '' ? null : requireNumber(value, label, minimum, maximum, integer)
}

function validateInstructionPresets(value: unknown): InstructionPreset[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Save at least one instruction preset.')
  if (value.length > 50) throw new Error('Instruction presets are limited to 50.')
  const ids = new Set<string>()
  const names = new Set<string>()
  return value.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') throw new Error(`Instruction preset ${index + 1} is invalid.`)
    const raw = candidate as Partial<InstructionPreset>
    const id = typeof raw.id === 'string' ? raw.id.trim() : ''
    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    if (!id || ids.has(id)) throw new Error('Instruction preset IDs must be unique.')
    if (!name || name.length > 100) throw new Error('Instruction preset names must contain 1 to 100 characters.')
    const normalized = name.toLocaleLowerCase()
    if (names.has(normalized)) throw new Error(`An instruction preset named "${name}" already exists.`)
    if (typeof raw.instructions !== 'string') throw new Error(`Instructions are missing for preset "${name}".`)
    ids.add(id); names.add(normalized)
    return { id, name, instructions: raw.instructions }
  })
}

async function saveAutomaticSettings(value: unknown, userId: string): Promise<void> {
  if (!value || typeof value !== 'object') throw new Error('Invalid settings payload.')
  const input = value as Partial<ThreadverseAutomaticSettings>
  const connections = await getConnections(userId)
  const connection = input.connectionId ? connections.find((item) => item.id === input.connectionId) : null
  if (input.connectionId && !connection) throw new Error('Choose an available Lumiverse connection.')
  const settings: ThreadverseAutomaticSettings = {
    connectionId: connection?.id ?? null,
    maxOutputTokens: optionalNumber(input.maxOutputTokens, 'Max output tokens', 1, 200000, true),
    temperature: optionalNumber(input.temperature, 'Temperature', 0, 5),
    topP: optionalNumber(input.topP, 'Top P', 0, 1),
    previousRangeLimit: optionalNumber(input.previousRangeLimit, 'Previous story ranges', 0, 50, true),
    fandomThreadLimit: optionalNumber(input.fandomThreadLimit, 'Previous fandom threads', 0, 50, true),
    maintainFandomContinuity: Boolean(input.maintainFandomContinuity),
    feedFontScale: requireNumber(
      input.feedFontScale ?? DEFAULT_FEED_FONT_SCALE,
      'Feed text size', MIN_FEED_FONT_SCALE, MAX_FEED_FONT_SCALE, true,
    ),
  }
  await queueStoreWrite(userId, async () => {
    const store = await loadStore(userId)
    store.settings = applyAutomaticSettings(store.settings, settings)
    await saveStore(store, userId)
  })
  send({ type: 'threadverse:settings_save_result', scope: 'automatic' }, userId)
}

async function savePromptSettings(value: unknown, userId: string): Promise<void> {
  if (!value || typeof value !== 'object') throw new Error('Invalid prompt settings payload.')
  const input = value as Partial<ThreadversePromptSettings>
  const instructionPresets = validateInstructionPresets(input.instructionPresets)
  const activeInstructionPresetId = typeof input.activeInstructionPresetId === 'string' ? input.activeInstructionPresetId : ''
  if (!instructionPresets.some((item) => item.id === activeInstructionPresetId)) throw new Error('Choose an active instruction preset.')
  await queueStoreWrite(userId, async () => {
    const store = await loadStore(userId)
    store.settings = applyPromptSettings(store.settings, { instructionPresets, activeInstructionPresetId })
    await saveStore(store, userId)
  })
  spindle.toast.success('Prompt saved.', { userId })
  send({ type: 'threadverse:settings_save_result', scope: 'prompt' }, userId)
}

async function sendActiveChat(
  userId: string,
  options?: { notice?: string; error?: string },
  expectedChatId?: string,
  requestId?: number,
): Promise<void> {
  if (!hasChatPermissions()) {
    send({ type: 'threadverse:active_chat', chat: null, messages: [], rounds: [], feedRounds: [], fandomNotes: '', requestId, error: 'Grant the Chats and Chat Mutation permissions to load roleplay messages.' }, userId)
    return
  }
  const activeChat = await spindle.chats.getActive(userId)
  if (expectedChatId && activeChat?.id !== expectedChatId) return
  if (!activeChat) {
    send({ type: 'threadverse:active_chat', chat: null, messages: [], rounds: [], feedRounds: [], fandomNotes: '', requestId, error: 'Open a roleplay chat, then refresh this list.' }, userId)
    return
  }
  const [rawMessages, store] = await Promise.all([spindle.chat.getMessages(activeChat.id), loadStore(userId)])
  const continuity = store.chats[activeChat.id]
  send({
    type: 'threadverse:active_chat', chat: { id: activeChat.id, name: activeChat.name },
    messages: rawMessages.map((message, index) => ({ id: message.id, index: index + 1, role: message.role, content: message.content })),
    rounds: summarizeRounds(continuity?.rounds ?? []), feedRounds: feedRounds(continuity?.rounds ?? []),
    fandomNotes: continuity?.fandomNotes ?? '',
    requestId, error: options?.error, notice: options?.notice,
  }, userId)
}

function formatMessages(messages: ChatMessageSummary[]): string {
  return messages.map((message) => message.content).join('\n\n')
}

function generationContent(result: unknown): string {
  if (!result || typeof result !== 'object') throw new Error('Lumiverse returned an empty generation result.')
  const content = (result as { content?: unknown }).content
  if (typeof content !== 'string' || !content.trim()) throw new Error('The model returned an empty response.')
  return content
}

function promptForRound(
  store: ThreadverseStore,
  chatId: string,
  recent: ChatMessageSummary[],
  cutoff: number,
  fandomNotesOverride?: string,
): string {
  const earlier = store.chats[chatId]?.rounds.slice(0, cutoff) ?? []
  const limits = resolveContinuity(store.settings)
  const previous = limits.previousRangeLimit === 0 ? [] : earlier.slice(-limits.previousRangeLimit)
  const fandomCandidates = earlier.flatMap((round) => {
    const version = activeFeedVersion(round)
    return version ? [{ round, feed: version.feed }] : []
  })
  const fandom = store.settings.maintainFandomContinuity && limits.fandomThreadLimit > 0
    ? fandomCandidates.slice(-limits.fandomThreadLimit) : []
  const preset = store.settings.instructionPresets.find((item) => item.id === store.settings.activeInstructionPresetId)
  if (!preset) throw new Error('Choose and save an instruction preset before generating.')
  return buildThreadversePrompt({
    previousRanges: previous.map((round) => ({ label: `ROUND ${round.sequence}`, content: formatMessages(round.messages) })),
    recentRange: { label: 'CURRENT RANGE', content: formatMessages(recent) },
    fandomContinuity: fandom.map(({ round, feed }) => ({ label: `FANDOM THREAD ${round.sequence}`, content: serializeFeedForContinuity(feed) })),
    fandomNotes: fandomNotesOverride ?? store.chats[chatId]?.fandomNotes ?? '',
    instructions: preset.instructions,
  })
}

async function runGeneration(
  store: ThreadverseStore,
  chatId: string,
  recent: ChatMessageSummary[],
  cutoff: number,
  userId: string,
  operation: 'generate' | 'regenerate',
  active: ActiveGeneration,
  roundId?: string,
  fandomNotesOverride?: string,
) {
  const connections = await getConnections(userId)
  throwIfAborted(active)
  const selectedConnection = connections.find((item) => item.id === store.settings.connectionId)
    ?? connections.find((item) => item.isDefault) ?? connections[0]
  if (!selectedConnection) throw new Error('Choose a Lumiverse connection in Settings before generating.')
  const connectionId = selectedConnection.id
  const samplers = resolveSamplers(store.settings)
  const stream = spindle.generate.quietStream({
    type: 'quiet', userId, connection_id: connectionId,
    messages: [{
      role: 'user',
      content: promptForRound(store, chatId, recent, cutoff, fandomNotesOverride),
    }],
    parameters: { max_tokens: samplers.maxOutputTokens, temperature: samplers.temperature, top_p: samplers.topP },
    signal: active.controller.signal,
  })
  let content: string | null = null
  let outputCharacters = 0
  let outputTokens = 0
  let lastReportedTokens = 0
  let lastProgressAt = 0

  const reportProgress = (force = false) => {
    const now = Date.now()
    if (!force && outputTokens > 1 && now - lastProgressAt < 250) return
    if (outputTokens === lastReportedTokens) return
    lastReportedTokens = outputTokens
    lastProgressAt = now
    try {
      send({
        type: 'threadverse:generation_state', status: 'progress', chatId,
        operation, roundId, outputTokens,
      }, userId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown progress update error.'
      spindle.log.warn(`[Threadverse] Could not update generation progress: ${message}`)
    }
  }

  for await (const chunk of stream) {
    if (chunk.type === 'token' && chunk.token) {
      outputCharacters += chunk.token.length
      outputTokens = Math.ceil(outputCharacters / 4)
      reportProgress()
    } else if (chunk.type === 'done') {
      content = chunk.content
    }
  }
  throwIfAborted(active)
  reportProgress(true)
  if (content === null) throw new Error('Lumiverse ended the generation without a final response.')
  return parseThreadverseFeed(generationContent({ content }))
}

async function finishSuccessfulGeneration(
  chatId: string,
  roundId: string,
  notice: string,
  userId: string,
): Promise<void> {
  try {
    await sendActiveChat(userId, { notice }, chatId)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown refresh error.'
    spindle.log.error(`[Threadverse] Round saved, but the frontend refresh failed: ${message}`)
  }
  send({ type: 'threadverse:generation_state', status: 'completed', chatId, roundId }, userId)
  try {
    spindle.toast.success(notice, { userId })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown toast error.'
    spindle.log.error(`[Threadverse] Round saved, but the completion toast failed: ${message}`)
  }
}

async function finishSuccessfulMutation(
  operation: 'select_feed_version' | 'delete_feed_version' | 'delete_round' | 'reset_continuity',
  chatId: string,
  notice: string | undefined,
  userId: string,
): Promise<void> {
  try {
    await sendActiveChat(userId, notice ? { notice } : undefined, chatId)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown refresh error.'
    spindle.log.error(`[Threadverse] Mutation saved, but the frontend refresh failed: ${message}`)
  }
  send({ type: 'threadverse:mutation_completed', operation, chatId }, userId)
}

function createFeedVersion(feed: ThreadverseFeed): FeedVersion {
  return { id: crypto.randomUUID(), createdAt: new Date().toISOString(), feed }
}

async function selectMessages(chatId: string, startId: string, endId: string, userId: string) {
  if (!hasChatPermissions()) throw new Error('Grant the Chats and Chat Mutation permissions before generating.')
  const chat = await spindle.chats.getActive(userId)
  if (!chat || chat.id !== chatId) throw new Error('The active chat changed. Refresh the message list and select the range again.')
  const raw = await spindle.chat.getMessages(chat.id)
  const start = raw.findIndex((message) => message.id === startId)
  const end = raw.findIndex((message) => message.id === endId)
  if (start < 0 || end < 0) throw new Error('One or both selected messages no longer exist in the active chat.')
  const first = Math.min(start, end); const last = Math.max(start, end)
  const messages: ChatMessageSummary[] = raw.slice(first, last + 1).map((message, offset) => ({ id: message.id, index: first + offset + 1, role: message.role, content: message.content }))
  return { chat, messages }
}

async function generateThread(payload: Extract<import('./shared').FrontendToBackendMessage, { type: 'threadverse:generate_thread' }>, userId: string): Promise<void> {
  const active = beginGeneration(userId, payload.chatId, 'generate')
  try {
    const selection = await selectMessages(payload.chatId, payload.startMessageId, payload.endMessageId, userId)
    throwIfAborted(active)
    const store = await loadStore(userId)
    throwIfAborted(active)
    const existing = store.chats[selection.chat.id]?.rounds ?? []
    const used = new Set(existing.flatMap((round) => round.messages.map((message) => message.id)))
    if (selection.messages.some((message) => used.has(message.id))) throw new Error('This range overlaps messages that already belong to a continuity round.')
    const feed = await runGeneration(
      store,
      selection.chat.id,
      selection.messages,
      existing.length,
      userId,
      'generate',
      active,
      undefined,
      payload.fandomNotes,
    )
    throwIfAborted(active)
    const feedVersion = createFeedVersion(feed)
    const round: StoredRound = {
      id: crypto.randomUUID(), sequence: existing.length + 1, createdAt: new Date().toISOString(),
      startMessageId: selection.messages[0].id, endMessageId: selection.messages.at(-1)!.id,
      startIndex: selection.messages[0].index, endIndex: selection.messages.at(-1)!.index,
      messageCount: selection.messages.length, messages: selection.messages,
      feedVersions: [feedVersion], activeFeedVersionId: feedVersion.id,
    }
    await queueStoreWrite(userId, async () => {
      throwIfAborted(active)
      const latest = await loadStore(userId)
      throwIfAborted(active)
      const continuity = latest.chats[selection.chat.id] ?? {
        chatId: selection.chat.id,
        chatName: selection.chat.name,
        fandomNotes: '',
        rounds: [],
      }
      const latestUsed = new Set(continuity.rounds.flatMap((item) => item.messages.map((message) => message.id)))
      if (selection.messages.some((message) => latestUsed.has(message.id))) throw new Error('This range was added to continuity while generation was running.')
      round.sequence = continuity.rounds.length + 1
      continuity.chatName = selection.chat.name; continuity.rounds.push(round); latest.chats[selection.chat.id] = continuity
      pruneInactiveFeedVersions(continuity.rounds, latest.settings)
      await saveStore(latest, userId)
    })
    await finishSuccessfulGeneration(
      selection.chat.id,
      round.id,
      `Round ${round.sequence} generated from messages ${round.startIndex}-${round.endIndex}.`,
      userId,
    )
  } finally {
    endGeneration(userId, active)
  }
}

async function regenerateThread(
  chatId: string,
  roundId: string,
  fandomNotes: string | undefined,
  userId: string,
): Promise<void> {
  const active = beginGeneration(userId, chatId, 'regenerate', roundId)
  try {
    const store = await loadStore(userId)
    throwIfAborted(active)
    const continuity = store.chats[chatId]
    const index = continuity?.rounds.findIndex((round) => round.id === roundId) ?? -1
    if (!continuity || index < 0) throw new Error('That continuity round no longer exists.')
    const round = continuity.rounds[index]
    const feed = await runGeneration(
      store,
      chatId,
      round.messages,
      index,
      userId,
      'regenerate',
      active,
      roundId,
      fandomNotes,
    )
    throwIfAborted(active)
    const feedVersion = createFeedVersion(feed)
    await queueStoreWrite(userId, async () => {
      throwIfAborted(active)
      const latest = await loadStore(userId)
      throwIfAborted(active)
      const target = latest.chats[chatId]?.rounds.find((item) => item.id === roundId)
      if (!target) throw new Error('That continuity round was removed while generation was running.')
      target.feedVersions.push(feedVersion)
      target.activeFeedVersionId = feedVersion.id
      await saveStore(latest, userId)
    })
    await finishSuccessfulGeneration(chatId, roundId, `Round ${round.sequence} regenerated.`, userId)
  } finally {
    endGeneration(userId, active)
  }
}

async function selectRoundFeedVersion(
  chatId: string,
  roundId: string,
  versionId: string,
  userId: string,
): Promise<void> {
  const activeChat = await spindle.chats.getActive(userId)
  if (!activeChat || activeChat.id !== chatId) throw new Error('The active chat changed. Refresh Threadverse and try again.')
  await queueStoreWrite(userId, async () => {
    const store = await loadStore(userId)
    const round = store.chats[chatId]?.rounds.find((candidate) => candidate.id === roundId)
    if (!round) throw new Error('That continuity round no longer exists.')
    if (!selectFeedVersion(round, versionId)) throw new Error('That thread version no longer exists.')
    await saveStore(store, userId)
  })
  await finishSuccessfulMutation('select_feed_version', chatId, undefined, userId)
}

async function deleteRoundFeedVersion(
  chatId: string,
  roundId: string,
  versionId: string,
  userId: string,
): Promise<void> {
  const activeChat = await spindle.chats.getActive(userId)
  if (!activeChat || activeChat.id !== chatId) throw new Error('The active chat changed. Refresh Threadverse and try again.')
  await queueStoreWrite(userId, async () => {
    const store = await loadStore(userId)
    const round = store.chats[chatId]?.rounds.find((candidate) => candidate.id === roundId)
    if (!round) throw new Error('That continuity round no longer exists.')
    if (!removeFeedVersion(round, versionId)) throw new Error('The current thread version cannot be deleted.')
    await saveStore(store, userId)
  })
  await finishSuccessfulMutation('delete_feed_version', chatId, undefined, userId)
}

async function deleteRound(chatId: string, roundId: string, userId: string): Promise<void> {
  const activeChat = await spindle.chats.getActive(userId)
  if (!activeChat || activeChat.id !== chatId) throw new Error('The active chat changed. Refresh Threadverse and try again.')
  let deletedSequence = 0
  await queueStoreWrite(userId, async () => {
    const store = await loadStore(userId)
    const continuity = store.chats[chatId]
    const index = continuity?.rounds.findIndex((round) => round.id === roundId) ?? -1
    if (!continuity || index < 0) throw new Error('That continuity round no longer exists.')
    deletedSequence = continuity.rounds[index].sequence
    continuity.rounds.splice(index, 1)
    continuity.rounds.forEach((round, roundIndex) => { round.sequence = roundIndex + 1 })
    if (continuity.rounds.length === 0 && !continuity.fandomNotes.trim()) delete store.chats[chatId]
    await saveStore(store, userId)
  })
  await finishSuccessfulMutation(
    'delete_round',
    chatId,
    `Round ${deletedSequence} deleted.`,
    userId,
  )
}

async function resetContinuity(chatId: string, userId: string): Promise<void> {
  const activeChat = await spindle.chats.getActive(userId)
  if (!activeChat || activeChat.id !== chatId) throw new Error('The active chat changed. Refresh Threadverse and try again.')
  cancelActiveGeneration(userId)
  await queueStoreWrite(userId, async () => { const store = await loadStore(userId); delete store.chats[chatId]; await saveStore(store, userId) })
  await finishSuccessfulMutation('reset_continuity', chatId, 'Continuity reset for this chat.', userId)
}

async function saveFandomNotes(
  chatId: string,
  chatName: string,
  notes: string,
  userId: string,
): Promise<void> {
  if (!chatId || typeof chatName !== 'string' || typeof notes !== 'string') {
    throw new Error('Invalid fandom notes payload.')
  }
  await queueStoreWrite(userId, async () => {
    const store = await loadStore(userId)
    const continuity = store.chats[chatId] ?? { chatId, chatName, fandomNotes: '', rounds: [] }
    continuity.chatName = chatName || continuity.chatName
    continuity.fandomNotes = notes
    if (continuity.rounds.length === 0 && !notes.trim()) delete store.chats[chatId]
    else store.chats[chatId] = continuity
    await saveStore(store, userId)
  })
  send({ type: 'threadverse:fandom_notes_save_result', chatId, notes }, userId)
}

spindle.onFrontendMessage(async (payload: unknown, userId: string) => {
  if (!isFrontendMessage(payload)) return
  try {
    if (payload.type === 'threadverse:load_active_chat') {
      await sendActiveChat(userId, undefined, undefined, payload.requestId)
      return
    }
    if (payload.type === 'threadverse:load_settings') { await sendSettingsState(userId); return }
    if (payload.type === 'threadverse:auto_save_settings') { await saveAutomaticSettings(payload.settings, userId); return }
    if (payload.type === 'threadverse:save_prompt') { await savePromptSettings(payload.settings, userId); return }
    if (payload.type === 'threadverse:save_fandom_notes') {
      await saveFandomNotes(payload.chatId, payload.chatName, payload.notes, userId)
      return
    }
    if (payload.type === 'threadverse:request_instruction_preset_name') {
      const result = await spindle.prompt.input({ title: 'New instruction preset', message: 'Save the current instructions as a new preset.', placeholder: 'Preset name...', submitLabel: 'Create', userId })
      const name = result.cancelled || !result.value ? null : result.value.trim()
      if (name && payload.existingNames.some((item) => item.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        spindle.toast.error(`A preset named "${name}" already exists.`, { userId }); send({ type: 'threadverse:instruction_preset_name', name: null }, userId); return
      }
      send({ type: 'threadverse:instruction_preset_name', name }, userId); return
    }
    if (payload.type === 'threadverse:open_instruction_editor') {
      const result = await spindle.textEditor.open({ title: 'Instructions', value: payload.value, placeholder: 'Describe how the fictional fandom should discuss the story...', userId })
      send({ type: 'threadverse:instruction_editor_result', presetId: payload.presetId, text: result.text, cancelled: result.cancelled }, userId); return
    }
    if (payload.type === 'threadverse:generate_thread') { await generateThread(payload, userId); return }
    if (payload.type === 'threadverse:regenerate_thread') {
      await regenerateThread(payload.chatId, payload.roundId, payload.fandomNotes, userId)
      return
    }
    if (payload.type === 'threadverse:select_feed_version') { await selectRoundFeedVersion(payload.chatId, payload.roundId, payload.versionId, userId); return }
    if (payload.type === 'threadverse:delete_feed_version') { await deleteRoundFeedVersion(payload.chatId, payload.roundId, payload.versionId, userId); return }
    if (payload.type === 'threadverse:delete_round') { await deleteRound(payload.chatId, payload.roundId, userId); return }
    if (payload.type === 'threadverse:cancel_generation') { cancelActiveGeneration(userId); return }
    if (payload.type === 'threadverse:copy_result') {
      if (payload.success) spindle.toast.success('Thread copied to clipboard.', { userId })
      else spindle.toast.error('Threadverse could not copy the thread.', { userId })
      return
    }
    await resetContinuity(payload.chatId, userId)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Threadverse could not complete the operation.'
    spindle.log.error(`[Threadverse] ${message}`)
    if (payload.type === 'threadverse:load_settings') {
      spindle.toast.error(message, { userId })
      try {
        await sendSettingsState(userId)
      } catch {
        send({ type: 'threadverse:operation_error', error: message }, userId)
      }
      return
    }
    if (payload.type === 'threadverse:auto_save_settings' || payload.type === 'threadverse:save_prompt') {
      const scope = payload.type === 'threadverse:save_prompt' ? 'prompt' : 'automatic'; spindle.toast.error(message, { userId }); send({ type: 'threadverse:settings_save_result', scope, error: message }, userId); return
    }
    if (payload.type === 'threadverse:save_fandom_notes') {
      spindle.toast.error(message, { userId })
      send({
        type: 'threadverse:fandom_notes_save_result',
        chatId: payload.chatId,
        notes: payload.notes,
        error: message,
      }, userId)
      return
    }
    if (payload.type === 'threadverse:generate_thread' || payload.type === 'threadverse:regenerate_thread') {
      const cancelled = error instanceof Error && error.name === 'AbortError'
      // cancelActiveGeneration already notified the frontend. Avoid a delayed
      // duplicate cancellation clearing a newer generation for the same chat.
      if (cancelled) return
      spindle.toast.error(message, { userId })
      send({
        type: 'threadverse:generation_state',
        status: 'error',
        chatId: payload.chatId,
      }, userId); return
    }
    if (
      payload.type === 'threadverse:select_feed_version'
      || payload.type === 'threadverse:delete_feed_version'
      || payload.type === 'threadverse:reset_continuity'
      || payload.type === 'threadverse:delete_round'
    ) {
      spindle.toast.error(message, { userId })
      send({ type: 'threadverse:operation_error', error: message }, userId)
      return
    }
    spindle.toast.error(message, { userId }); send({ type: 'threadverse:operation_error', error: message }, userId)
  }
})

spindle.permissions.onChanged(({ permission, granted }) => spindle.log.info(`[Threadverse] Permission ${permission} ${granted ? 'granted' : 'revoked'}`))
spindle.log.info('[Threadverse] Backend ready')
