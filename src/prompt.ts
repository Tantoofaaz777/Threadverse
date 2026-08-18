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
  "conversations": [
    {
      "root": { "id": "c1", "username": "root_a", "body": "independent top-level comment", "score": 120 },
      "replies": [
        { "id": "c1-r1", "parent_id": "c1", "username": "reply_a", "body": "direct reply to root_a", "score": 45 },
        { "id": "c1-r2", "parent_id": "c1-r1", "username": "root_a", "body": "nested reply to reply_a", "score": 31 }
      ]
    },
    {
      "root": { "id": "c2", "username": "root_b", "body": "another independent top-level comment", "score": 90 },
      "replies": [
        { "id": "c2-r1", "parent_id": "c2", "username": "reply_b", "body": "direct reply to root_b", "score": 28 }
      ]
    },
    {
      "root": { "id": "c3", "username": "root_c", "body": "another independent top-level comment", "score": 70 },
      "replies": [
        { "id": "c3-r1", "parent_id": "c3", "username": "reply_c", "body": "direct reply to root_c", "score": 19 }
      ]
    }
  ]
}
The example demonstrates structure only; scale the number of conversations and replies to the requested discussion size. Each item in conversations is one separate top-level Reddit conversation and contains exactly one root. Every reply must use parent_id equal to that conversation's root id or to the id of an earlier reply inside the SAME conversation. Never move a root into replies and never reference another conversation. At least 30% of all comments must be roots and at least 35% must be replies. With 6 or more comments, at least 3 different conversations must receive replies. Do not put the entire discussion beneath one root.
Return ONLY the JSON—no explanations, no notes, no commentary.`,
  ].join('\n\n')
}
