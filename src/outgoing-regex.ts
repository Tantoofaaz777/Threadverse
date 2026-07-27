import type { RegexPlacementDTO, RegexScriptDTO } from 'lumiverse-spindle-types'
import type { ChatMessageSummary } from './shared'

const REGEX_INPUT_MAX_CHARS = 500_000

type RegexWarning = (message: string) => void

function placementForMessage(message: ChatMessageSummary): RegexPlacementDTO {
  if (message.role === 'user') return 'user_input'
  if (message.role === 'assistant') return 'ai_output'
  return 'world_info'
}

function applyScript(
  input: string,
  script: RegexScriptDTO,
  placement: RegexPlacementDTO,
  depth: number,
  warn: RegexWarning,
): string {
  if (!script.find_regex || !script.placement.includes(placement)) return input
  if (script.min_depth !== null && depth < script.min_depth) return input
  if (script.max_depth !== null && depth > script.max_depth) return input
  if (input.length > REGEX_INPUT_MAX_CHARS) {
    warn(`Regex "${script.name}" was skipped because a message exceeded ${REGEX_INPUT_MAX_CHARS} characters.`)
    return input
  }

  try {
    const expression = new RegExp(script.find_regex, script.flags || 'g')
    let output = input.replace(expression, script.replace_string ?? '')
    for (const trim of script.trim_strings ?? []) {
      if (trim) output = output.replaceAll(trim, '')
    }
    return output
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown regex error.'
    warn(`Regex "${script.name}" failed and was skipped: ${message}`)
    return input
  }
}

export function applyOutgoingRegexToMessages(
  messages: ChatMessageSummary[],
  scripts: RegexScriptDTO[],
  maxMessageIndex: number,
  warn: RegexWarning = () => undefined,
): ChatMessageSummary[] {
  if (scripts.length === 0) return messages
  return messages.map((message) => {
    const placement = placementForMessage(message)
    const depth = Math.max(0, maxMessageIndex - message.index)
    const content = scripts.reduce(
      (current, script) => applyScript(current, script, placement, depth, warn),
      message.content,
    )
    return content === message.content ? message : { ...message, content }
  })
}
