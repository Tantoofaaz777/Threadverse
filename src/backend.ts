import {
  isFrontendMessage,
  type BackendToFrontendMessage,
  type ChatMessageSummary,
  type ConnectionSummary,
  type ThreadverseSettingsPayload,
} from './shared'
import {
  DEFAULT_INSTRUCTIONS,
  emptyStore,
  normalizeStore,
  summarizeRounds,
  type StoredRound,
  type ThreadverseStore,
} from './state'

declare const spindle: import('lumiverse-spindle-types').SpindleAPI

const STORE_PATH = 'threadverse-state.json'

function send(payload: BackendToFrontendMessage, userId: string): void {
  spindle.sendToFrontend(payload, userId)
}

async function loadStore(userId: string): Promise<ThreadverseStore> {
  const value = await spindle.userStorage.getJson<ThreadverseStore>(STORE_PATH, {
    fallback: emptyStore(),
    userId,
  })
  return normalizeStore(value)
}

async function saveStore(store: ThreadverseStore, userId: string): Promise<void> {
  await spindle.userStorage.setJson(STORE_PATH, store, { indent: 2, userId })
}

function hasChatPermissions(): boolean {
  return spindle.permissions.has('chats') && spindle.permissions.has('chat_mutation')
}

function toConnectionSummary(connection: {
  id: string
  name: string
  provider: string
  model: string
  is_default: boolean
}): ConnectionSummary {
  return {
    id: connection.id,
    name: connection.name,
    provider: connection.provider,
    model: connection.model,
    isDefault: connection.is_default,
  }
}

async function getConnections(userId: string): Promise<ConnectionSummary[]> {
  if (!spindle.permissions.has('generation')) return []
  return (await spindle.connections.list(userId)).map(toConnectionSummary)
}

async function sendSettingsState(
  userId: string,
  options?: { notice?: string; error?: string },
): Promise<void> {
  const [store, connections] = await Promise.all([
    loadStore(userId),
    getConnections(userId),
  ])
  const settings = { ...store.settings }
  const selectedConnection = connections.find((connection) => connection.id === settings.connectionId)
    ?? connections.find((connection) => connection.isDefault)
    ?? connections[0]

  if (!selectedConnection) {
    settings.connectionId = null
  } else if (!connections.some((connection) => connection.id === settings.connectionId)) {
    settings.connectionId = selectedConnection.id
  }

  send({
    type: 'threadverse:settings_state',
    settings,
    defaultInstructions: DEFAULT_INSTRUCTIONS,
    connections,
    notice: options?.notice,
    error: options?.error ?? (!spindle.permissions.has('generation')
      ? 'Grant the Generation permission to choose a Lumiverse connection and model.'
      : connections.length === 0
        ? 'No Lumiverse LLM connections are available.'
        : undefined),
  }, userId)
}

function requireNumber(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  integer = false,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a number.`)
  }
  if (value < minimum || value > maximum || (integer && !Number.isInteger(value))) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}${integer ? ' and use a whole number' : ''}.`)
  }
  return value
}

function optionalNumber(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  integer = false,
): number | null {
  if (value === null || value === undefined || value === '') return null
  return requireNumber(value, label, minimum, maximum, integer)
}

async function saveSettings(value: unknown, userId: string): Promise<void> {
  if (!value || typeof value !== 'object') throw new Error('Invalid settings payload.')
  if (!spindle.permissions.has('generation')) {
    throw new Error('Grant the Generation permission before saving model settings.')
  }

  const input = value as Partial<ThreadverseSettingsPayload>
  const connections = await getConnections(userId)
  const connection = connections.find((candidate) => candidate.id === input.connectionId)
  if (!connection) throw new Error('Choose an available Lumiverse connection.')

  const settings: ThreadverseSettingsPayload = {
    connectionId: connection.id,
    maxOutputTokens: optionalNumber(input.maxOutputTokens, 'Max output tokens', 1, 200000, true),
    temperature: optionalNumber(input.temperature, 'Temperature', 0, 5),
    topP: optionalNumber(input.topP, 'Top P', 0, 1),
    previousRangeLimit: requireNumber(input.previousRangeLimit, 'Previous story ranges', 0, 50, true),
    fandomThreadLimit: requireNumber(input.fandomThreadLimit, 'Previous fandom threads', 0, 50, true),
    maintainFandomContinuity: Boolean(input.maintainFandomContinuity),
    instructions: typeof input.instructions === 'string' ? input.instructions : '',
  }

  const store = await loadStore(userId)
  store.settings = settings
  await saveStore(store, userId)
  await sendSettingsState(userId, { notice: 'Settings saved.' })
}

async function sendActiveChat(userId: string, options?: { notice?: string; error?: string }): Promise<void> {
  if (!hasChatPermissions()) {
    send({
      type: 'threadverse:active_chat',
      chat: null,
      messages: [],
      rounds: [],
      error: 'Grant the Chats and Chat Mutation permissions to load roleplay messages.',
    }, userId)
    return
  }

  const activeChat = await spindle.chats.getActive(userId)
  if (!activeChat) {
    send({
      type: 'threadverse:active_chat',
      chat: null,
      messages: [],
      rounds: [],
      error: 'Open a roleplay chat, then refresh this list.',
    }, userId)
    return
  }

  const [messages, store] = await Promise.all([
    spindle.chat.getMessages(activeChat.id),
    loadStore(userId),
  ])
  const continuity = store.chats[activeChat.id]

  send({
    type: 'threadverse:active_chat',
    chat: { id: activeChat.id, name: activeChat.name },
    messages: messages.map((message, index) => ({
      id: message.id,
      index: index + 1,
      role: message.role,
      content: message.content,
    })),
    rounds: summarizeRounds(continuity?.rounds ?? []),
    error: options?.error,
    notice: options?.notice,
  }, userId)
}

async function saveRange(
  payload: Extract<import('./shared').FrontendToBackendMessage, { type: 'threadverse:save_range' }>,
  userId: string,
): Promise<void> {
  if (!hasChatPermissions()) {
    await sendActiveChat(userId)
    return
  }

  const activeChat = await spindle.chats.getActive(userId)
  if (!activeChat || activeChat.id !== payload.chatId) {
    throw new Error('The active chat changed. Refresh the message list and select the range again.')
  }

  const rawMessages = await spindle.chat.getMessages(activeChat.id)
  const startPosition = rawMessages.findIndex((message) => message.id === payload.startMessageId)
  const endPosition = rawMessages.findIndex((message) => message.id === payload.endMessageId)
  if (startPosition < 0 || endPosition < 0) {
    throw new Error('One or both selected messages no longer exist in the active chat.')
  }

  const first = Math.min(startPosition, endPosition)
  const last = Math.max(startPosition, endPosition)
  const selectedMessages: ChatMessageSummary[] = rawMessages
    .slice(first, last + 1)
    .map((message, offset) => ({
      id: message.id,
      index: first + offset + 1,
      role: message.role,
      content: message.content,
    }))

  const store = await loadStore(userId)
  const continuity = store.chats[activeChat.id] ?? {
    chatId: activeChat.id,
    chatName: activeChat.name,
    rounds: [],
  }
  const usedMessageIds = new Set(
    continuity.rounds.flatMap((storedRound) => storedRound.messages.map((message) => message.id)),
  )
  if (selectedMessages.some((message) => usedMessageIds.has(message.id))) {
    throw new Error('This range overlaps messages that already belong to a continuity round.')
  }

  const round: StoredRound = {
    id: crypto.randomUUID(),
    sequence: continuity.rounds.length + 1,
    createdAt: new Date().toISOString(),
    startMessageId: selectedMessages[0].id,
    endMessageId: selectedMessages.at(-1)!.id,
    startIndex: selectedMessages[0].index,
    endIndex: selectedMessages.at(-1)!.index,
    messageCount: selectedMessages.length,
    messages: selectedMessages,
    feed: null,
  }

  continuity.chatName = activeChat.name
  continuity.rounds.push(round)
  store.chats[activeChat.id] = continuity
  await saveStore(store, userId)
  await sendActiveChat(userId, {
    notice: `Range #${round.startIndex}–#${round.endIndex} saved as Round ${round.sequence}.`,
  })
}

async function resetContinuity(chatId: string, userId: string): Promise<void> {
  const activeChat = await spindle.chats.getActive(userId)
  if (!activeChat || activeChat.id !== chatId) {
    throw new Error('The active chat changed. Refresh Threadverse and try again.')
  }

  const store = await loadStore(userId)
  delete store.chats[chatId]
  await saveStore(store, userId)
  await sendActiveChat(userId, { notice: 'Continuity reset for this chat.' })
}

spindle.onFrontendMessage(async (payload: unknown, userId: string) => {
  if (!isFrontendMessage(payload)) return

  try {
    if (payload.type === 'threadverse:get_status') {
      const grantedPermissions = await spindle.permissions.getGranted()
      send({ type: 'threadverse:status', grantedPermissions }, userId)
      return
    }

    if (payload.type === 'threadverse:load_active_chat') {
      await sendActiveChat(userId)
      return
    }

    if (payload.type === 'threadverse:load_settings') {
      await sendSettingsState(userId)
      return
    }

    if (payload.type === 'threadverse:save_settings') {
      await saveSettings(payload.settings, userId)
      return
    }

    if (payload.type === 'threadverse:save_range') {
      await saveRange(payload, userId)
      return
    }

    await resetContinuity(payload.chatId, userId)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Threadverse could not complete the operation.'
    spindle.log.error(`[Threadverse] ${message}`)
    if (payload.type === 'threadverse:save_settings' || payload.type === 'threadverse:load_settings') {
      try {
        await sendSettingsState(userId, { error: message })
      } catch {
        send({ type: 'threadverse:operation_error', error: message }, userId)
      }
      return
    }
    if (payload.type === 'threadverse:save_range' || payload.type === 'threadverse:reset_continuity') {
      send({ type: 'threadverse:operation_error', error: message }, userId)
      return
    }
    try {
      await sendActiveChat(userId, { error: message })
    } catch {
      send({
        type: 'threadverse:active_chat',
        chat: null,
        messages: [],
        rounds: [],
        error: message,
      }, userId)
    }
  }
})

spindle.permissions.onChanged(({ permission, granted }) => {
  spindle.log.info(`[Threadverse] Permission ${permission} ${granted ? 'granted' : 'revoked'}`)
})

spindle.log.info('[Threadverse] Backend ready')
