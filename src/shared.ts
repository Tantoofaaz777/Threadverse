export type ThreadverseTab = 'feed' | 'make' | 'settings'

export interface ChatMessageSummary {
  id: string
  index: number
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface RoundSummary {
  id: string
  sequence: number
  createdAt: string
  startMessageId: string
  endMessageId: string
  startIndex: number
  endIndex: number
  messageCount: number
  messageIds: string[]
}

export type FrontendToBackendMessage =
  | { type: 'threadverse:get_status' }
  | { type: 'threadverse:load_active_chat' }
  | {
      type: 'threadverse:save_range'
      chatId: string
      startMessageId: string
      endMessageId: string
    }
  | { type: 'threadverse:reset_continuity'; chatId: string }

export type BackendToFrontendMessage =
  | {
      type: 'threadverse:status'
      grantedPermissions: string[]
    }
  | {
      type: 'threadverse:active_chat'
      chat: { id: string; name: string } | null
      messages: ChatMessageSummary[]
      rounds: RoundSummary[]
      error?: string
      notice?: string
    }
  | { type: 'threadverse:operation_error'; error: string }

export function isFrontendMessage(value: unknown): value is FrontendToBackendMessage {
  if (!value || typeof value !== 'object') return false
  const type = (value as { type?: unknown }).type
  return type === 'threadverse:get_status'
    || type === 'threadverse:load_active_chat'
    || type === 'threadverse:save_range'
    || type === 'threadverse:reset_continuity'
}
