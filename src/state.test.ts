import { describe, expect, test } from 'bun:test'
import { buildThreadversePrompt } from './prompt'
import { toggleRangeEndpoint } from './range-selection'
import {
  DEFAULT_SETTINGS,
  emptyStore,
  normalizeStore,
  resolveContinuity,
  resolveSamplers,
  selectPreviousRounds,
  type StoredRound,
} from './state'

function round(sequence: number): StoredRound {
  return {
    id: `round-${sequence}`,
    sequence,
    createdAt: new Date(sequence * 1000).toISOString(),
    startMessageId: `start-${sequence}`,
    endMessageId: `end-${sequence}`,
    startIndex: sequence * 10,
    endIndex: sequence * 10 + 2,
    messageCount: 3,
    messages: [],
    feed: null,
  }
}

describe('Threadverse continuity', () => {
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

  test('keeps the newest configured ranges in chronological order', () => {
    const store = emptyStore()
    store.settings.previousRangeLimit = 3
    store.chats.chat = {
      chatId: 'chat',
      chatName: 'RP',
      rounds: [round(1), round(2), round(3), round(4)],
    }

    expect(selectPreviousRounds(store, 'chat').map((item) => item.sequence)).toEqual([2, 3, 4])

    store.settings.previousRangeLimit = 0
    expect(selectPreviousRounds(store, 'chat')).toEqual([])
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
})
