import type { ChatMessageSummary, RoundSummary } from './shared'

export interface StoredRound extends RoundSummary {
  messages: ChatMessageSummary[]
  feed: null
}

export interface ChatContinuity {
  chatId: string
  chatName: string
  rounds: StoredRound[]
}

export interface ThreadverseSettings {
  previousRangeLimit: number
  fandomThreadLimit: number
  maintainFandomContinuity: boolean
}

export interface ThreadverseStore {
  version: 1
  settings: ThreadverseSettings
  chats: Record<string, ChatContinuity>
}

export const DEFAULT_SETTINGS: ThreadverseSettings = {
  previousRangeLimit: 3,
  fandomThreadLimit: 3,
  maintainFandomContinuity: true,
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
  return rounds.map(({ messages: _messages, feed: _feed, ...summary }) => summary)
}

export function selectPreviousRounds(store: ThreadverseStore, chatId: string): StoredRound[] {
  const rounds = store.chats[chatId]?.rounds ?? []
  return rounds.slice(-Math.max(0, store.settings.previousRangeLimit))
}
