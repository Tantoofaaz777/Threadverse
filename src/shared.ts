export type ThreadverseTab = 'feed' | 'make' | 'settings'

export interface ChatMessageSummary {
  id: string
  index: number
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type FrontendToBackendMessage =
  | { type: 'threadverse:get_status' }
  | { type: 'threadverse:load_active_chat' }

export type BackendToFrontendMessage =
  | {
      type: 'threadverse:status'
      grantedPermissions: string[]
    }
  | {
      type: 'threadverse:active_chat'
      chat: { id: string; name: string } | null
      messages: ChatMessageSummary[]
      error?: string
    }

export function isFrontendMessage(value: unknown): value is FrontendToBackendMessage {
  if (!value || typeof value !== 'object') return false
  const type = (value as { type?: unknown }).type
  return type === 'threadverse:get_status' || type === 'threadverse:load_active_chat'
}

