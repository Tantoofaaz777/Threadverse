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

export interface ThreadverseComment {
  id: string
  username: string
  body: string
  score: number
  flair: string | null
  timestamp: string | null
  replies: ThreadverseComment[]
}

export interface ThreadverseFeed {
  subreddit: string
  title: string
  post: {
    username: string
    body: string
    score: number
    flair: string | null
    timestamp: string | null
  }
  comments: ThreadverseComment[]
}

export interface FeedRound extends RoundSummary {
  feed: ThreadverseFeed | null
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
  | { type: 'threadverse:load_active_chat' }
  | { type: 'threadverse:load_settings' }
  | { type: 'threadverse:auto_save_settings'; settings: ThreadverseAutomaticSettings }
  | { type: 'threadverse:save_prompt'; settings: ThreadversePromptSettings }
  | { type: 'threadverse:request_instruction_preset_name'; existingNames: string[] }
  | { type: 'threadverse:open_instruction_editor'; presetId: string; value: string }
  | {
      type: 'threadverse:generate_thread'
      chatId: string
      startMessageId: string
      endMessageId: string
    }
  | { type: 'threadverse:regenerate_thread'; chatId: string; roundId: string }
  | { type: 'threadverse:delete_round'; chatId: string; roundId: string }
  | { type: 'threadverse:cancel_generation' }
  | { type: 'threadverse:reset_continuity'; chatId: string }

export type BackendToFrontendMessage =
  | {
      type: 'threadverse:active_chat'
      chat: { id: string; name: string } | null
      messages: ChatMessageSummary[]
      rounds: RoundSummary[]
      feedRounds: FeedRound[]
      error?: string
      notice?: string
    }
  | { type: 'threadverse:operation_error'; error: string }
  | {
      type: 'threadverse:mutation_completed'
      operation: 'delete_round' | 'reset_continuity'
      chatId: string
    }
  | {
      type: 'threadverse:generation_state'
      status: 'started' | 'completed' | 'cancelled' | 'error'
      chatId: string
      roundId?: string
      error?: string
    }
  | {
      type: 'threadverse:settings_state'
      settings: ThreadverseSettingsPayload
      defaultInstructions: string
      connections: ConnectionSummary[]
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
  return type === 'threadverse:load_active_chat'
    || type === 'threadverse:load_settings'
    || type === 'threadverse:auto_save_settings'
    || type === 'threadverse:save_prompt'
    || type === 'threadverse:request_instruction_preset_name'
    || type === 'threadverse:open_instruction_editor'
    || type === 'threadverse:generate_thread'
    || type === 'threadverse:regenerate_thread'
    || type === 'threadverse:delete_round'
    || type === 'threadverse:cancel_generation'
    || type === 'threadverse:reset_continuity'
}
