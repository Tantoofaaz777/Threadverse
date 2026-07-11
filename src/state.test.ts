import { describe, expect, test } from 'bun:test'
import { buildThreadversePrompt } from './prompt'
import { parseThreadverseFeed } from './feed'
import { toggleRangeEndpoint } from './range-selection'
import { shouldAcceptActiveChatResponse } from './chat-response'
import {
  DEFAULT_SETTINGS,
  applyAutomaticSettings,
  applyPromptSettings,
  emptyStore,
  normalizeStore,
  resolveContinuity,
  resolveSamplers,
} from './state'

describe('Threadverse continuity', () => {
  test('ignores stale requested chat states but accepts unsolicited updates', () => {
    expect(shouldAcceptActiveChatResponse(4, 5)).toBe(false)
    expect(shouldAcceptActiveChatResponse(5, 5)).toBe(true)
    expect(shouldAcceptActiveChatResponse(undefined, 5)).toBe(true)
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
    expect(Object.keys(store.chats)).toEqual(['good'])
    expect(store.chats.good.rounds).toHaveLength(1)
    expect(store.chats.good.rounds[0]).toMatchObject({
      sequence: 1,
      startMessageId: 'm1',
      endMessageId: 'm1',
      startIndex: 4,
      endIndex: 4,
      messageCount: 1,
      feed: null,
    })
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
        maintainFandomContinuity: false,
        instructionPresets: [{ id: 'custom', name: 'Custom', instructions: 'Keep this prompt' }],
        activeInstructionPresetId: 'custom',
      },
      chats: 'corrupted',
    })

    expect(store.chats).toEqual({})
    expect(store.settings.connectionId).toBe('connection-1')
    expect(store.settings.temperature).toBe(0.65)
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
    })
    expect(next.instructionPresets[0].instructions).toBe('Prompt draft')
    expect(next.temperature).toBe(0.8)
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

  test('parses fenced JSON and common author/content aliases', () => {
    const feed = parseThreadverseFeed(`Here is the result:\n\`\`\`json
      {"subreddit":"television","title":"Episode discussion","post":{"author":"OP","content":"Opening","upvotes":12},"comments":[{"author":"viewer","text":"Theory","replies":[]}]}
    \`\`\``)
    expect(feed.post.username).toBe('OP')
    expect(feed.post.score).toBe(12)
    expect(feed.comments[0].username).toBe('viewer')
    expect(feed.comments[0].id).toBe('comment-1')
  })

  test('rejects a response without the required feed shape', () => {
    expect(() => parseThreadverseFeed('{"title":"Missing fields"}')).toThrow()
  })
})
