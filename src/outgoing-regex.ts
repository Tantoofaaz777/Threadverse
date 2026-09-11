import type { RegexPlacementDTO, RegexScriptDTO } from 'lumiverse-spindle-types'
import type { ChatMessageSummary } from './shared'

const REGEX_INPUT_MAX_CHARS = 500_000
const REGEX_EXECUTION_TIMEOUT_MS = 500
const STORY_PLACEMENTS: ReadonlySet<RegexPlacementDTO> = new Set([
  'user_input',
  'ai_output',
  'world_info',
])

type RegexWarning = (message: string) => void
export type RegexMacroResolver = (template: string) => Promise<string>

interface RegexChatScope {
  id: string
  character_id?: string | null
}

interface RegexWorkerRequest {
  id: number
  op: 'replace' | 'capture-replacements'
  pattern: string
  flags: string
  input: string
  replacement: string
  literalReplacement?: boolean
}

interface RegexWorkerResponse {
  id: number
  ok: boolean
  output?: string
  replacements?: Array<{ index: number; matchLength: number; replacement: string }>
  error?: string
}

const REGEX_WORKER_SOURCE = String.raw`
const MAX_MATCHES = 20000;

function substitute(template, match, input) {
  const fullMatch = match[0];
  const groups = Array.from(match).slice(1);
  const namedGroups = match.groups;
  return template.replace(
    /\$(?:(\$)|(&)|(\`)|(')|(\d{1,2})|<([^>]*)>)/g,
    (token, dollar, amp, backtick, quote, digits, name) => {
      if (dollar !== undefined) return '$';
      if (amp !== undefined) return fullMatch;
      if (backtick !== undefined) return input.slice(0, match.index);
      if (quote !== undefined) return input.slice(match.index + fullMatch.length);
      if (digits !== undefined) {
        const index = Number.parseInt(digits, 10);
        return index >= 1 && index <= groups.length ? (groups[index - 1] ?? '') : token;
      }
      if (name !== undefined && namedGroups && Object.prototype.hasOwnProperty.call(namedGroups, name)) {
        return namedGroups[name] ?? '';
      }
      return token;
    },
  );
}

function advanceAfterEmptyMatch(regex, input) {
  if (!regex.unicode) {
    regex.lastIndex += 1;
    return;
  }
  const first = input.charCodeAt(regex.lastIndex);
  if (first >= 0xD800 && first <= 0xDBFF) {
    const second = input.charCodeAt(regex.lastIndex + 1);
    regex.lastIndex += second >= 0xDC00 && second <= 0xDFFF ? 2 : 1;
  } else {
    regex.lastIndex += 1;
  }
}

function captureReplacements(input, regex, replacement) {
  const replacements = [];
  const append = (match) => {
    if (replacements.length >= MAX_MATCHES) throw new Error('Regex match limit exceeded');
    replacements.push({
      index: match.index,
      matchLength: match[0].length,
      replacement: substitute(replacement, match, input),
    });
  };

  if (regex.global || regex.sticky) {
    let match;
    while ((match = regex.exec(input)) !== null) {
      append(match);
      if (match[0].length === 0) advanceAfterEmptyMatch(regex, input);
    }
  } else {
    const match = regex.exec(input);
    if (match) append(match);
  }
  return replacements;
}

self.onmessage = (event) => {
  const request = event.data;
  try {
    const regex = new RegExp(request.pattern, request.flags);
    if (request.op === 'replace') {
      const output = request.literalReplacement
        ? request.input.replace(regex, () => request.replacement)
        : request.input.replace(regex, request.replacement);
      self.postMessage({ id: request.id, ok: true, output });
      return;
    }
    const replacements = captureReplacements(request.input, regex, request.replacement);
    self.postMessage({ id: request.id, ok: true, replacements });
  } catch (error) {
    self.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown regex error.',
    });
  }
};
`

class RegexRunner {
  private worker: Worker | null = null
  private workerUrl: string | null = null
  private nextId = 1
  private pending: {
    id: number
    resolve: (response: RegexWorkerResponse) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  } | null = null

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const url = URL.createObjectURL(new Blob([REGEX_WORKER_SOURCE], { type: 'application/javascript' }))
    const worker = new Worker(url)
    worker.onmessage = (event: MessageEvent<RegexWorkerResponse>) => {
      if (!this.pending || event.data.id !== this.pending.id) return
      const pending = this.pending
      this.pending = null
      clearTimeout(pending.timer)
      pending.resolve(event.data)
    }
    worker.onerror = () => this.reset(new Error('Regex worker failed.'))
    this.worker = worker
    this.workerUrl = url
    return worker
  }

  private reset(error?: Error): void {
    this.worker?.terminate()
    if (this.workerUrl) URL.revokeObjectURL(this.workerUrl)
    this.worker = null
    this.workerUrl = null
    if (this.pending) {
      const pending = this.pending
      this.pending = null
      clearTimeout(pending.timer)
      pending.reject(error ?? new Error('Regex worker stopped.'))
    }
  }

  async run(request: Omit<RegexWorkerRequest, 'id'>): Promise<RegexWorkerResponse> {
    if (this.pending) throw new Error('Regex worker received overlapping requests.')
    const id = this.nextId++
    const worker = this.ensureWorker()
    const response = await new Promise<RegexWorkerResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.reset(new Error(`Regex execution exceeded ${REGEX_EXECUTION_TIMEOUT_MS}ms.`))
      }, REGEX_EXECUTION_TIMEOUT_MS)
      this.pending = { id, resolve, reject, timer }
      worker.postMessage({ ...request, id })
    })
    if (!response.ok) throw new Error(response.error || 'Unknown regex error.')
    return response
  }

  close(): void {
    this.reset()
  }
}

export function regexAppliesToChat(
  script: RegexScriptDTO,
  chat: RegexChatScope | null,
): boolean {
  if (script.scope === 'global') return true
  if (!chat) return false
  if (script.scope === 'character') return script.scope_id === chat.character_id
  return script.scope_id === chat.id
}

export function isSupportedOutgoingRegex(script: RegexScriptDTO): boolean {
  if (!script.placement.some((placement) => STORY_PLACEMENTS.has(placement))) return false
  if (script.metadata?.prompt_activation != null) return false
  if (Array.isArray(script.metadata?.match_actions) && script.metadata.match_actions.length > 0) return false
  return true
}

export function compareRegexScripts(left: RegexScriptDTO, right: RegexScriptDTO): number {
  const scopeRank = (script: RegexScriptDTO) => {
    if (script.scope === 'global') return 0
    if (script.scope === 'character') return 1
    return 2
  }
  return scopeRank(left) - scopeRank(right)
    || left.sort_order - right.sort_order
    || left.created_at - right.created_at
}

function placementForMessage(message: ChatMessageSummary): RegexPlacementDTO {
  if (message.role === 'user') return 'user_input'
  if (message.role === 'assistant') return 'ai_output'
  return 'world_info'
}

function rebuildFromReplacements(
  input: string,
  matches: Array<{ index: number; matchLength: number; replacement: string }>,
  replacements: string[],
): string {
  let output = ''
  let lastIndex = 0
  for (let index = 0; index < matches.length; index++) {
    output += input.slice(lastIndex, matches[index].index)
    output += replacements[index]
    lastIndex = matches[index].index + matches[index].matchLength
  }
  return output + input.slice(lastIndex)
}

async function applyScript(
  input: string,
  script: RegexScriptDTO,
  placement: RegexPlacementDTO,
  depth: number,
  runner: RegexRunner,
  resolveMacros: RegexMacroResolver,
  warn: RegexWarning,
  failedScripts: Set<string>,
): Promise<string> {
  if (failedScripts.has(script.id)) return input
  if (!script.find_regex || !script.placement.includes(placement)) return input
  if (script.min_depth !== null && depth < script.min_depth) return input
  if (script.max_depth !== null && depth > script.max_depth) return input
  if (input.length > REGEX_INPUT_MAX_CHARS) {
    warn(`Regex "${script.name}" was skipped because a message exceeded ${REGEX_INPUT_MAX_CHARS} characters.`)
    return input
  }

  try {
    const mode = script.substitute_macros ?? 'none'
    const findRegex = mode === 'none' ? script.find_regex : await resolveMacros(script.find_regex)
    const flags = script.flags ?? 'g'
    let output: string

    if (mode === 'raw') {
      const response = await runner.run({
        op: 'capture-replacements',
        pattern: findRegex,
        flags,
        input,
        replacement: script.replace_string ?? '',
      })
      const matches = response.replacements ?? []
      const replacements = await Promise.all(matches.map((match) => resolveMacros(match.replacement)))
      output = rebuildFromReplacements(input, matches, replacements)
    } else if (mode === 'after') {
      const response = await runner.run({
        op: 'replace',
        pattern: findRegex,
        flags,
        input,
        replacement: script.replace_string ?? '',
      })
      output = response.output ?? input
      if (output !== input) output = await resolveMacros(output)
    } else {
      const resolvesReplacement = mode !== 'none' && mode !== 'find'
      const replacement = resolvesReplacement
        ? await resolveMacros(script.replace_string ?? '')
        : script.replace_string ?? ''
      const response = await runner.run({
        op: 'replace',
        pattern: findRegex,
        flags,
        input,
        replacement,
        literalReplacement: mode === 'escaped',
      })
      output = response.output ?? input
    }

    for (const trim of script.trim_strings ?? []) {
      if (trim) output = output.replaceAll(trim, '')
    }
    return output
  } catch (error) {
    failedScripts.add(script.id)
    const message = error instanceof Error ? error.message : 'Unknown regex error.'
    warn(`Regex "${script.name}" failed and was skipped: ${message}`)
    return input
  }
}

export async function applyOutgoingRegexToMessages(
  messages: ChatMessageSummary[],
  scripts: RegexScriptDTO[],
  maxMessageIndex: number,
  resolveMacros: RegexMacroResolver = async (template) => template,
  warn: RegexWarning = () => undefined,
): Promise<ChatMessageSummary[]> {
  if (scripts.length === 0) return messages
  const runner = new RegexRunner()
  const failedScripts = new Set<string>()
  try {
    const transformed: ChatMessageSummary[] = []
    for (const message of messages) {
      const placement = placementForMessage(message)
      const depth = Math.max(0, maxMessageIndex - message.index)
      let content = message.content
      for (const script of scripts) {
        content = await applyScript(content, script, placement, depth, runner, resolveMacros, warn, failedScripts)
      }
      transformed.push(content === message.content ? message : { ...message, content })
    }
    return transformed
  } finally {
    runner.close()
  }
}
