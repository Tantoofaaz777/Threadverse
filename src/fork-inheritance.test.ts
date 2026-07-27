import { describe, expect, test } from 'bun:test'
import { inheritContinuityForFork } from './fork-inheritance'
import {
  DEFAULT_SETTINGS,
  normalizeStore,
  resetContinuityRounds,
  type ChatContinuity,
  type StoredRound,
} from './state'

function message(id: string, index: number) {
  return {
    id,
    index,
    role: 'assistant' as const,
    content: `Message ${index}`,
  }
}

function feed(title: string) {
  return {
    title,
    post: { username: 'op', body: `${title} post`, score: 10 },
    comments: [{
      username: 'viewer',
      body: `${title} comment`,
      score: 4,
      replies: [],
    }],
  }
}

function round(
  id: string,
  sequence: number,
  messages: ReturnType<typeof message>[],
  createdAt = '2026-01-01T00:00:00.000Z',
): StoredRound {
  const versionId = `${id}-version`
  return {
    id,
    sequence,
    createdAt,
    installmentLabel: '',
    startMessageId: messages[0].id,
    endMessageId: messages.at(-1)!.id,
    startIndex: messages[0].index,
    endIndex: messages.at(-1)!.index,
    messageCount: messages.length,
    messages,
    feedVersions: [{
      id: versionId,
      createdAt,
      feed: feed(id),
    }],
    activeFeedVersionId: versionId,
  }
}

function continuity(
  chatId: string,
  rounds: StoredRound[],
  fandomNotes = '',
): ChatContinuity {
  return { chatId, chatName: chatId, fandomNotes, rounds }
}

function references(prefix: string, lastIndex: number) {
  return Array.from({ length: lastIndex + 1 }, (_, index) => ({
    id: `${prefix}${index}`,
    index_in_chat: index,
  }))
}

function sequentialIds() {
  let next = 0
  return () => `new-${++next}`
}

describe('fork continuity inheritance', () => {
  test('inherits complete pre-fork rounds and remaps every message and feed id', () => {
    const source = continuity('source', [
      round('round-1', 1, [message('s0', 1), message('s1', 2)]),
      round('round-crosses-fork', 2, [message('s2', 3), message('s4', 5)]),
      round(
        'round-created-later',
        3,
        [message('s2', 3)],
        '2026-03-01T00:00:00.000Z',
      ),
    ], 'Keep the running joke.')
    source.rounds[0].feedVersions.push({
      id: 'round-1-version-2',
      createdAt: '2026-01-02T00:00:00.000Z',
      feed: feed('round-1 swipe 2'),
    })
    source.rounds[0].activeFeedVersionId = 'round-1-version-2'

    const result = inheritContinuityForFork({
      source,
      forkChatId: 'fork',
      forkChatName: 'Forked chat',
      sourceChatId: 'source',
      sourceMessages: references('s', 4),
      forkMessages: references('f', 3),
      forkedAtMessageIndex: 3,
      forkedAtUnixSeconds: Date.parse('2026-02-01T00:00:00.000Z') / 1000,
      idFactory: sequentialIds(),
    })

    expect(result.inheritedRoundCount).toBe(1)
    expect(result.continuity).toMatchObject({
      chatId: 'fork',
      chatName: 'Forked chat',
      fandomNotes: 'Keep the running joke.',
      forkSourceChatId: 'source',
      forkedAtMessageIndex: 3,
    })
    expect(result.continuity.rounds).toHaveLength(1)
    expect(result.continuity.rounds[0]).toMatchObject({
      sequence: 1,
      startMessageId: 'f0',
      endMessageId: 'f1',
      startIndex: 1,
      endIndex: 2,
      messageCount: 2,
      messages: [{ id: 'f0', index: 1 }, { id: 'f1', index: 2 }],
    })
    expect(result.continuity.rounds[0].id).not.toBe('round-1')
    expect(result.continuity.rounds[0].feedVersions).toHaveLength(2)
    expect(result.continuity.rounds[0].feedVersions[0].id).not.toBe('round-1-version')
    expect(result.continuity.rounds[0].activeFeedVersionId)
      .toBe(result.continuity.rounds[0].feedVersions[1].id)
    expect(source.rounds[0].messages[0].id).toBe('s0')
    expect(source.rounds[0].feedVersions[0].id).toBe('round-1-version')
  })

  test('prepends inherited history without duplicating a range used by the child', () => {
    const source = continuity('source', [
      round('source-1', 1, [message('s0', 1)]),
      round('source-2', 2, [message('s1', 2)]),
    ], 'Source notes')
    const existing = continuity('fork', [
      round('child-own-round', 1, [message('f1', 2)]),
    ], '')

    const result = inheritContinuityForFork({
      source,
      existing,
      forkChatId: 'fork',
      forkChatName: 'Fork',
      sourceChatId: 'source',
      sourceMessages: references('s', 1),
      forkMessages: references('f', 1),
      forkedAtMessageIndex: 1,
      idFactory: sequentialIds(),
    })

    expect(result.inheritedRoundCount).toBe(1)
    expect(result.continuity.fandomNotes).toBe('')
    expect(result.continuity.rounds.map((item) => item.sequence)).toEqual([1, 2])
    expect(result.continuity.rounds[0].messages[0].id).toBe('f0')
    expect(result.continuity.rounds[1].id).toBe('child-own-round')
  })

  test('recursively inherited rounds can be inherited again by a nested fork', () => {
    const root = continuity('root', [
      round('root-round', 1, [message('r0', 1), message('r1', 2)]),
    ], 'Inherited twice')
    const firstFork = inheritContinuityForFork({
      source: root,
      forkChatId: 'fork-a',
      forkChatName: 'Fork A',
      sourceChatId: 'root',
      sourceMessages: references('r', 2),
      forkMessages: references('a', 2),
      forkedAtMessageIndex: 2,
      idFactory: sequentialIds(),
    }).continuity
    const secondFork = inheritContinuityForFork({
      source: firstFork,
      forkChatId: 'fork-b',
      forkChatName: 'Fork B',
      sourceChatId: 'fork-a',
      sourceMessages: references('a', 2),
      forkMessages: references('b', 1),
      forkedAtMessageIndex: 1,
      idFactory: sequentialIds(),
    }).continuity

    expect(secondFork.forkSourceChatId).toBe('fork-a')
    expect(secondFork.fandomNotes).toBe('Inherited twice')
    expect(secondFork.rounds).toHaveLength(1)
    expect(secondFork.rounds[0].messages.map((item) => item.id)).toEqual(['b0', 'b1'])
  })

  test('a persistent marker makes inheritance idempotent even after continuity reset', () => {
    const marked = continuity('fork', [])
    marked.forkSourceChatId = 'source'
    marked.forkedAtMessageIndex = 4

    const result = inheritContinuityForFork({
      source: continuity('source', [round('source-round', 1, [message('s0', 1)])]),
      existing: marked,
      forkChatId: 'fork',
      forkChatName: 'Fork',
      sourceChatId: 'source',
      sourceMessages: references('s', 4),
      forkMessages: references('f', 4),
      forkedAtMessageIndex: 4,
      idFactory: sequentialIds(),
    })

    expect(result.alreadyInherited).toBe(true)
    expect(result.continuity).toBe(marked)

    const store = normalizeStore({
      version: 1,
      settings: DEFAULT_SETTINGS,
      chats: { fork: marked },
    })
    resetContinuityRounds(store, 'fork', 'Fork after reset')
    expect(store.chats.fork).toMatchObject({
      chatName: 'Fork after reset',
      rounds: [],
      forkSourceChatId: 'source',
      forkedAtMessageIndex: 4,
    })
  })
})
