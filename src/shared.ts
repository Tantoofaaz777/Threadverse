export const DEFAULT_FEED_FONT_SCALE = 100
export const MIN_FEED_FONT_SCALE = 100
export const MAX_FEED_FONT_SCALE = 160

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
  username: string
  body: string
  score: number
  replies: ThreadverseComment[]
}

export interface ThreadverseFeed {
  title: string
  post: {
    username: string
    body: string
    score: number
  }
  comments: ThreadverseComment[]
}

export interface FeedVersion {
  id: string
  createdAt: string
  feed: ThreadverseFeed
}

export interface FeedRound extends RoundSummary {
  feedVersions: FeedVersion[]
  activeFeedVersionId: string | null
}

export interface ThreadverseSettingsPayload {
  connectionId: string | null
  maxOutputTokens: number | null
  temperature: number | null
  topP: number | null
  previousRangeLimit: number | null
  fandomThreadLimit: number | null
  maintainFandomContinuity: boolean
  feedFontScale: number
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
  | 'feedFontScale'
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
  | { type: 'threadverse:load_active_chat'; requestId: number }
  | { type: 'threadverse:load_settings' }
  | { type: 'threadverse:auto_save_settings'; settings: ThreadverseAutomaticSettings }
  | { type: 'threadverse:save_prompt'; settings: ThreadversePromptSettings }
  | { type: 'threadverse:save_fandom_notes'; chatId: string; chatName: string; notes: string }
  | { type: 'threadverse:request_instruction_preset_name'; existingNames: string[] }
  | { type: 'threadverse:open_instruction_editor'; presetId: string; value: string }
  | {
      type: 'threadverse:open_fandom_notes_editor'
      chatId: string
      chatName: string
      value: string
    }
  | {
      type: 'threadverse:generate_thread'
      chatId: string
      startMessageId: string
      endMessageId: string
      fandomNotes?: string
    }
  | { type: 'threadverse:regenerate_thread'; chatId: string; roundId: string; fandomNotes?: string }
  | { type: 'threadverse:select_feed_version'; chatId: string; roundId: string; versionId: string }
  | { type: 'threadverse:delete_feed_version'; chatId: string; roundId: string; versionId: string }
  | { type: 'threadverse:delete_round'; chatId: string; roundId: string }
  | { type: 'threadverse:cancel_generation' }
  | { type: 'threadverse:reset_continuity'; chatId: string; fandomNotes?: string }
  | { type: 'threadverse:copy_result'; success: boolean }

export type BackendToFrontendMessage =
  | {
      type: 'threadverse:active_chat'
      chat: { id: string; name: string } | null
      messages: ChatMessageSummary[]
      rounds: RoundSummary[]
      feedRounds: FeedRound[]
      fandomNotes: string
      requestId?: number
      error?: string
      notice?: string
    }
  | { type: 'threadverse:operation_error'; error: string }
  | {
      type: 'threadverse:mutation_completed'
      operation: 'select_feed_version' | 'delete_feed_version' | 'delete_round' | 'reset_continuity'
      chatId: string
    }
  | {
      type: 'threadverse:generation_state'
      status: 'started' | 'progress' | 'completed' | 'cancelled' | 'error'
      chatId: string
      operation?: 'generate' | 'regenerate'
      roundId?: string
      outputTokens?: number
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
  | { type: 'threadverse:fandom_notes_save_result'; chatId: string; notes: string; error?: string }
  | {
      type: 'threadverse:instruction_editor_result'
      presetId: string
      text: string
      cancelled: boolean
    }
  | {
      type: 'threadverse:fandom_notes_editor_result'
      chatId: string
      chatName: string
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
    || type === 'threadverse:save_fandom_notes'
    || type === 'threadverse:request_instruction_preset_name'
    || type === 'threadverse:open_instruction_editor'
    || type === 'threadverse:open_fandom_notes_editor'
    || type === 'threadverse:generate_thread'
    || type === 'threadverse:regenerate_thread'
    || type === 'threadverse:select_feed_version'
    || type === 'threadverse:delete_feed_version'
    || type === 'threadverse:delete_round'
    || type === 'threadverse:cancel_generation'
    || type === 'threadverse:reset_continuity'
    || type === 'threadverse:copy_result'
}
