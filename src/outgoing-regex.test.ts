import { describe, expect, test } from 'bun:test'
import type { RegexScriptDTO } from 'lumiverse-spindle-types'
import type { ChatMessageSummary } from './shared'
import {
  applyOutgoingRegexToMessages,
  compareRegexScripts,
  isSupportedOutgoingRegex,
  regexAppliesToChat,
} from './outgoing-regex'

function regexScript(overrides: Partial<RegexScriptDTO>): RegexScriptDTO {
  return {
    id: 'regex-1',
    can_mutate: true,
    name: 'Test regex',
    script_id: '',
    find_regex: 'foo',
    replace_string: 'bar',
    flags: 'g',
    placement: ['user_input'],
    scope: 'global',
    scope_id: null,
    target: 'prompt',
    min_depth: null,
    max_depth: null,
    trim_strings: [],
    run_on_edit: false,
    substitute_macros: 'none',
    disabled: false,
    sort_order: 0,
    description: '',
    folder: '',
    metadata: {},
    created_at: 0,
    updated_at: 0,
    ...overrides,
  }
}

const messages: ChatMessageSummary[] = [
  { id: 'm1', index: 1, role: 'user', content: 'foo user' },
  { id: 'm2', index: 2, role: 'assistant', content: 'foo assistant' },
]

describe('outgoing story regex', () => {
  test('applies scripts only to matching message placements without mutating stored messages', async () => {
    const result = await applyOutgoingRegexToMessages(messages, [regexScript({})], 2)

    expect(result.map((message) => message.content)).toEqual(['bar user', 'foo assistant'])
    expect(messages.map((message) => message.content)).toEqual(['foo user', 'foo assistant'])
  })

  test('matches global, character, and chat scopes against the active chat', () => {
    const chat = { id: 'chat-1', character_id: 'character-1' }
    expect(regexAppliesToChat(regexScript({ scope: 'global' }), chat)).toBe(true)
    expect(regexAppliesToChat(regexScript({ scope: 'character', scope_id: 'character-1' }), chat)).toBe(true)
    expect(regexAppliesToChat(regexScript({ scope: 'character', scope_id: 'character-2' }), chat)).toBe(false)
    expect(regexAppliesToChat(regexScript({ scope: 'chat', scope_id: 'chat-1' }), chat)).toBe(true)
    expect(regexAppliesToChat(regexScript({ scope: 'chat', scope_id: 'chat-2' }), chat)).toBe(false)
    expect(regexAppliesToChat(regexScript({ scope: 'character', scope_id: 'character-1' }), null)).toBe(false)
  })

  test('sorts scripts by native scope and script order', () => {
    const scripts = [
      regexScript({ id: 'chat', scope: 'chat', sort_order: 0 }),
      regexScript({ id: 'global-late', scope: 'global', sort_order: 2 }),
      regexScript({ id: 'character', scope: 'character', sort_order: 0 }),
      regexScript({ id: 'global-first', scope: 'global', sort_order: 1 }),
    ].sort(compareRegexScripts)
    expect(scripts.map((script) => script.id)).toEqual([
      'global-first',
      'global-late',
      'character',
      'chat',
    ])
  })

  test('uses a selected prompt script regardless of its native scope or enabled state', async () => {
    const result = await applyOutgoingRegexToMessages(messages, [
      regexScript({
        scope: 'character',
        scope_id: 'character-1',
        disabled: true,
      }),
    ], 2)

    expect(result.map((message) => message.content)).toEqual(['bar user', 'foo assistant'])
  })

  test('preserves active-script order and honors depth limits and trim strings', async () => {
    const result = await applyOutgoingRegexToMessages(messages, [
      regexScript({
        id: 'first',
        placement: ['user_input', 'ai_output'],
        find_regex: 'foo',
        replace_string: 'bar[trim]',
        trim_strings: ['[trim]'],
      }),
      regexScript({
        id: 'second',
        placement: ['user_input', 'ai_output'],
        find_regex: 'bar',
        replace_string: 'baz',
        min_depth: 0,
        max_depth: 0,
      }),
    ], 2)

    expect(result.map((message) => message.content)).toEqual(['bar user', 'baz assistant'])
  })

  test('skips an invalid script and continues with the remaining scripts', async () => {
    const warnings: string[] = []
    const result = await applyOutgoingRegexToMessages(messages, [
      regexScript({ id: 'broken', name: 'Broken', find_regex: '[', placement: ['user_input'] }),
      regexScript({ id: 'working', find_regex: 'foo', replace_string: 'ok', placement: ['user_input'] }),
    ], 2, undefined, (warning) => warnings.push(warning))

    expect(result[0].content).toBe('ok user')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('Broken')
  })

  test('hides prompt activation, match-action, and non-story scripts', () => {
    expect(isSupportedOutgoingRegex(regexScript({}))).toBe(true)
    expect(isSupportedOutgoingRegex(regexScript({ placement: ['reasoning'] }))).toBe(false)
    expect(isSupportedOutgoingRegex(regexScript({
      metadata: { prompt_activation: { mappings: [] } },
    }))).toBe(false)
    expect(isSupportedOutgoingRegex(regexScript({
      metadata: { match_actions: ['move_top'] },
    }))).toBe(false)
  })

  test('resolves find, raw, escaped, and after macros with native ordering', async () => {
    const resolveMacros = async (template: string) => template
      .replaceAll('{{needle}}', 'foo')
      .replaceAll('{{literalDollar}}', '$1')
      .replaceAll('{{wrap::foo}}', '<foo>')

    const findResult = await applyOutgoingRegexToMessages(messages, [
      regexScript({ find_regex: '{{needle}}', replace_string: 'found', substitute_macros: 'find' }),
    ], 2, resolveMacros)
    expect(findResult[0].content).toBe('found user')

    const rawResult = await applyOutgoingRegexToMessages(messages, [
      regexScript({
        id: 'raw',
        find_regex: '(foo)',
        replace_string: '{{wrap::$1}}',
        substitute_macros: 'raw',
      }),
      regexScript({ id: 'after-raw', find_regex: '<foo>', replace_string: 'raw-resolved' }),
    ], 2, resolveMacros)
    expect(rawResult[0].content).toBe('raw-resolved user')

    const escapedResult = await applyOutgoingRegexToMessages(messages, [
      regexScript({
        find_regex: '(foo)',
        replace_string: '{{literalDollar}}',
        substitute_macros: 'escaped',
      }),
    ], 2, resolveMacros)
    expect(escapedResult[0].content).toBe('$1 user')

    const afterResult = await applyOutgoingRegexToMessages(messages, [
      regexScript({
        id: 'after',
        find_regex: '(foo)',
        replace_string: '{{wrap::$1}}',
        substitute_macros: 'after',
      }),
      regexScript({ id: 'after-after', find_regex: '<foo>', replace_string: 'after-resolved' }),
    ], 2, resolveMacros)
    expect(afterResult[0].content).toBe('after-resolved user')
  })

  test('times out a pathological regex without blocking later scripts', async () => {
    const warnings: string[] = []
    const pathologicalMessages: ChatMessageSummary[] = [{
      id: 'slow',
      index: 1,
      role: 'user',
      content: `${'a'.repeat(50_000)}!`,
    }]
    const result = await applyOutgoingRegexToMessages(pathologicalMessages, [
      regexScript({ id: 'slow', name: 'Slow', find_regex: '(a+)+$', replace_string: 'never' }),
      regexScript({ id: 'working', find_regex: '!$', replace_string: '?' }),
    ], 1, undefined, (warning) => warnings.push(warning))

    expect(result[0].content.endsWith('?')).toBe(true)
    expect(warnings.some((warning) => warning.includes('exceeded 500ms'))).toBe(true)
  }, 3_000)
})
