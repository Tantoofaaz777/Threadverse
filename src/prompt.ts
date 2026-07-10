export interface StoryRange {
  label: string
  content: string
}

export interface FandomThread {
  label: string
  content: string
}

export interface ThreadversePromptInput {
  previousRanges: StoryRange[]
  recentRange: StoryRange
  fandomContinuity: FandomThread[]
  instructions: string
}

function renderBlocks<T extends { label: string; content: string }>(items: T[]): string {
  if (items.length === 0) return ''

  return items
    .map((item) => `--- ${item.label} ---\n${item.content.trim()}`)
    .join('\n\n')
}

export function buildThreadversePrompt(input: ThreadversePromptInput): string {
  return [
    '>>> PREVIOUS CONTEXT <<<',
    renderBlocks(input.previousRanges),
    '>>> RECENT CONTEXT <<<',
    renderBlocks([input.recentRange]),
    '>>> FANDOM CONTINUITY <<<',
    renderBlocks(input.fandomContinuity),
    '>>> INSTRUCTIONS <<<',
    input.instructions.trim(),
  ].join('\n\n')
}

