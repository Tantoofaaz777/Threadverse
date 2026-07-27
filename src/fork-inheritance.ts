import type { ThreadverseComment, ThreadverseFeed } from './shared'
import type { ChatContinuity, StoredRound } from './state'

export interface ForkMessageReference {
  id: string
  index_in_chat: number
}

export interface ForkInheritanceInput {
  source: ChatContinuity | undefined
  existing?: ChatContinuity
  forkChatId: string
  forkChatName: string
  sourceChatId: string
  sourceMessages: ForkMessageReference[]
  forkMessages: ForkMessageReference[]
  forkedAtMessageIndex: number
  forkedAtUnixSeconds?: number
  idFactory: () => string
}

export interface ForkInheritanceResult {
  continuity: ChatContinuity
  inheritedRoundCount: number
  alreadyInherited: boolean
}

function cloneComments(comments: ThreadverseComment[]): ThreadverseComment[] {
  return comments.map((comment) => ({
    ...comment,
    replies: cloneComments(comment.replies),
  }))
}

function cloneFeed(feed: ThreadverseFeed): ThreadverseFeed {
  return {
    title: feed.title,
    post: { ...feed.post },
    comments: cloneComments(feed.comments),
  }
}

function cloneExistingRound(round: StoredRound): StoredRound {
  return {
    ...round,
    messages: round.messages.map((message) => ({ ...message })),
    feedVersions: round.feedVersions.map((version) => ({
      ...version,
      feed: cloneFeed(version.feed),
    })),
  }
}

function existedAtFork(createdAt: string, forkedAtUnixSeconds: number | undefined): boolean {
  if (forkedAtUnixSeconds === undefined) return true
  const timestamp = Date.parse(createdAt)
  return !Number.isFinite(timestamp) || timestamp <= forkedAtUnixSeconds * 1000
}

export function inheritContinuityForFork(input: ForkInheritanceInput): ForkInheritanceResult {
  if (input.existing?.forkSourceChatId) {
    return {
      continuity: input.existing,
      inheritedRoundCount: 0,
      alreadyInherited: true,
    }
  }

  const sourceById = new Map(input.sourceMessages.map((message) => [message.id, message]))
  const forkByIndex = new Map(input.forkMessages.map((message, position) => [
    message.index_in_chat,
    { message, displayIndex: position + 1 },
  ]))
  const existingRounds = input.existing?.rounds.map(cloneExistingRound) ?? []
  const usedForkMessageIds = new Set(
    existingRounds.flatMap((round) => round.messages.map((message) => message.id)),
  )
  const inheritedRounds: StoredRound[] = []

  for (const sourceRound of input.source?.rounds ?? []) {
    if (!existedAtFork(sourceRound.createdAt, input.forkedAtUnixSeconds)) continue
    const mappedMessages = sourceRound.messages.map((storedMessage) => {
      const sourceMessage = sourceById.get(storedMessage.id)
      if (!sourceMessage || sourceMessage.index_in_chat > input.forkedAtMessageIndex) return null
      const forkMessage = forkByIndex.get(sourceMessage.index_in_chat)
      if (!forkMessage) return null
      return {
        ...storedMessage,
        id: forkMessage.message.id,
        index: forkMessage.displayIndex,
      }
    })
    if (mappedMessages.some((message) => !message)) continue
    const messages = mappedMessages.filter((message): message is NonNullable<typeof message> => Boolean(message))
    if (messages.some((message) => usedForkMessageIds.has(message.id))) continue

    const versionIdMap = new Map<string, string>()
    const feedVersions = sourceRound.feedVersions
      .filter((version) => existedAtFork(version.createdAt, input.forkedAtUnixSeconds))
      .map((version) => {
        const id = input.idFactory()
        versionIdMap.set(version.id, id)
        return {
          id,
          createdAt: version.createdAt,
          feed: cloneFeed(version.feed),
        }
      })
    const activeFeedVersionId = sourceRound.activeFeedVersionId
      ? versionIdMap.get(sourceRound.activeFeedVersionId) ?? feedVersions.at(-1)?.id ?? null
      : feedVersions.at(-1)?.id ?? null
    const first = messages[0]
    const last = messages.at(-1)!
    inheritedRounds.push({
      ...sourceRound,
      id: input.idFactory(),
      startMessageId: first.id,
      endMessageId: last.id,
      startIndex: first.index,
      endIndex: last.index,
      messageCount: messages.length,
      messages,
      feedVersions,
      activeFeedVersionId,
    })
    messages.forEach((message) => usedForkMessageIds.add(message.id))
  }

  const rounds = [...inheritedRounds, ...existingRounds]
  rounds.forEach((round, index) => { round.sequence = index + 1 })
  return {
    continuity: {
      chatId: input.forkChatId,
      chatName: input.forkChatName || input.existing?.chatName || 'Untitled chat',
      fandomNotes: input.existing?.fandomNotes ?? input.source?.fandomNotes ?? '',
      rounds,
      forkSourceChatId: input.sourceChatId,
      forkedAtMessageIndex: input.forkedAtMessageIndex,
    },
    inheritedRoundCount: inheritedRounds.length,
    alreadyInherited: false,
  }
}
