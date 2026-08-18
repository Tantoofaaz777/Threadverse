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
    [0, "root_a", "independent top-level comment", 120],
    [1, "reply_a", "reply to row 1", 45],
    [2, "root_a", "reply to row 2", 31],
    [0, "root_b", "another independent top-level comment", 90],
    [4, "reply_b", "reply to row 4", 28],
    [0, "root_c", "another independent top-level comment", 70],
    [6, "reply_c", "reply to row 6", 19]
  ]
}
Each comment row is exactly [parent, username, body, score]. Rows are numbered starting at 1. parent is 0 ONLY for a genuinely independent top-level comment; otherwise it is the 1-based row number of the exact earlier comment being answered. At least 35% of all comment rows must be replies. With 6 or more comments, at least 3 different top-level conversations must receive replies. Threadverse rejects flatter results.
Return ONLY the JSON—no explanations, no notes, no commentary.`,
  ].join('\n\n')
}
