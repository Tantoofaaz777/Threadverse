import type { ThreadverseComment, ThreadverseFeed } from './shared'

type JsonObject = Record<string, unknown>

function asObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`)
  }
  return value as JsonObject
}

function stringFrom(object: JsonObject, keys: string[], label: string): string {
  for (const key of keys) {
    const value = object[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  throw new Error(`${label} is missing.`)
}

function scoreFrom(object: JsonObject): number {
  const value = object.score ?? object.upvotes ?? object.votes
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0
}

function extractJsonObject(text: string): string {
  const unfenced = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const start = unfenced.indexOf('{')
  if (start < 0) throw new Error('The model response did not contain a JSON object.')
  let depth = 0
  let quoted = false
  let escaped = false
  for (let index = start; index < unfenced.length; index += 1) {
    const character = unfenced[index]
    if (quoted) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') quoted = false
      continue
    }
    if (character === '"') quoted = true
    else if (character === '{') depth += 1
    else if (character === '}' && --depth === 0) return unfenced.slice(start, index + 1)
  }
  throw new Error('The model response contained incomplete JSON.')
}

export function parseThreadverseFeed(text: string): ThreadverseFeed {
  let parsed: unknown
  try {
    parsed = JSON.parse(extractJsonObject(text))
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('The model response')) throw error
    throw new Error('The model returned invalid JSON.')
  }
  const root = asObject(parsed, 'Feed')
  const post = asObject(root.post ?? root.openingPost ?? root.opening_post, 'Post')
  const rawComments = root.comments
  if (!Array.isArray(rawComments)) throw new Error('Feed comments must be a JSON array.')
  let totalComments = 0

  const parseComment = (value: unknown, depth: number): ThreadverseComment => {
    if (depth > 12 || totalComments >= 500) throw new Error('The generated comment tree is too large.')
    totalComments += 1
    const comment = asObject(value, 'Comment')
    const replies = comment.replies ?? comment.children ?? []
    if (!Array.isArray(replies)) throw new Error('Comment replies must be a JSON array.')
    return {
      username: stringFrom(comment, ['username', 'author', 'user'], 'Comment username'),
      body: stringFrom(comment, ['body', 'content', 'text'], 'Comment body'),
      score: scoreFrom(comment),
      replies: replies.map((reply) => parseComment(reply, depth + 1)),
    }
  }

  return {
    title: stringFrom(root, ['title'], 'Thread title'),
    post: {
      username: stringFrom(post, ['username', 'author', 'user'], 'Post username'),
      body: stringFrom(post, ['body', 'content', 'text'], 'Post body'),
      score: scoreFrom(post),
    },
    comments: rawComments.map((comment) => parseComment(comment, 0)),
  }
}

export function serializeFeedForContinuity(feed: ThreadverseFeed): string {
  const serializeComment = (comment: ThreadverseComment): JsonObject => {
    const serialized: JsonObject = {
      username: comment.username,
      body: comment.body,
      score: comment.score,
    }
    if (comment.replies.length > 0) {
      serialized.replies = comment.replies.map(serializeComment)
    }
    return serialized
  }
  return JSON.stringify({
    title: feed.title,
    post: {
      username: feed.post.username,
      body: feed.post.body,
      score: feed.post.score,
    },
    comments: feed.comments.map(serializeComment),
  })
}

export function serializeFeedAsPlainText(feed: ThreadverseFeed): string {
  const comments: string[] = []
  const appendComments = (items: ThreadverseComment[]): void => {
    for (const comment of items) {
      comments.push(`${comment.username}:\n${comment.body}`)
      appendComments(comment.replies)
    }
  }
  appendComments(feed.comments)

  return [
    feed.title,
    `${feed.post.username}:\n${feed.post.body}`,
    ...comments,
  ].join('\n\n')
}
