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
    '>>> OUTPUT FORMAT <<<',
    `You must respond with ONLY valid JSON in this exact format:
{
  "subreddit": "community name without r/",
  "title": "thread title",
  "post": { "username": "name", "body": "text", "score": 0, "flair": null, "timestamp": null },
  "comments": [
    { "id": "unique-id", "username": "name", "body": "text", "score": 0, "flair": null, "timestamp": null, "replies": [] }
  ]
}
Return ONLY the JSON—no explanations, no notes, no commentary.`,
  ].join('\n\n')
}
