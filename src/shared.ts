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
  maxOutputTokens: number | null
  temperature: number | null
  topP: number | null
  previousRangeLimit: number | null
  fandomThreadLimit: number | null
  maintainFandomContinuity: boolean
  instructionPresets: InstructionPreset[]
  activeInstructionPresetId: string
}

export type ThreadverseAutomaticSettings = Pick<ThreadverseSettingsPayload,
  | 'connectionId'
  | 'maxOutputTokens'
  | 'temperature'
  | 'topP'
  | 'previousRangeLimit'
  | 'fandomThreadLimit'
  | 'maintainFandomContinuity'
>

export type ThreadversePromptSettings = Pick<ThreadverseSettingsPayload,
  | 'instructionPresets'
  | 'activeInstructionPresetId'
>

export interface InstructionPreset {
  id: string
  name: string
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
  | { type: 'threadverse:auto_save_settings'; settings: ThreadverseAutomaticSettings }
  | { type: 'threadverse:save_prompt'; settings: ThreadversePromptSettings }
  | { type: 'threadverse:request_instruction_preset_name'; existingNames: string[] }
  | { type: 'threadverse:open_instruction_editor'; presetId: string; value: string }
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
  | { type: 'threadverse:instruction_preset_name'; name: string | null }
  | { type: 'threadverse:settings_save_result'; scope: 'automatic' | 'prompt'; error?: string }
  | {
      type: 'threadverse:instruction_editor_result'
      presetId: string
      text: string
      cancelled: boolean
    }

export function isFrontendMessage(value: unknown): value is FrontendToBackendMessage {
  if (!value || typeof value !== 'object') return false
  const type = (value as { type?: unknown }).type
  return type === 'threadverse:get_status'
    || type === 'threadverse:load_active_chat'
    || type === 'threadverse:load_settings'
    || type === 'threadverse:auto_save_settings'
    || type === 'threadverse:save_prompt'
    || type === 'threadverse:request_instruction_preset_name'
    || type === 'threadverse:open_instruction_editor'
    || type === 'threadverse:save_range'
    || type === 'threadverse:reset_continuity'
}
