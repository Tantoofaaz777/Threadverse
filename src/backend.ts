import {
  isFrontendMessage,
  type BackendToFrontendMessage,
} from './shared'

declare const spindle: import('lumiverse-spindle-types').SpindleAPI

function send(payload: BackendToFrontendMessage, userId?: string): void {
  spindle.sendToFrontend(payload, userId)
}

spindle.onFrontendMessage(async (payload: unknown, userId?: string) => {
  if (!isFrontendMessage(payload)) return

  if (payload.type === 'threadverse:get_status') {
    const grantedPermissions = await spindle.permissions.getGranted()
    send({ type: 'threadverse:status', grantedPermissions }, userId)
    return
  }

  if (!spindle.permissions.has('chats') || !spindle.permissions.has('chat_mutation')) {
    send({
      type: 'threadverse:active_chat',
      chat: null,
      messages: [],
      error: 'Grant the Chats and Chat Mutation permissions to load roleplay messages.',
    }, userId)
    return
  }

  try {
    const activeChat = await spindle.chats.getActive()
    if (!activeChat) {
      send({
        type: 'threadverse:active_chat',
        chat: null,
        messages: [],
        error: 'Open a roleplay chat, then refresh this list.',
      }, userId)
      return
    }

    const messages = await spindle.chat.getMessages(activeChat.id)
    send({
      type: 'threadverse:active_chat',
      chat: { id: activeChat.id, name: activeChat.name },
      messages: messages.map((message, index) => ({
        id: message.id,
        index: index + 1,
        role: message.role,
        content: message.content,
      })),
    }, userId)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load the active chat.'
    spindle.log.error(`[Threadverse] ${message}`)
    send({
      type: 'threadverse:active_chat',
      chat: null,
      messages: [],
      error: message,
    }, userId)
  }
})

spindle.permissions.onChanged(({ permission, granted }) => {
  spindle.log.info(`[Threadverse] Permission ${permission} ${granted ? 'granted' : 'revoked'}`)
})

spindle.log.info('[Threadverse] Backend ready')

