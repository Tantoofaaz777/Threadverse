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
  fandomNotes?: string
  instructions: string
}

function renderBlocks<T extends { label: string; content: string }>(items: T[]): string {
  if (items.length === 0) return ''

  return items
    .map((item) => `--- ${item.label} ---\n${item.content.trim()}`)
    .join('\n\n---\n\n')
}

export function groupConsecutiveStoryRanges(items: StoryRange[]): StoryRange[] {
  const grouped: StoryRange[] = []
  for (const item of items) {
    const previous = grouped.at(-1)
    if (previous?.label === item.label) {
      previous.content = `${previous.content.trim()}\n\n${item.content.trim()}`
    } else {
      grouped.push({ ...item })
    }
  }
  return grouped
}

export function installmentOrRoundLabel(installmentLabel: string, sequence: number): string {
  return installmentLabel || `ROUND ${sequence}`
}

export function buildThreadversePrompt(input: ThreadversePromptInput): string {
  const fandomNotes = input.fandomNotes?.trim() ?? ''
  return [
    '>>> PREVIOUS CONTEXT <<<',
    renderBlocks(input.previousRanges),
    '>>> RECENT CONTEXT <<<',
    renderBlocks([input.recentRange]),
    '>>> FANDOM CONTINUITY <<<',
    renderBlocks(input.fandomContinuity),
    ...(fandomNotes ? ['>>> FANDOM NOTES <<<', fandomNotes] : []),
    '>>> INSTRUCTIONS <<<',
    input.instructions.trim(),
    '>>> OUTPUT FORMAT <<<',
    `You must respond with ONLY valid JSON in this exact format:
{
  "title": "thread title",
  "post": { "username": "name", "body": "text", "score": 0 },
  "comments": [
    { "username": "name", "body": "text", "score": 0 },
    { "username": "name", "body": "text", "score": 0, "replies": [
      { "username": "name", "body": "text", "score": 0 }
    ] }
  ]
}
Reply nesting is semantic: every reply MUST be inside the "replies" array of the exact comment it answers. Items in the same array are sibling replies to the same parent.
Return ONLY the JSON—no explanations, no notes, no commentary.`,
  ].join('\n\n')
}
