import { describe, expect, test } from 'bun:test'
import { buildThreadversePrompt } from './prompt'
import { parseThreadverseFeed, serializeFeedAsPlainText, serializeFeedForContinuity } from './feed'
import { toggleRangeEndpoint } from './range-selection'
import { shouldAcceptActiveChatResponse } from './chat-response'
import { DEFAULT_FEED_FONT_SCALE, isFrontendMessage } from './shared'
import {
  DEFAULT_SETTINGS,
  activeFeedVersion,
  applyAutomaticSettings,
  applyPromptSettings,
  emptyStore,
  normalizeStore,
  pruneInactiveFeedVersions,
  removeFeedVersion,
  resolveContinuity,
  resolveSamplers,
  selectFeedVersion,
} from './state'

const storedFeed = (title: string) => ({
  title,
  post: { username: 'OP', body: `${title} opening`, score: 10 },
  comments: [{ username: 'viewer', body: `${title} comment`, score: 3 }],
})

const storedMessage = (id: string, index: number) => ({
  id,
  index,
  role: 'assistant',
  content: `Message ${index}`,
})

describe('Threadverse continuity', () => {
  test('ignores stale requested chat states but accepts unsolicited updates', () => {
    expect(shouldAcceptActiveChatResponse(4, 5)).toBe(false)
    expect(shouldAcceptActiveChatResponse(5, 5)).toBe(true)
    expect(shouldAcceptActiveChatResponse(undefined, 5)).toBe(true)
  })

  test('accepts clipboard and feed-version frontend messages', () => {
    expect(isFrontendMessage({ type: 'threadverse:copy_result', success: true })).toBe(true)
    expect(isFrontendMessage({
      type: 'threadverse:select_feed_version', chatId: 'chat', roundId: 'round', versionId: 'version',
    })).toBe(true)
    expect(isFrontendMessage({
      type: 'threadverse:delete_feed_version', chatId: 'chat', roundId: 'round', versionId: 'version',
    })).toBe(true)
  })

  test('clicking either selected endpoint toggles only that endpoint off', () => {
    expect(toggleRangeEndpoint({ startIndex: 4, endIndex: 9 }, 9)).toEqual({
      startIndex: 4,
      endIndex: null,
    })
    expect(toggleRangeEndpoint({ startIndex: 4, endIndex: 9 }, 4)).toEqual({
      startIndex: null,
      endIndex: 9,
    })
  })

  test('fills defaults when loading an older state file', () => {
    const store = normalizeStore({ version: 1, chats: {} })
    expect(store.settings).toEqual(DEFAULT_SETTINGS)
  })

  test('preserves saved settings while filling newly added defaults', () => {
    const store = normalizeStore({
      version: 1,
      chats: {},
      settings: { previousRangeLimit: 8, temperature: 0.75 },
    })
    expect(store.settings.previousRangeLimit).toBe(8)
    expect(store.settings.temperature).toBe(0.75)
    expect(store.settings.maxOutputTokens).toBe(DEFAULT_SETTINGS.maxOutputTokens)
    expect(store.settings.feedFontScale).toBe(DEFAULT_FEED_FONT_SCALE)
    expect(store.settings.instructionPresets).toEqual(DEFAULT_SETTINGS.instructionPresets)
  })

  test('recovers valid continuity from a partially corrupted store', () => {
    const store = normalizeStore({
      version: 1,
      settings: {
        maxOutputTokens: 'many',
        temperature: 99,
        topP: -1,
        previousRangeLimit: 2.5,
        maintainFandomContinuity: 'yes',
        feedFontScale: 999,
      },
      chats: {
        good: {
          chatName: 'Recovered RP',
          rounds: [{
            createdAt: '2026-01-01T00:00:00.000Z',
            messages: [
              { id: 'm1', index: 4, role: 'assistant', content: 'Valid message' },
              { id: '', index: 5, role: 'user', content: 'Broken message' },
            ],
            feed: { title: 'Incomplete feed' },
          }],
        },
        broken: { rounds: 'not-an-array' },
      },
    })

    expect(store.settings.maxOutputTokens).toBeNull()
    expect(store.settings.temperature).toBeNull()
    expect(store.settings.topP).toBeNull()
    expect(store.settings.previousRangeLimit).toBeNull()
    expect(store.settings.maintainFandomContinuity).toBe(true)
    expect(store.settings.feedFontScale).toBe(DEFAULT_FEED_FONT_SCALE)
    expect(Object.keys(store.chats)).toEqual(['good'])
    expect(store.chats.good.rounds).toHaveLength(1)
    expect(store.chats.good.rounds[0]).toMatchObject({
      sequence: 1,
      startMessageId: 'm1',
      endMessageId: 'm1',
      startIndex: 4,
      endIndex: 4,
      messageCount: 1,
      feedVersions: [],
      activeFeedVersionId: null,
    })
  })

  test('migrates a legacy feed into the first active version', () => {
    const store = normalizeStore({
      version: 1,
      chats: {
        chat: {
          rounds: [{
            id: 'round-1',
            createdAt: '2026-01-01T00:00:00.000Z',
            messages: [storedMessage('m1', 1)],
            feed: storedFeed('Legacy thread'),
          }],
        },
      },
    })
    const round = store.chats.chat.rounds[0]

    expect(round.feedVersions).toHaveLength(1)
    expect(round.feedVersions[0]).toMatchObject({
      id: 'round-1-feed-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      feed: { title: 'Legacy thread' },
    })
    expect(round.activeFeedVersionId).toBe('round-1-feed-1')
  })

  test('selects and removes feed versions while preserving an adjacent active version', () => {
    const store = normalizeStore({
      version: 1,
      chats: {
        chat: {
          rounds: [{
            id: 'round-1',
            messages: [storedMessage('m1', 1)],
            feedVersions: [
              { id: 'v1', feed: storedFeed('Version 1') },
              { id: 'v2', feed: storedFeed('Version 2') },
              { id: 'v3', feed: storedFeed('Version 3') },
            ],
            activeFeedVersionId: 'v1',
          }],
        },
      },
    })
    const round = store.chats.chat.rounds[0]

    expect(selectFeedVersion(round, 'v2')).toBe(true)
    expect(activeFeedVersion(round)?.id).toBe('v2')
    expect(removeFeedVersion(round, 'v2')).toBe(true)
    expect(round.feedVersions.map((version) => version.id)).toEqual(['v1', 'v3'])
    expect(activeFeedVersion(round)?.id).toBe('v3')
    expect(removeFeedVersion(round, 'v3')).toBe(true)
    expect(activeFeedVersion(round)?.id).toBe('v1')
    expect(removeFeedVersion(round, 'v1')).toBe(false)
  })

  test('silently prunes inactive versions only outside the fandom window', () => {
    const rawRounds = Array.from({ length: 4 }, (_, index) => ({
      id: `round-${index + 1}`,
      messages: [storedMessage(`m${index + 1}`, index + 1)],
      feedVersions: [
        { id: `r${index + 1}-v1`, feed: storedFeed(`Round ${index + 1} first`) },
        { id: `r${index + 1}-v2`, feed: storedFeed(`Round ${index + 1} active`) },
      ],
      activeFeedVersionId: `r${index + 1}-v${index === 0 ? 1 : 2}`,
    }))
    const store = normalizeStore({ version: 1, chats: { chat: { rounds: rawRounds } } })
    store.settings.fandomThreadLimit = 2

    expect(pruneInactiveFeedVersions(store.chats.chat.rounds, store.settings)).toBe(2)
    expect(store.chats.chat.rounds.map((round) => round.feedVersions.length)).toEqual([1, 1, 2, 2])
    expect(store.chats.chat.rounds[0].feedVersions[0].id).toBe('r1-v1')

    const disabled = normalizeStore({ version: 1, chats: { chat: { rounds: rawRounds } } })
    disabled.settings.fandomThreadLimit = 2
    disabled.settings.maintainFandomContinuity = false
    expect(pruneInactiveFeedVersions(disabled.chats.chat.rounds, disabled.settings)).toBe(0)
    expect(disabled.chats.chat.rounds.every((round) => round.feedVersions.length === 2)).toBe(true)

    const zeroLimit = normalizeStore({ version: 1, chats: { chat: { rounds: rawRounds } } })
    zeroLimit.settings.fandomThreadLimit = 0
    expect(pruneInactiveFeedVersions(zeroLimit.chats.chat.rounds, zeroLimit.settings)).toBe(0)
    expect(zeroLimit.chats.chat.rounds.every((round) => round.feedVersions.length === 2)).toBe(true)
  })

  test('rekeys recovered chats and repairs duplicate round IDs', () => {
    const message = (id: string, index: number) => ({
      id,
      index,
      role: 'assistant',
      content: `Message ${index}`,
    })
    const store = normalizeStore({
      version: 1,
      chats: {
        'corrupted-key': {
          chatId: 'real-chat-id',
          chatName: 'Recovered chat',
          rounds: [
            { id: 'duplicate', messages: [message('m1', 1)] },
            { id: 'duplicate', messages: [message('m2', 2)] },
          ],
        },
      },
    })

    expect(store.chats['corrupted-key']).toBeUndefined()
    expect(store.chats['real-chat-id'].rounds.map((round) => round.sequence)).toEqual([1, 2])
    expect(new Set(store.chats['real-chat-id'].rounds.map((round) => round.id)).size).toBe(2)
    expect(store.chats['real-chat-id'].rounds[1].id).toBe('duplicate-recovered-2')
  })

  test('preserves valid settings when the chats container is corrupted', () => {
    const store = normalizeStore({
      version: 1,
      settings: {
        connectionId: 'connection-1',
        temperature: 0.65,
        feedFontScale: 135,
        maintainFandomContinuity: false,
        instructionPresets: [{ id: 'custom', name: 'Custom', instructions: 'Keep this prompt' }],
        activeInstructionPresetId: 'custom',
      },
      chats: 'corrupted',
    })

    expect(store.chats).toEqual({})
    expect(store.settings.connectionId).toBe('connection-1')
    expect(store.settings.temperature).toBe(0.65)
    expect(store.settings.feedFontScale).toBe(135)
    expect(store.settings.maintainFandomContinuity).toBe(false)
    expect(store.settings.instructionPresets[0].instructions).toBe('Keep this prompt')
    expect(store.settings.activeInstructionPresetId).toBe('custom')
  })

  test('uses sampler hints when optional sampler fields are empty', () => {
    const store = emptyStore()
    expect(resolveSamplers(store.settings)).toEqual({
      maxOutputTokens: 4096,
      temperature: 1,
      topP: 1,
    })

    store.settings.temperature = 0.7
    expect(resolveSamplers(store.settings).temperature).toBe(0.7)
  })

  test('uses continuity hints when optional continuity fields are empty', () => {
    const store = emptyStore()
    expect(resolveContinuity(store.settings)).toEqual({
      previousRangeLimit: 3,
      fandomThreadLimit: 3,
    })

    store.settings.previousRangeLimit = 6
    expect(resolveContinuity(store.settings).previousRangeLimit).toBe(6)
  })

  test('migrates the legacy instruction field into the default preset', () => {
    const store = normalizeStore({
      version: 1,
      chats: {},
      settings: { instructions: 'My old prompt' },
    })
    expect(store.settings.activeInstructionPresetId).toBe('default')
    expect(store.settings.instructionPresets).toEqual([
      { id: 'default', name: 'Default', instructions: 'My old prompt' },
    ])
  })

  test('removes the obsolete flair request from the untouched legacy default prompt', () => {
    const legacyInstructions = DEFAULT_SETTINGS.instructionPresets[0].instructions
      .replace('votes, theories', 'votes, flairs, theories')
    const store = normalizeStore({
      version: 1,
      chats: {},
      settings: {
        instructionPresets: [{ id: 'default', name: 'Default', instructions: legacyInstructions }],
        activeInstructionPresetId: 'default',
      },
    })

    expect(store.settings.instructionPresets[0].instructions).toContain('votes, theories')
    expect(store.settings.instructionPresets[0].instructions).not.toContain('flairs')
  })

  test('automatic saves never overwrite unsaved prompt data', () => {
    const current = emptyStore().settings
    current.instructionPresets[0].instructions = 'Prompt draft'
    const next = applyAutomaticSettings(current, {
      connectionId: 'connection-1',
      maxOutputTokens: 8000,
      temperature: 0.8,
      topP: 0.9,
      previousRangeLimit: 5,
      fandomThreadLimit: 4,
      maintainFandomContinuity: false,
      feedFontScale: 125,
    })
    expect(next.instructionPresets[0].instructions).toBe('Prompt draft')
    expect(next.temperature).toBe(0.8)
    expect(next.feedFontScale).toBe(125)
  })

  test('prompt saves never overwrite automatic settings', () => {
    const current = emptyStore().settings
    current.temperature = 0.6
    const next = applyPromptSettings(current, {
      instructionPresets: [{ id: 'custom', name: 'Custom', instructions: 'New prompt' }],
      activeInstructionPresetId: 'custom',
    })
    expect(next.temperature).toBe(0.6)
    expect(next.activeInstructionPresetId).toBe('custom')
  })

  test('builds story and fandom blocks in chronological order', () => {
    const prompt = buildThreadversePrompt({
      previousRanges: [
        { label: 'RANGE A', content: 'A' },
        { label: 'RANGE B', content: 'B' },
      ],
      recentRange: { label: 'RANGE C', content: 'C' },
      fandomContinuity: [
        { label: 'THREAD A', content: 'TA' },
        { label: 'THREAD B', content: 'TB' },
      ],
      instructions: 'Instructions',
    })

    const markers = ['RANGE A', 'RANGE B', 'RANGE C', 'THREAD A', 'THREAD B', 'INSTRUCTIONS']
    const positions = markers.map((marker) => prompt.indexOf(marker))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  test('asks the model for only the compact feed fields', () => {
    const prompt = buildThreadversePrompt({
      previousRanges: [],
      recentRange: { label: 'ROUND 1', content: 'Story' },
      fandomContinuity: [],
      instructions: 'Discuss the story.',
    })
    const outputFormat = prompt.slice(prompt.indexOf('>>> OUTPUT FORMAT <<<'))

    expect(outputFormat).toContain('"title"')
    expect(outputFormat).toContain('"username"')
    expect(outputFormat).toContain('"body"')
    expect(outputFormat).toContain('"score"')
    expect(outputFormat).toContain('"replies"')
    expect(outputFormat).not.toContain('"subreddit"')
    expect(outputFormat).not.toContain('"flair"')
    expect(outputFormat).not.toContain('"timestamp"')
    expect(outputFormat).not.toContain('"id"')
  })

  test('parses fenced JSON and common author/content aliases', () => {
    const feed = parseThreadverseFeed(`Here is the result:\n\`\`\`json
      {"subreddit":"legacy","title":"Episode discussion","post":{"author":"OP","content":"Opening","upvotes":12,"flair":"Old"},"comments":[{"id":"old-id","author":"viewer","text":"Theory","timestamp":"1h","replies":[]}]}
    \`\`\``)
    expect(feed.post.username).toBe('OP')
    expect(feed.post.score).toBe(12)
    expect(feed.comments[0].username).toBe('viewer')
    expect(feed).not.toHaveProperty('subreddit')
    expect(feed.post).not.toHaveProperty('flair')
    expect(feed.comments[0]).not.toHaveProperty('id')
  })

  test('parses and serializes the compact feed shape without empty replies', () => {
    const feed = parseThreadverseFeed(JSON.stringify({
      title: 'Discussion',
      post: { username: 'OP', body: 'Opening', score: 10 },
      comments: [
        { username: 'root', body: 'Root', score: 5 },
        { username: 'parent', body: 'Parent', score: 4, replies: [
          { username: 'reply', body: 'Reply', score: 2 },
        ] },
      ],
    }))
    const serialized = serializeFeedForContinuity(feed)
    expect(serialized).toBe('{"title":"Discussion","post":{"username":"OP","body":"Opening","score":10},"comments":[{"username":"root","body":"Root","score":5},{"username":"parent","body":"Parent","score":4,"replies":[{"username":"reply","body":"Reply","score":2}]}]}')
    expect(serialized).not.toContain('replies":[]')
  })

  test('serializes a feed as clean text in reading order', () => {
    const feed = parseThreadverseFeed(JSON.stringify({
      title: 'Episode discussion',
      post: { username: 'OP', body: 'Opening post', score: 10 },
      comments: [
        { username: 'root', body: 'Root comment', score: 5, replies: [
          { username: 'reply', body: 'Nested reply', score: 2 },
        ] },
        { username: 'second', body: 'Second comment', score: 1 },
      ],
    }))

    expect(serializeFeedAsPlainText(feed)).toBe(
      'Episode discussion\n\nOP:\nOpening post\n\nroot:\nRoot comment\n\nreply:\nNested reply\n\nsecond:\nSecond comment',
    )
  })

  test('rejects a response without the required feed shape', () => {
    expect(() => parseThreadverseFeed('{"title":"Missing fields"}')).toThrow()
  })
})
