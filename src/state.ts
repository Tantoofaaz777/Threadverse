import {
  DEFAULT_FEED_FONT_SCALE,
  MAX_FEED_FONT_SCALE,
  MIN_FEED_FONT_SCALE,
  type ChatMessageSummary,
  type FeedVersion,
  type InstructionPreset,
  type RoundSummary,
  type ThreadverseAutomaticSettings,
  type ThreadversePromptSettings,
  type ThreadverseSettingsPayload,
  type ThreadverseFeed,
} from './shared'
import { parseThreadverseFeed } from './feed'

const LEGACY_DEFAULT_INSTRUCTIONS = `You are simulating an online fandom discussing a fictional story as if it were an ongoing television series or serialized fanfiction.

Treat PREVIOUS CONTEXT as events the fandom already knows. Treat RECENT CONTEXT as the new material the current discussion should focus on. Use FANDOM CONTINUITY to preserve recurring usernames, theories, opinions, jokes, and disagreements from earlier threads.

Create a convincing Reddit-style discussion with a post title, an opening post, varied commenters, nested replies, votes, flairs, theories, jokes, criticism, shipping, and genuine disagreement where appropriate. Do not continue or rewrite the story itself. Discuss it as an audience would.`

const CURRENT_DEFAULT_INSTRUCTIONS = LEGACY_DEFAULT_INSTRUCTIONS.replace('votes, flairs, theories', 'votes, theories')

export interface StoredRound extends Omit<RoundSummary, 'messageIds'> {
  messages: ChatMessageSummary[]
  feedVersions: FeedVersion[]
  activeFeedVersionId: string | null
}

export interface ChatContinuity {
  chatId: string
  chatName: string
  fandomNotes: string
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
  previousRangeLimit: null,
  fandomThreadLimit: null,
  maintainFandomContinuity: true,
  feedFontScale: DEFAULT_FEED_FONT_SCALE,
  instructionPresets: [{
    id: 'default',
    name: 'Default',
    instructions: CURRENT_DEFAULT_INSTRUCTIONS,
  }],
  activeInstructionPresetId: 'default',
}

export const DEFAULT_INSTRUCTIONS = DEFAULT_SETTINGS.instructionPresets[0].instructions

export const DEFAULT_SAMPLERS = {
  maxOutputTokens: 4096,
  temperature: 1,
  topP: 1,
} as const

export const DEFAULT_CONTINUITY = {
  previousRangeLimit: 3,
  fandomThreadLimit: 3,
} as const

export interface ResolvedContinuity {
  previousRangeLimit: number
  fandomThreadLimit: number
}

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

export function resolveContinuity(settings: ThreadverseSettings): ResolvedContinuity {
  return {
    previousRangeLimit: settings.previousRangeLimit ?? DEFAULT_CONTINUITY.previousRangeLimit,
    fandomThreadLimit: settings.fandomThreadLimit ?? DEFAULT_CONTINUITY.fandomThreadLimit,
  }
}

export function applyAutomaticSettings(
  current: ThreadverseSettings,
  automatic: ThreadverseAutomaticSettings,
): ThreadverseSettings {
  return { ...current, ...automatic }
}

export function applyPromptSettings(
  current: ThreadverseSettings,
  prompt: ThreadversePromptSettings,
): ThreadverseSettings {
  return {
    ...current,
    instructionPresets: prompt.instructionPresets.map((preset) => ({ ...preset })),
    activeInstructionPresetId: prompt.activeInstructionPresetId,
  }
}

function cloneDefaultPresets(): InstructionPreset[] {
  return DEFAULT_SETTINGS.instructionPresets.map((preset) => ({ ...preset }))
}

export function emptyStore(): ThreadverseStore {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS, instructionPresets: cloneDefaultPresets() },
    chats: {},
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function storedOptionalNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  integer = false,
): number | null {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= minimum
    && value <= maximum
    && (!integer || Number.isInteger(value))
    ? value
    : null
}

function normalizeStoredMessage(value: unknown): ChatMessageSummary | null {
  if (!isRecord(value)) return null
  const role = value.role
  if (role !== 'system' && role !== 'user' && role !== 'assistant') return null
  if (typeof value.id !== 'string' || !value.id || typeof value.content !== 'string') return null
  if (typeof value.index !== 'number' || !Number.isInteger(value.index) || value.index < 1) return null
  return { id: value.id, index: value.index, role, content: value.content }
}

function normalizeStoredFeed(value: unknown): ThreadverseFeed | null {
  if (!isRecord(value)) return null
  try {
    return parseThreadverseFeed(JSON.stringify(value))
  } catch {
    return null
  }
}

function normalizeStoredFeedVersions(
  value: Record<string, unknown>,
  roundId: string,
  roundCreatedAt: string,
): FeedVersion[] {
  const seenIds = new Set<string>()
  const versions = Array.isArray(value.feedVersions)
    ? value.feedVersions.flatMap((candidate, index): FeedVersion[] => {
        if (!isRecord(candidate)) return []
        const feed = normalizeStoredFeed(candidate.feed)
        if (!feed) return []
        const requestedId = typeof candidate.id === 'string' && candidate.id
          ? candidate.id
          : `${roundId}-feed-${index + 1}`
        let id = requestedId
        let suffix = 2
        while (seenIds.has(id)) {
          id = `${requestedId}-recovered-${suffix}`
          suffix += 1
        }
        seenIds.add(id)
        return [{
          id,
          createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : roundCreatedAt,
          feed,
        }]
      })
    : []

  if (versions.length > 0) return versions
  const legacyFeed = normalizeStoredFeed(value.feed)
  return legacyFeed ? [{ id: `${roundId}-feed-1`, createdAt: roundCreatedAt, feed: legacyFeed }] : []
}

function normalizeStoredRound(value: unknown, sequence: number): StoredRound | null {
  if (!isRecord(value) || !Array.isArray(value.messages)) return null
  const messages = value.messages.map(normalizeStoredMessage).filter((message): message is ChatMessageSummary => Boolean(message))
  if (messages.length === 0) return null
  const first = messages[0]
  const last = messages.at(-1)!
  const id = typeof value.id === 'string' && value.id ? value.id : `recovered-round-${sequence}-${first.id}`
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : new Date(0).toISOString()
  const feedVersions = normalizeStoredFeedVersions(value, id, createdAt)
  const requestedActiveVersionId = value.activeFeedVersionId
  const activeFeedVersionId = typeof requestedActiveVersionId === 'string'
    && feedVersions.some((version) => version.id === requestedActiveVersionId)
    ? requestedActiveVersionId
    : feedVersions.at(-1)?.id ?? null
  return {
    id,
    sequence,
    createdAt,
    startMessageId: first.id,
    endMessageId: last.id,
    startIndex: first.index,
    endIndex: last.index,
    messageCount: messages.length,
    messages,
    feedVersions,
    activeFeedVersionId,
  }
}

function normalizeStoredChats(value: unknown): Record<string, ChatContinuity> {
  if (!isRecord(value)) return {}
  const chats: Record<string, ChatContinuity> = Object.create(null) as Record<string, ChatContinuity>
  for (const [chatKey, rawChat] of Object.entries(value)) {
    if (!isRecord(rawChat) || !Array.isArray(rawChat.rounds)) continue
    const existingChatId = typeof rawChat.chatId === 'string' && rawChat.chatId ? rawChat.chatId : chatKey
    const existing = existingChatId ? chats[existingChatId] : undefined
    const fandomNotes = typeof rawChat.fandomNotes === 'string'
      ? rawChat.fandomNotes
      : existing?.fandomNotes ?? ''
    const recoveredRounds = rawChat.rounds
      .map((round, index) => normalizeStoredRound(round, index + 1))
      .filter((round): round is StoredRound => Boolean(round))
    if (recoveredRounds.length === 0 && !fandomNotes.trim()) continue
    const chatId = existingChatId
    if (!chatId) continue
    const rounds = existing ? [...existing.rounds, ...recoveredRounds] : recoveredRounds
    const usedRoundIds = new Set<string>()
    const uniqueRounds = rounds.map((round, index) => {
      let id = round.id
      let suffix = 2
      while (usedRoundIds.has(id)) {
        id = `${round.id}-recovered-${suffix}`
        suffix += 1
      }
      usedRoundIds.add(id)
      return { ...round, id, sequence: index + 1 }
    })
    chats[chatId] = {
      chatId,
      chatName: typeof rawChat.chatName === 'string'
        ? rawChat.chatName
        : existing?.chatName ?? 'Untitled chat',
      fandomNotes,
      rounds: uniqueRounds,
    }
  }
  return chats
}

export function normalizeStore(value: unknown): ThreadverseStore {
  if (!value || typeof value !== 'object') return emptyStore()
  const candidate = value as Partial<ThreadverseStore>
  if (candidate.version !== 1) {
    return emptyStore()
  }
  const savedSettings = candidate.settings as Partial<ThreadverseSettings> & {
    model?: unknown
    instructions?: unknown
  } | undefined
  const {
    model: _legacyModel,
    instructions: legacyInstructions,
    ...savedWithoutLegacyFields
  } = savedSettings ?? {}
  const presetIds = new Set<string>()
  const presetNames = new Set<string>()
  const savedPresets = Array.isArray(savedSettings?.instructionPresets)
    ? savedSettings.instructionPresets.filter((preset): preset is InstructionPreset => {
        if (!preset || typeof preset.id !== 'string' || !preset.id) return false
        if (typeof preset.name !== 'string' || !preset.name || typeof preset.instructions !== 'string') return false
        const normalizedName = preset.name.toLocaleLowerCase()
        if (presetIds.has(preset.id) || presetNames.has(normalizedName)) return false
        presetIds.add(preset.id)
        presetNames.add(normalizedName)
        return true
      }).map((preset) => ({
        ...preset,
        instructions: preset.instructions === LEGACY_DEFAULT_INSTRUCTIONS
          ? CURRENT_DEFAULT_INSTRUCTIONS
          : preset.instructions,
      }))
    : []
  const instructionPresets = savedPresets.length > 0
    ? savedPresets
    : [{
        id: 'default',
        name: 'Default',
        instructions: typeof legacyInstructions === 'string' ? legacyInstructions : DEFAULT_INSTRUCTIONS,
      }]
  const requestedActivePresetId = savedSettings?.activeInstructionPresetId
  const activeInstructionPresetId = instructionPresets.some((preset) => preset.id === requestedActivePresetId)
    ? requestedActivePresetId!
    : instructionPresets[0].id
  const mergedSettings: ThreadverseSettings = {
    connectionId: typeof savedWithoutLegacyFields.connectionId === 'string'
      ? savedWithoutLegacyFields.connectionId
      : null,
    maxOutputTokens: storedOptionalNumber(savedWithoutLegacyFields.maxOutputTokens, 1, 200000, true),
    temperature: storedOptionalNumber(savedWithoutLegacyFields.temperature, 0, 5),
    topP: storedOptionalNumber(savedWithoutLegacyFields.topP, 0, 1),
    previousRangeLimit: storedOptionalNumber(savedWithoutLegacyFields.previousRangeLimit, 0, 50, true),
    fandomThreadLimit: storedOptionalNumber(savedWithoutLegacyFields.fandomThreadLimit, 0, 50, true),
    maintainFandomContinuity: typeof savedWithoutLegacyFields.maintainFandomContinuity === 'boolean'
      ? savedWithoutLegacyFields.maintainFandomContinuity
      : DEFAULT_SETTINGS.maintainFandomContinuity,
    feedFontScale: storedOptionalNumber(
      savedWithoutLegacyFields.feedFontScale,
      MIN_FEED_FONT_SCALE,
      MAX_FEED_FONT_SCALE,
      true,
    ) ?? DEFAULT_FEED_FONT_SCALE,
    instructionPresets,
    activeInstructionPresetId,
  }

  // Version 0.3.0 stored the effective defaults as explicit values. Convert
  // those exact values to the new empty/placeholder representation.
  if (mergedSettings.maxOutputTokens === DEFAULT_SAMPLERS.maxOutputTokens) mergedSettings.maxOutputTokens = null
  if (mergedSettings.temperature === DEFAULT_SAMPLERS.temperature) mergedSettings.temperature = null
  if (mergedSettings.topP === DEFAULT_SAMPLERS.topP) mergedSettings.topP = null
  if (mergedSettings.previousRangeLimit === DEFAULT_CONTINUITY.previousRangeLimit) mergedSettings.previousRangeLimit = null
  if (mergedSettings.fandomThreadLimit === DEFAULT_CONTINUITY.fandomThreadLimit) mergedSettings.fandomThreadLimit = null

  return {
    version: 1,
    settings: mergedSettings,
    chats: normalizeStoredChats(candidate.chats),
  }
}

export function summarizeRounds(rounds: StoredRound[]): RoundSummary[] {
  return rounds.map(({ messages, feedVersions: _feedVersions, activeFeedVersionId: _activeFeedVersionId, ...summary }) => ({
    ...summary,
    messageIds: messages.map((message) => message.id),
  }))
}

export function feedRounds(rounds: StoredRound[]) {
  return rounds.map(({ messages, ...round }) => ({
    ...round,
    messageIds: messages.map((message) => message.id),
  }))
}

export function activeFeedVersion(round: StoredRound): FeedVersion | null {
  return round.feedVersions.find((version) => version.id === round.activeFeedVersionId)
    ?? round.feedVersions.at(-1)
    ?? null
}

export function selectFeedVersion(round: StoredRound, versionId: string): boolean {
  if (!round.feedVersions.some((version) => version.id === versionId)) return false
  round.activeFeedVersionId = versionId
  return true
}

export function removeFeedVersion(round: StoredRound, versionId: string): boolean {
  if (round.feedVersions.length <= 1) return false
  const index = round.feedVersions.findIndex((version) => version.id === versionId)
  if (index < 0) return false
  round.feedVersions.splice(index, 1)
  if (round.activeFeedVersionId === versionId) {
    round.activeFeedVersionId = round.feedVersions[Math.min(index, round.feedVersions.length - 1)].id
  }
  return true
}

export function pruneInactiveFeedVersions(
  rounds: StoredRound[],
  settings: ThreadverseSettings,
): number {
  if (!settings.maintainFandomContinuity) return 0
  const limit = resolveContinuity(settings).fandomThreadLimit
  if (limit <= 0) return 0
  const candidates = rounds.filter((round) => activeFeedVersion(round))
  const expired = candidates.slice(0, Math.max(0, candidates.length - limit))
  let removed = 0
  for (const round of expired) {
    const active = activeFeedVersion(round)
    if (!active || round.feedVersions.length <= 1) continue
    removed += round.feedVersions.length - 1
    round.feedVersions = [active]
    round.activeFeedVersionId = active.id
  }
  return removed
}
