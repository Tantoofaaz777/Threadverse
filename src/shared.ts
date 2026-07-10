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

export interface ThreadverseSettingsPayload {
  connectionId: string | null
  model: string
  maxOutputTokens: number
  temperature: number
  topP: number
  previousRangeLimit: number
  fandomThreadLimit: number
  maintainFandomContinuity: boolean
  instructions: string
}

export interface ConnectionSummary {
  id: string
  name: string
  provider: string
  model: string
  isDefault: boolean
}

export type FrontendToBackendMessage =
  | { type: 'threadverse:get_status' }
  | { type: 'threadverse:load_active_chat' }
  | { type: 'threadverse:load_settings' }
  | { type: 'threadverse:save_settings'; settings: ThreadverseSettingsPayload }
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
  | {
      type: 'threadverse:settings_state'
      settings: ThreadverseSettingsPayload
      defaultInstructions: string
      connections: ConnectionSummary[]
      notice?: string
      error?: string
    }

export function isFrontendMessage(value: unknown): value is FrontendToBackendMessage {
  if (!value || typeof value !== 'object') return false
  const type = (value as { type?: unknown }).type
  return type === 'threadverse:get_status'
    || type === 'threadverse:load_active_chat'
    || type === 'threadverse:load_settings'
    || type === 'threadverse:save_settings'
    || type === 'threadverse:save_range'
    || type === 'threadverse:reset_continuity'
}
