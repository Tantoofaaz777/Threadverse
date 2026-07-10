import type {
  ChatMessageSummary,
  RoundSummary,
  ThreadverseSettingsPayload,
} from './shared'

export interface StoredRound extends Omit<RoundSummary, 'messageIds'> {
  messages: ChatMessageSummary[]
  feed: null
}

export interface ChatContinuity {
  chatId: string
  chatName: string
  rounds: StoredRound[]
}

export type ThreadverseSettings = ThreadverseSettingsPayload

export interface ThreadverseStore {
  version: 1
  settings: ThreadverseSettings
  chats: Record<string, ChatContinuity>
}

export const DEFAULT_SETTINGS: ThreadverseSettings = {
  connectionId: null,
  maxOutputTokens: null,
  temperature: null,
  topP: null,
  previousRangeLimit: 3,
  fandomThreadLimit: 3,
  maintainFandomContinuity: true,
  instructions: `You are simulating an online fandom discussing a fictional story as if it were an ongoing television series or serialized fanfiction.

Treat PREVIOUS CONTEXT as events the fandom already knows. Treat RECENT CONTEXT as the new material the current discussion should focus on. Use FANDOM CONTINUITY to preserve recurring usernames, theories, opinions, jokes, and disagreements from earlier threads.

Create a convincing Reddit-style discussion with a post title, an opening post, varied commenters, nested replies, votes, flairs, theories, jokes, criticism, shipping, and genuine disagreement where appropriate. Do not continue or rewrite the story itself. Discuss it as an audience would.`,
}

export const DEFAULT_INSTRUCTIONS = DEFAULT_SETTINGS.instructions

export const DEFAULT_SAMPLERS = {
  maxOutputTokens: 4096,
  temperature: 1,
  topP: 1,
} as const

export interface ResolvedSamplers {
  maxOutputTokens: number
  temperature: number
  topP: number
}

export function resolveSamplers(settings: ThreadverseSettings): ResolvedSamplers {
  return {
    maxOutputTokens: settings.maxOutputTokens ?? DEFAULT_SAMPLERS.maxOutputTokens,
    temperature: settings.temperature ?? DEFAULT_SAMPLERS.temperature,
    topP: settings.topP ?? DEFAULT_SAMPLERS.topP,
  }
}

export function emptyStore(): ThreadverseStore {
  return { version: 1, settings: { ...DEFAULT_SETTINGS }, chats: {} }
}

export function normalizeStore(value: unknown): ThreadverseStore {
  if (!value || typeof value !== 'object') return emptyStore()
  const candidate = value as Partial<ThreadverseStore>
  if (candidate.version !== 1 || !candidate.chats || typeof candidate.chats !== 'object') {
    return emptyStore()
  }
  const savedSettings = candidate.settings as Partial<ThreadverseSettings> & { model?: unknown } | undefined
  const { model: _legacyModel, ...savedWithoutLegacyModel } = savedSettings ?? {}
  const mergedSettings = {
    ...DEFAULT_SETTINGS,
    ...savedWithoutLegacyModel,
  }

  // Version 0.3.0 stored the effective defaults as explicit values. Convert
  // those exact values to the new empty/placeholder representation.
  if (mergedSettings.maxOutputTokens === DEFAULT_SAMPLERS.maxOutputTokens) mergedSettings.maxOutputTokens = null
  if (mergedSettings.temperature === DEFAULT_SAMPLERS.temperature) mergedSettings.temperature = null
  if (mergedSettings.topP === DEFAULT_SAMPLERS.topP) mergedSettings.topP = null

  return {
    version: 1,
    settings: mergedSettings,
    chats: candidate.chats,
  }
}

export function summarizeRounds(rounds: StoredRound[]): RoundSummary[] {
  return rounds.map(({ messages, feed: _feed, ...summary }) => ({
    ...summary,
    messageIds: messages.map((message) => message.id),
  }))
}

export function selectPreviousRounds(store: ThreadverseStore, chatId: string): StoredRound[] {
  const rounds = store.chats[chatId]?.rounds ?? []
  return rounds.slice(-Math.max(0, store.settings.previousRangeLimit))
}
