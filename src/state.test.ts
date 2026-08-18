import { describe, expect, test } from 'bun:test'
import {
  buildThreadversePrompt,
  groupConsecutiveStoryRanges,
  installmentOrRoundLabel,
} from './prompt'
import {
  parseGeneratedThreadverseFeed,
  parseThreadverseFeed,
  serializeFeedAsPlainText,
  serializeFeedForContinuity,
} from './feed'
import { toggleRangeEndpoint } from './range-selection'
import { shouldAcceptActiveChatResponse } from './chat-response'
import { resolveFeedSwipe } from './feed-swipe'
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
  resetContinuityRounds,
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
  test('uses the trailing feed swipe to regenerate and existing swipes to navigate', () => {
    expect(resolveFeedSwipe(-1, 0, 'left')).toEqual({ type: 'none' })
    expect(resolveFeedSwipe(-1, 0, 'right')).toEqual({ type: 'regenerate' })
    expect(resolveFeedSwipe(0, 1, 'left')).toEqual({ type: 'none' })
    expect(resolveFeedSwipe(0, 1, 'right')).toEqual({ type: 'regenerate' })
    expect(resolveFeedSwipe(0, 3, 'right')).toEqual({ type: 'select', targetIndex: 1 })
    expect(resolveFeedSwipe(2, 3, 'left')).toEqual({ type: 'select', targetIndex: 1 })
    expect(resolveFeedSwipe(2, 3, 'right')).toEqual({ type: 'regenerate' })
  })

  test('ignores stale requested chat states but accepts unsolicited updates', () => {
    expect(shouldAcceptActiveChatResponse(4, 5)).toBe(false)
    expect(shouldAcceptActiveChatResponse(5, 5)).toBe(true)
    expect(shouldAcceptActiveChatResponse(undefined, 5)).toBe(true)
  })

  test('accepts clipboard, fandom-note, and feed-version frontend messages', () => {
    expect(isFrontendMessage({ type: 'threadverse:copy_result', success: true })).toBe(true)
    expect(isFrontendMessage({
      type: 'threadverse:save_fandom_notes', chatId: 'chat', chatName: 'RP', notes: 'Remember this.',
    })).toBe(true)
    expect(isFrontendMessage({
      type: 'threadverse:open_fandom_notes_editor', chatId: 'chat', chatName: 'RP', value: 'Notes',
    })).toBe(true)
    expect(isFrontendMessage({
      type: 'threadverse:request_instruction_preset_rename',
      presetId: 'preset',
      currentName: 'Old name',
      existingNames: ['Other preset'],
    })).toBe(true)
    expect(isFrontendMessage({
      type: 'threadverse:generate_thread',
      chatId: 'chat',
      startMessageId: 'm1',
      endMessageId: 'm2',
      installmentLabel: 'ZETA — S01E03',
    })).toBe(true)
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
      settings: {
        previousRangeLimit: 8,
        temperature: 0.75,
        outgoingRegexScriptIds: ['regex-1', 'regex-1', '', 42],
      },
    })
    expect(store.settings.previousRangeLimit).toBe(8)
    expect(store.settings.temperature).toBe(0.75)
    expect(store.settings.maxOutputTokens).toBe(DEFAULT_SETTINGS.maxOutputTokens)
    expect(store.settings.feedFontScale).toBe(DEFAULT_FEED_FONT_SCALE)
    expect(store.settings.outgoingRegexScriptIds).toEqual(['regex-1'])
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
    expect(store.chats.good.fandomNotes).toBe('')
    expect(store.chats.good.rounds[0]).toMatchObject({
      sequence: 1,
      installmentLabel: '',
      startMessageId: 'm1',
      endMessageId: 'm1',
      startIndex: 4,
      endIndex: 4,
      messageCount: 1,
      feedVersions: [],
      activeFeedVersionId: null,
    })
  })

  test('preserves note-only chats and migrates missing fandom notes to empty text', () => {
    const store = normalizeStore({
      version: 1,
      chats: {
        notes: { chatName: 'Notes only', fandomNotes: 'The fandom distrusts Morgan.', rounds: [] },
        legacy: { chatName: 'Legacy', rounds: [{ messages: [storedMessage('m1', 1)] }] },
        empty: { chatName: 'Empty', fandomNotes: '   ', rounds: [] },
      },
    })

    expect(store.chats.notes).toMatchObject({
      chatId: 'notes',
      chatName: 'Notes only',
      fandomNotes: 'The fandom distrusts Morgan.',
      rounds: [],
    })
    expect(store.chats.legacy.fandomNotes).toBe('')
    expect(store.chats.empty).toBeUndefined()
  })

  test('resets rounds and generated versions while preserving fandom notes verbatim', () => {
    const store = normalizeStore({
      version: 1,
      chats: {
        chat: {
          chatName: 'Original name',
          fandomNotes: '  Keep this note exactly.  ',
          rounds: [{
            id: 'round-1',
            messages: [storedMessage('m1', 1)],
            feedVersions: [{ id: 'v1', feed: storedFeed('Thread') }],
          }],
        },
      },
    })

    resetContinuityRounds(store, 'chat', 'Current name')

    expect(store.chats.chat).toEqual({
      chatId: 'chat',
      chatName: 'Current name',
      fandomNotes: '  Keep this note exactly.  ',
      rounds: [],
    })

    resetContinuityRounds(store, 'chat', 'Current name', 'Newest editor value')
    expect(store.chats.chat.fandomNotes).toBe('Newest editor value')
  })

  test('migrates a legacy feed into the first active version', () => {
    const store = normalizeStore({
      version: 1,
      chats: {
        chat: {
          rounds: [{
            id: 'round-1',
            createdAt: '2026-01-01T00:00:00.000Z',
            installmentLabel: 'ZETA — S01E03',
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
    expect(round.installmentLabel).toBe('ZETA — S01E03')
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
      outgoingRegexScriptIds: ['regex-1'],
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
    expect(next.outgoingRegexScriptIds).toEqual(['regex-1'])
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
      fandomNotes: 'Remember the running joke.',
      instructions: 'Instructions',
    })

    const markers = [
      'RANGE A',
      'RANGE B',
      'RANGE C',
      'THREAD A',
      'THREAD B',
      'FANDOM NOTES',
      'Remember the running joke.',
      'INSTRUCTIONS',
    ]
    const positions = markers.map((marker) => prompt.indexOf(marker))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  test('groups consecutive ranges under their literal installment label', () => {
    const grouped = groupConsecutiveStoryRanges([
      { label: 'ZETA — S01E03', content: 'Scene A' },
      { label: 'ZETA — S01E03', content: 'Scene B' },
      { label: 'ZETA — S01E04', content: 'Scene C' },
      { label: 'ZETA — S01E03', content: 'Scene D' },
    ])

    expect(grouped).toEqual([
      { label: 'ZETA — S01E03', content: 'Scene A\n\nScene B' },
      { label: 'ZETA — S01E04', content: 'Scene C' },
      { label: 'ZETA — S01E03', content: 'Scene D' },
    ])

    const prompt = buildThreadversePrompt({
      previousRanges: grouped.slice(0, 2),
      recentRange: { label: 'ZETA — S01E05', content: 'Current scene' },
      fandomContinuity: [],
      instructions: 'Discuss it.',
    })
    expect(prompt).toContain(
      '--- ZETA — S01E03 ---\nScene A\n\nScene B\n\n---\n\n--- ZETA — S01E04 ---\nScene C',
    )
    expect(prompt).toContain('>>> RECENT CONTEXT <<<\n\n--- ZETA — S01E05 ---\nCurrent scene')
  })

  test('uses only installment labels in fandom continuity with a legacy round fallback', () => {
    expect(installmentOrRoundLabel('ZETA — S01E03', 4)).toBe('ZETA — S01E03')
    expect(installmentOrRoundLabel('', 4)).toBe('ROUND 4')
    expect(installmentOrRoundLabel('ZETA — S01E03', 4)).not.toContain('FANDOM THREAD')
  })

  test('omits the fandom notes block completely when notes are empty', () => {
    const prompt = buildThreadversePrompt({
      previousRanges: [],
      recentRange: { label: 'CURRENT RANGE', content: 'Story' },
      fandomContinuity: [],
      fandomNotes: '   ',
      instructions: 'Discuss the story.',
    })

    expect(prompt).not.toContain('>>> FANDOM NOTES <<<')
  })

  test('asks the model for separate verbose conversation groups', () => {
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
    expect(outputFormat).toContain('"conversations"')
    expect(outputFormat).toContain('"root"')
    expect(outputFormat).toContain('"replies"')
    expect(outputFormat).toContain('"parent_id"')
    expect(outputFormat).toContain('Each item in conversations is one separate top-level Reddit conversation')
    expect(outputFormat).toContain('At least 30% of all comments must be roots')
    expect(outputFormat).toContain('at least 35% must be replies')
    expect(outputFormat).not.toContain('"subreddit"')
    expect(outputFormat).not.toContain('"flair"')
    expect(outputFormat).not.toContain('"timestamp"')
  })

  test('reconstructs verbose conversation groups into separate reply trees', () => {
    const feed = parseGeneratedThreadverseFeed(JSON.stringify({
      title: 'Grouped discussion',
      post: { username: 'OP', body: 'Opening', score: 100 },
      conversations: [
        {
          root: { id: 'c1', username: 'root-a', body: 'Root A', score: 50 },
          replies: [
            { id: 'c1-r1', parent_id: 'c1', username: 'reply-a', body: 'Reply A', score: 30 },
            { id: 'c1-r2', parent_id: 'c1-r1', username: 'nested-a', body: 'Nested A', score: 20 },
          ],
        },
        {
          root: { id: 'c2', username: 'root-b', body: 'Root B', score: 45 },
          replies: [
            { id: 'c2-r1', parent_id: 'c2', username: 'reply-b', body: 'Reply B', score: 25 },
          ],
        },
        {
          root: { id: 'c3', username: 'root-c', body: 'Root C', score: 40 },
          replies: [
            { id: 'c3-r1', parent_id: 'c3', username: 'reply-c', body: 'Reply C', score: 15 },
          ],
        },
      ],
    }))

    expect(feed.comments.map((comment) => comment.username)).toEqual(['root-a', 'root-b', 'root-c'])
    expect(feed.comments[0].replies[0].username).toBe('reply-a')
    expect(feed.comments[0].replies[0].replies[0].username).toBe('nested-a')
    expect(feed.comments[1].replies[0].username).toBe('reply-b')
    expect(feed.comments[2].replies[0].username).toBe('reply-c')
  })

  test('repairs an invalid conversation parent back to its local root', () => {
    const feed = parseGeneratedThreadverseFeed(JSON.stringify({
      title: 'Repaired discussion',
      post: { username: 'OP', body: 'Opening', score: 100 },
      conversations: [
        {
          root: { id: 'c1', username: 'root-a', body: 'Root A', score: 50 },
          replies: [{ id: 'c1-r1', parent_id: 'not-in-this-conversation', username: 'reply-a', body: 'Reply A', score: 30 }],
        },
        {
          root: { id: 'c2', username: 'root-b', body: 'Root B', score: 45 },
          replies: [{ id: 'c2-r1', parent_id: 'c2', username: 'reply-b', body: 'Reply B', score: 25 }],
        },
        {
          root: { id: 'c3', username: 'root-c', body: 'Root C', score: 40 },
          replies: [{ id: 'c3-r1', parent_id: 'c3', username: 'reply-c', body: 'Reply C', score: 15 }],
        },
      ],
    }))

    expect(feed.comments[0].replies[0].username).toBe('reply-a')
  })

  test('rejects a generated discussion that turns almost everything into replies', () => {
    const conversations = Array.from({ length: 3 }, (_, conversationIndex) => {
      const rootId = `c${conversationIndex + 1}`
      const replyCount = conversationIndex < 2 ? 3 : 2
      return {
        root: {
          id: rootId,
          username: `root-${conversationIndex + 1}`,
          body: `Root ${conversationIndex + 1}`,
          score: 20,
        },
        replies: Array.from({ length: replyCount }, (_, replyIndex) => ({
          id: `${rootId}-r${replyIndex + 1}`,
          parent_id: rootId,
          username: `reply-${conversationIndex + 1}-${replyIndex + 1}`,
          body: `Reply ${replyIndex + 1}`,
          score: 10,
        })),
      }
    })

    expect(() => parseGeneratedThreadverseFeed(JSON.stringify({
      title: 'Too many replies',
      post: { username: 'OP', body: 'Opening', score: 100 },
      conversations,
    }))).toThrow('reply-heavy discussion')
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

  test('reconstructs positional parent indexes into the exact reply tree', () => {
    const feed = parseGeneratedThreadverseFeed(JSON.stringify({
      title: 'Episode discussion',
      post: { username: 'OP', body: 'Opening', score: 100 },
      comments: [
        [0, 'root-a', 'Root A', 50],
        [1, 'reply-a', 'Reply to A', 30],
        [2, 'reply-a-2', 'Reply to the reply', 20],
        [0, 'root-b', 'Root B', 45],
        [4, 'reply-b', 'Reply to B', 25],
        [0, 'root-c', 'Root C', 40],
        ['6', 'reply-c', 'Reply to C', 15],
      ],
    }))

    expect(feed.comments.map((comment) => comment.username)).toEqual(['root-a', 'root-b', 'root-c'])
    expect(feed.comments[0].replies[0].username).toBe('reply-a')
    expect(feed.comments[0].replies[0].replies[0].username).toBe('reply-a-2')
    expect(feed.comments[1].replies[0].username).toBe('reply-b')
    expect(feed.comments[2].replies[0].username).toBe('reply-c')
  })

  test('keeps old zero-based parent rows compatible', () => {
    const feed = parseThreadverseFeed(JSON.stringify({
      title: 'Legacy indexes',
      post: { username: 'OP', body: 'Opening', score: 10 },
      comments: [
        [-1, 'root', 'Root', 3],
        [0, 'reply', 'Reply', 2],
        [1, 'nested', 'Nested reply', 1],
      ],
    }))

    expect(feed.comments[0].replies[0].username).toBe('reply')
    expect(feed.comments[0].replies[0].replies[0].username).toBe('nested')
  })

  test('repairs the mixed one-based format produced with the old root marker', () => {
    const feed = parseGeneratedThreadverseFeed(JSON.stringify({
      title: 'Mixed indexes',
      post: { username: 'OP', body: 'Opening', score: 10 },
      comments: [
        [-1, 'root-a', 'Root A', 6],
        [1, 'reply-a', 'Reply A', 5],
        [-1, 'root-b', 'Root B', 4],
        [3, 'reply-b', 'Reply B', 3],
        [-1, 'root-c', 'Root C', 2],
        [5, 'reply-c', 'Reply C', 1],
      ],
    }))

    expect(feed.comments.map((comment) => comment.username)).toEqual(['root-a', 'root-b', 'root-c'])
    expect(feed.comments.map((comment) => comment.replies[0]?.username)).toEqual([
      'reply-a',
      'reply-b',
      'reply-c',
    ])
  })

  test('rejects a generated discussion that is too flat', () => {
    const positionalComments = Array.from({ length: 10 }, (_, index) => [
      -1,
      `user-${index}`,
      `Comment ${index}`,
      index,
    ])

    expect(() => parseGeneratedThreadverseFeed(JSON.stringify({
      title: 'Flat discussion',
      post: { username: 'OP', body: 'Opening', score: 10 },
      comments: positionalComments,
    }))).toThrow('flat discussion')

    const legacyComments = Array.from({ length: 10 }, (_, index) => ({
      username: `legacy-${index}`,
      body: `Comment ${index}`,
      score: index,
    }))
    expect(() => parseGeneratedThreadverseFeed(JSON.stringify({
      title: 'Flat legacy discussion',
      post: { username: 'OP', body: 'Opening', score: 10 },
      comments: legacyComments,
    }))).toThrow('flat discussion')
  })

  test('requires replies across separate top-level conversations', () => {
    expect(() => parseGeneratedThreadverseFeed(JSON.stringify({
      title: 'Single branch',
      post: { username: 'OP', body: 'Opening', score: 10 },
      comments: [
        [-1, 'root', 'Root', 10],
        [0, 'reply-1', 'Reply 1', 9],
        [1, 'reply-2', 'Reply 2', 8],
        [2, 'reply-3', 'Reply 3', 7],
        [3, 'reply-4', 'Reply 4', 6],
        [4, 'reply-5', 'Reply 5', 5],
      ],
    }))).toThrow('at least 3 are required')
  })

  test('reconstructs positional comments that appear before their parent', () => {
    const feed = parseThreadverseFeed(JSON.stringify({
      title: 'Out-of-order parent',
      post: { username: 'OP', body: 'Opening', score: 10 },
      comments: [
        [0, 'root-a', 'Root A', 4],
        [4, 'reply-b', 'Reply before root B', 3],
        [0, 'root-c', 'Root C', 2],
        [0, 'root-b', 'Root B', 1],
      ],
    }))

    expect(feed.comments.map((comment) => comment.username)).toEqual(['root-a', 'root-c', 'root-b'])
    expect(feed.comments[2].replies[0].username).toBe('reply-b')
  })

  test('repairs a self parent marker as a top-level comment', () => {
    const feed = parseThreadverseFeed(JSON.stringify({
      title: 'Self root marker',
      post: { username: 'OP', body: 'Opening', score: 10 },
      comments: [
        [0, 'root-a', 'Root A', 3],
        [2, 'root-b', 'Root B', 2],
        [2, 'reply-b', 'Reply to B', 1],
      ],
    }))

    expect(feed.comments.map((comment) => comment.username)).toEqual(['root-a', 'root-b'])
    expect(feed.comments[1].replies[0].username).toBe('reply-b')
  })

  test('rejects nonexistent parent rows and parent cycles', () => {
    expect(() => parseThreadverseFeed(JSON.stringify({
      title: 'Missing parent',
      post: { username: 'OP', body: 'Opening', score: 10 },
      comments: [
        [0, 'root', 'Root', 2],
        [99, 'reply', 'Impossible reply', 1],
      ],
    }))).toThrow('invalid parent index (99)')

    expect(() => parseThreadverseFeed(JSON.stringify({
      title: 'Parent cycle',
      post: { username: 'OP', body: 'Opening', score: 10 },
      comments: [
        [0, 'root', 'Root', 3],
        [3, 'cycle-a', 'Cycle A', 2],
        [2, 'cycle-b', 'Cycle B', 1],
      ],
    }))).toThrow('parent cycle')
  })

  test('serializes compact fandom continuity text with scores in reading order', () => {
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
    expect(serialized).toBe(
      'Discussion\n\nOP [10]:\nOpening\n\nroot [5]:\nRoot\n\nparent [4]:\nParent\n\nreply [2]:\nReply',
    )
    expect(serialized).not.toContain('"username"')
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
