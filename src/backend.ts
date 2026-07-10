import {
  isFrontendMessage,
  type BackendToFrontendMessage,
  type ChatMessageSummary,
} from './shared'
import {
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

    if (payload.type === 'threadverse:save_range') {
      await saveRange(payload, userId)
      return
    }

    await resetContinuity(payload.chatId, userId)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Threadverse could not complete the operation.'
    spindle.log.error(`[Threadverse] ${message}`)
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
