import { describe, expect, test } from 'bun:test'
import { emptyAo3Information, normalizeAo3Information, serializeAo3Information, type Ao3Information } from './ao3'
import { buildThreadversePrompt } from './prompt'
import { normalizeStore, resetContinuityRounds } from './state'
import { inheritContinuityForFork } from './fork-inheritance'

describe('AO3 work information', () => {
  test('recovers valid fields from damaged or older metadata without inventing selections', () => {
    expect(normalizeAo3Information(undefined)).toEqual(emptyAo3Information())
    const recovered = normalizeAo3Information({
      enabled: true, rating: 'unknown', archiveWarnings: ['Major Character Death', 'invalid', 'Major Character Death'],
      categories: ['F/M', 'invalid'], fandom: ' Harry Potter ', summary: 42,
    })
    expect(recovered.rating).toBeNull()
    expect(recovered.archiveWarnings).toEqual(['Major Character Death'])
    expect(recovered.categories).toEqual(['F/M'])
    expect(recovered.fandom).toBe(' Harry Potter ')
    expect(recovered.summary).toBe('')
  })

  test('omits disabled and empty metadata, keeping the existing prompt unchanged', () => {
    const base = { previousRanges: [], recentRange: { label: 'Chapter 1', content: 'Story' }, fandomContinuity: [], instructions: 'Discuss the story.' }
    const disabled = { ...emptyAo3Information(), fandom: 'Example fandom' }
    expect(serializeAo3Information(disabled)).toBe('')
    expect(buildThreadversePrompt({ ...base, ao3Information: disabled })).toBe(buildThreadversePrompt(base))
    expect(buildThreadversePrompt({ ...base, ao3Information: { ...disabled, enabled: true, fandom: ' ' } })).toBe(buildThreadversePrompt(base))
  })

  test('adds only filled metadata after recent context without changing the discussion output format', () => {
    const base = { previousRanges: [], recentRange: { label: 'Chapter 1', content: 'Story' }, fandomContinuity: [], instructions: 'Discuss the story.' }
    const prompt = buildThreadversePrompt({ ...base, ao3Information: {
      ...emptyAo3Information(), enabled: true, rating: 'Teen And Up Audiences',
      archiveWarnings: ['No Archive Warnings Apply'], categories: ['F/M', 'Gen'],
      fandom: ' Harry Potter ', additionalTags: 'Slow Burn\nMutual Pining',
    } })
    expect(prompt).toContain('# AO3 INFORMATIONS\n\nRating: Teen And Up Audiences')
    expect(prompt).toContain('Category: F/M, Gen')
    expect(prompt).toContain('Fandom: Harry Potter')
    expect(prompt).toContain('Additional Tags: Slow Burn\nMutual Pining')
    expect(prompt).not.toContain('Summary:')
    expect(prompt.indexOf('# AO3 INFORMATIONS')).toBeGreaterThan(prompt.indexOf('# RECENT CONTEXT'))
    expect(prompt).toContain('without assuming tagged events have already happened')
    expect(prompt.split('# OUTPUT FORMAT')[1]).toBe(buildThreadversePrompt(base).split('# OUTPUT FORMAT')[1])
  })

  test('retains disabled work information without rounds through reload and continuity reset', () => {
    const information = { ...emptyAo3Information(), fandom: 'Original Work', additionalTags: 'Slow Burn' }
    const store = normalizeStore({ version: 1, chats: {
      a: { rounds: [], ao3Information: information },
      b: { rounds: [], ao3Information: { ...information, fandom: 'Other Work' } },
    } })
    expect(store.chats.a.ao3Information).toEqual(information)
    resetContinuityRounds(store, 'a', 'Chat A')
    expect(normalizeStore(store).chats.a.ao3Information).toEqual(information)
    expect(store.chats.b.ao3Information?.fandom).toBe('Other Work')
  })

  test('forks copy the work metadata independently and preserve child overrides', () => {
    const source = { chatId: 'source', chatName: 'Source', fandomNotes: '', rounds: [], ao3Information: {
      ...emptyAo3Information(), enabled: true, categories: ['Gen'], fandom: 'Original Work',
    } as Ao3Information }
    const input = { source, forkChatId: 'child', forkChatName: 'Child', sourceChatId: 'source',
      sourceMessages: [], forkMessages: [], forkedAtMessageIndex: 0, idFactory: () => 'id' }
    const inherited = inheritContinuityForFork(input).continuity
    expect(inherited.ao3Information).toEqual(source.ao3Information)
    inherited.ao3Information!.categories.push('Multi')
    expect(source.ao3Information.categories).toEqual(['Gen'])
    const existing = { ...source, chatId: 'child', ao3Information: { ...emptyAo3Information(), title: 'Child work' } }
    expect(inheritContinuityForFork({ ...input, existing }).continuity.ao3Information).toEqual(existing.ao3Information)
  })
})
