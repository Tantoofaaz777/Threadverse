import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { emptyAo3Information, type Ao3Information } from './ao3'
import { emptyStore, type ThreadverseStore } from './state'
import type { BackendToFrontendMessage, FrontendToBackendMessage } from './shared'

const host = globalThis as typeof globalThis & { spindle?: unknown }
const previousHost = host.spindle
let receive: (payload: FrontendToBackendMessage, userId: string) => Promise<void>
let activeChatId = 'chat-a'
const stores = new Map<string, ThreadverseStore>()
const responses: Array<{ payload: BackendToFrontendMessage; userId: string }> = []
const prompts: string[] = []
const counted: string[] = []
const information: Ao3Information = {
  ...emptyAo3Information(), enabled: true, rating: 'Teen And Up Audiences',
  categories: ['F/M'], fandom: 'Original Work', additionalTags: 'Slow Burn',
}
const connection = { id: 'connection', name: 'Test', provider: 'custom', model: 'model', is_default: true }

beforeAll(async () => {
  host.spindle = {
    permissions: { has: () => true, onChanged: () => {} },
    chats: {
      getActive: async () => ({ id: activeChatId, name: activeChatId, metadata: {} }),
      get: async (id: string) => id.startsWith('chat-') ? { id, name: id, metadata: {} } : null,
    },
    chat: { getMessages: async () => [{ id: 'm1', role: 'assistant', content: 'The story scene.', index_in_chat: 0 }] },
    connections: { list: async () => [connection] },
    tokens: { countText: async (text: string) => { counted.push(text); return { total_tokens: text.length } } },
    macros: { resolve: async (text: string) => ({ text, diagnostics: [] }) },
    regex_scripts: { list: async () => ({ data: [], total: 0 }) },
    userStorage: {
      getJson: async (_path: string, options: { userId: string }) => structuredClone(stores.get(options.userId) ?? emptyStore()),
      setJson: async (_path: string, store: ThreadverseStore, options: { userId: string }) => { stores.set(options.userId, structuredClone(store)) },
    },
    generate: { quietStream: async function* (options: { messages: Array<{ content: string }> }) {
      prompts.push(options.messages[0].content)
      yield { type: 'done', content: JSON.stringify({ title: 'Discussion', post: { username: 'op', body: 'Post', score: 1 },
        conversations: ['a', 'b', 'c'].map((id) => ({ root: { id, username: id, body: 'Root', score: 1 },
          replies: [{ id: `${id}-r`, parent_id: id, username: 'reader', body: 'Reply', score: 1 }] })) }) }
    } },
    sendToFrontend: (payload: BackendToFrontendMessage, userId: string) => { responses.push({ payload, userId }) },
    onFrontendMessage: (handler: typeof receive) => { receive = handler },
    on: () => {}, log: { info: () => {}, warn: () => {}, error: () => {} }, toast: { success: () => {}, error: () => {} },
  }
  await import('./backend')
})
afterAll(() => { host.spindle = previousHost })
beforeEach(() => { stores.clear(); responses.length = 0; prompts.length = 0; counted.length = 0; activeChatId = 'chat-a' })

async function save(chatId = 'chat-a', value = information, userId = 'user') {
  await receive({ type: 'threadverse:save_ao3_information', chatId, chatName: chatId, information: value, requestId: 1 }, userId)
}

describe('AO3 backend integration', () => {
  test('saves metadata per chat and per user and restores it on active-chat loads', async () => {
    await save()
    await save('chat-b', { ...information, title: 'Other chat' })
    await save('chat-a', { ...information, title: 'Other user' }, 'other-user')
    await receive({ type: 'threadverse:load_active_chat', requestId: 1 }, 'user')
    const response = responses.at(-1)!.payload
    expect(response.type).toBe('threadverse:active_chat')
    if (response.type === 'threadverse:active_chat') expect(response.ao3Information).toEqual(information)
    expect(stores.get('user')!.chats['chat-b'].ao3Information?.title).toBe('Other chat')
    expect(stores.get('other-user')!.chats['chat-a'].ao3Information?.title).toBe('Other user')
  })

  test('preserves disabled metadata through empty notes, prompt saves and continuity reset', async () => {
    await save('chat-a', { ...information, enabled: false })
    await receive({ type: 'threadverse:save_fandom_notes', chatId: 'chat-a', chatName: 'A', notes: '' }, 'user')
    await receive({ type: 'threadverse:save_prompt', settings: { instructionPresets: [
      { id: 'new', name: 'New', instructions: 'Comments' },
    ], activeInstructionPresetId: 'new' } }, 'user')
    await receive({ type: 'threadverse:reset_continuity', chatId: 'chat-a' }, 'user')
    expect(stores.get('user')!.chats['chat-a'].ao3Information).toEqual({ ...information, enabled: false })
  })

  test('uses the latest draft in token preview and generation before autosave completes', async () => {
    await receive({ type: 'threadverse:count_recent_context_tokens', requestId: 1, chatId: 'chat-a',
      connectionId: 'connection', messageIds: ['m1'], text: 'The story scene.', installmentLabel: 'Chapter 1',
      fandomNotes: '', settings: null, ao3Information: information }, 'user')
    const preview = responses.at(-1)!.payload
    expect(preview.type).toBe('threadverse:recent_context_tokens')
    if (preview.type === 'threadverse:recent_context_tokens') expect(preview.fullPromptTokens).not.toBeNull()
    const previewPrompt = counted.find((text) => text.includes('# AO3 INFORMATIONS'))!
    expect(previewPrompt).toContain('Additional Tags: Slow Burn')
    await receive({ type: 'threadverse:generate_thread', chatId: 'chat-a', messageIds: ['m1'],
      installmentLabel: 'Chapter 1', ao3Information: information }, 'user')
    expect(prompts[0]).toBe(previewPrompt)
    expect(stores.get('user')!.chats['chat-a'].rounds).toHaveLength(1)
    expect(prompts[0]).toContain('top-level Reddit conversation')
  })

  test('regeneration uses saved metadata and a disabled draft omits the block without erasing fields', async () => {
    await save()
    await receive({ type: 'threadverse:generate_thread', chatId: 'chat-a', messageIds: ['m1'] }, 'user')
    const roundId = stores.get('user')!.chats['chat-a'].rounds[0].id
    await receive({ type: 'threadverse:regenerate_thread', chatId: 'chat-a', roundId }, 'user')
    expect(prompts[1]).toContain('# AO3 INFORMATIONS')
    await receive({ type: 'threadverse:regenerate_thread', chatId: 'chat-a', roundId,
      ao3Information: { ...information, enabled: false } }, 'user')
    expect(prompts[2]).not.toContain('# AO3 INFORMATIONS')
    expect(stores.get('user')!.chats['chat-a'].ao3Information).toEqual(information)
    expect(stores.get('user')!.chats['chat-a'].rounds[0].feedVersions).toHaveLength(3)
    await receive({ type: 'threadverse:delete_round', chatId: 'chat-a', roundId }, 'user')
    expect(stores.get('user')!.chats['chat-a'].ao3Information).toEqual(information)
  })

  test('rejects metadata saves for missing chats and keeps existing metadata intact', async () => {
    await save()
    await save('missing')
    const result = responses.at(-1)!.payload
    expect(result.type).toBe('threadverse:ao3_information_save_result')
    if (result.type === 'threadverse:ao3_information_save_result') expect(result.error).toBeTruthy()
    expect(stores.get('user')!.chats['chat-a'].ao3Information).toEqual(information)
  })
})
