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
  model: '',
  maxOutputTokens: 4096,
  temperature: 1,
  topP: 1,
  previousRangeLimit: 3,
  fandomThreadLimit: 3,
  maintainFandomContinuity: true,
  instructions: `You are simulating an online fandom discussing a fictional story as if it were an ongoing television series or serialized fanfiction.

Treat PREVIOUS CONTEXT as events the fandom already knows. Treat RECENT CONTEXT as the new material the current discussion should focus on. Use FANDOM CONTINUITY to preserve recurring usernames, theories, opinions, jokes, and disagreements from earlier threads.

Create a convincing Reddit-style discussion with a post title, an opening post, varied commenters, nested replies, votes, flairs, theories, jokes, criticism, shipping, and genuine disagreement where appropriate. Do not continue or rewrite the story itself. Discuss it as an audience would.`,
}

export const DEFAULT_INSTRUCTIONS = DEFAULT_SETTINGS.instructions

export function emptyStore(): ThreadverseStore {
  return { version: 1, settings: { ...DEFAULT_SETTINGS }, chats: {} }
}

export function normalizeStore(value: unknown): ThreadverseStore {
  if (!value || typeof value !== 'object') return emptyStore()
  const candidate = value as Partial<ThreadverseStore>
  if (candidate.version !== 1 || !candidate.chats || typeof candidate.chats !== 'object') {
    return emptyStore()
  }
  return {
    version: 1,
    settings: {
      ...DEFAULT_SETTINGS,
      ...(candidate.settings ?? {}),
    },
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
