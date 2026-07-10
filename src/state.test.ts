import { describe, expect, test } from 'bun:test'
import { buildThreadversePrompt } from './prompt'
import {
  DEFAULT_SETTINGS,
  emptyStore,
  normalizeStore,
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
  test('fills defaults when loading an older state file', () => {
    const store = normalizeStore({ version: 1, chats: {} })
    expect(store.settings).toEqual(DEFAULT_SETTINGS)
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
