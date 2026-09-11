export function toggleMessageSelection(
  selectedIds: ReadonlySet<string>,
  messageId: string,
): Set<string> {
  const next = new Set(selectedIds)
  if (next.has(messageId)) next.delete(messageId)
  else next.add(messageId)
  return next
}

export function addMessageRange(
  selectedIds: ReadonlySet<string>,
  orderedMessageIds: readonly string[],
  anchorId: string,
  targetId: string,
  unavailableIds: ReadonlySet<string> = new Set(),
): Set<string> {
  const anchorIndex = orderedMessageIds.indexOf(anchorId)
  const targetIndex = orderedMessageIds.indexOf(targetId)
  if (anchorIndex < 0 || targetIndex < 0) return new Set(selectedIds)

  const first = Math.min(anchorIndex, targetIndex)
  const last = Math.max(anchorIndex, targetIndex)
  const next = new Set(selectedIds)
  for (const messageId of orderedMessageIds.slice(first, last + 1)) {
    if (!unavailableIds.has(messageId)) next.add(messageId)
  }
  return next
}

export function orderSelectedMessageIds(
  orderedMessageIds: readonly string[],
  requestedIds: readonly string[],
): string[] | null {
  if (requestedIds.length === 0) return null
  const requested = new Set(requestedIds)
  if (requested.size !== requestedIds.length) return null
  const ordered = orderedMessageIds.filter((messageId) => requested.has(messageId))
  return ordered.length === requested.size ? ordered : null
}
